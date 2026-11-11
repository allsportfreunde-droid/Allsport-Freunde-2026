"use client";

import { useState, useRef } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EventWithRegistrations } from "@/lib/types";
import { BadgePercent, CheckCircle2, Euro, Loader2, Plus, X, Users } from "lucide-react";
import { LastNameInput } from "@/components/ui/LastNameInput";
import HoneypotFields from "@/components/HoneypotFields";
import { formatEuro } from "@/lib/finance";
import { formatEventPrice } from "@/lib/price";
import { calculatePersonsPrice } from "@/lib/price-tiers";
import { useDiscountPreview } from "@/components/registration/useDiscountPreview";
import DiscountNotice from "@/components/registration/DiscountNotice";
import PriceSummary from "@/components/PriceSummary";
import DiscountRequestFields, {
  emptyDiscountRequest,
  isDiscountRequestComplete,
  type DiscountRequestDraft,
} from "@/components/registration/DiscountRequestFields";
import ProofUpload from "@/components/registration/ProofUpload";
import { uploadProof } from "@/components/registration/proofFile";
import { calculateTierPrices, DISCOUNTS } from "@/lib/price-tiers";
import { DISCOUNT_REQUEST_CONSENT_TEXT } from "@/lib/discount-requests";
import { cancellationDeadline, formatDeadline } from "@/lib/cancellation";

interface Person {
  firstName: string;
  lastName: string;
  /** true = Kind (U18). Default ist "Nein", also ein Erwachsener. */
  isChild: boolean;
  /** Ermäßigungsantrag – nur für Personen, die nicht schon erkannt wurden. */
  discountRequest: DiscountRequestDraft;
}

const emptyPerson = (): Person => ({ firstName: "", lastName: "", isChild: false, discountRequest: emptyDiscountRequest() });

/** Fortschritt der Nachweis-Uploads nach dem Absenden. */
interface UploadState {
  running: boolean;
  /** Je fehlgeschlagenem Upload: Name und Grund. */
  failed: Array<{ name: string; requestId: number; error: string }>;
}

interface RegistrationModalProps {
  event: EventWithRegistrations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function RegistrationModal({
  event,
  open,
  onOpenChange,
  onSuccess,
}: RegistrationModalProps) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [persons, setPersons] = useState<Person[]>([emptyPerson()]);
  const firstNameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [statusToken, setStatusToken] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [discountConsent, setDiscountConsent] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);

  const maxPerEmail = event?.max_per_email ?? 5;
  // Nur Vorschau – beim Absenden gleicht der Server selbst mit der Liste ab.
  const discountPreview = useDiscountPreview(email, persons);
  /** Beantragte Ermäßigung einer Person – nur, wenn sie nicht schon erkannt wurde. */
  const requestedDiscount = (idx: number) => {
    const draft = persons[idx]?.discountRequest;
    return !discountPreview[idx] && draft?.open && draft.discount ? draft.discount : null;
  };
  const hasOpenRequest = persons.some((p, idx) => !discountPreview[idx] && p.discountRequest.open);

  const resetForm = () => {
    setEmail("");
    setPhone("");
    setPersons([emptyPerson()]);
    setAccepted(false);
    setError(null);
    setSuccess(false);
    setStatusToken(null);
    setPayLoading(false);
    setPayError(null);
    setDiscountConsent(false);
    setRequestCount(0);
    setUploadState(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const addPerson = () => {
    if (persons.length >= maxPerEmail) return;
    const newIdx = persons.length;
    flushSync(() => {
      setPersons((prev) => [...prev, emptyPerson()]);
    });
    firstNameRefs.current[newIdx]?.focus();
  };

  const removePerson = (idx: number) => {
    if (persons.length <= 1) return;
    setPersons((prev) => prev.filter((_, i) => i !== idx));
  };

  const updatePerson = (idx: number, field: "firstName" | "lastName" | "isChild", value: string | boolean) => {
    setPersons((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  };

  const updateDiscountRequest = (idx: number, draft: DiscountRequestDraft) => {
    setPersons((prev) => prev.map((p, i) => (i === idx ? { ...p, discountRequest: draft } : p)));
  };

  // Der Server baut die Stripe-Session aus dem Token – hier wird bewusst
  // kein Betrag mitgeschickt, damit er unterwegs nicht verändert werden kann.
  const handlePay = async () => {
    if (!statusToken) return;
    setPayLoading(true);
    setPayError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_token: statusToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setPayError(data.error || "Zahlung konnte nicht gestartet werden.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setPayError("Verbindungsfehler. Bitte versuche es erneut.");
    } finally {
      setPayLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    if (!accepted) {
      setError("Bitte akzeptiere die Teilnahmebedingungen und bestätige, die Datenschutzerklärung zur Kenntnis genommen zu haben.");
      return;
    }

    // Anträge nur für Personen, die nicht schon erkannt wurden.
    const openRequests = persons.map((p, idx) =>
      !discountPreview[idx] && p.discountRequest.open ? p.discountRequest : null
    );
    if (openRequests.some((draft) => draft && !isDiscountRequestComplete(draft))) {
      setError("Bitte bei jeder beantragten Ermäßigung den Satz wählen und einen Nachweis anhängen – oder den Antrag entfernen.");
      return;
    }
    const hasRequests = openRequests.some(Boolean);
    if (hasRequests && !discountConsent) {
      setError("Bitte willige ausdrücklich in die Speicherung der Nachweise ein, um eine Ermäßigung zu beantragen.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const formEl = e.currentTarget as HTMLFormElement;
    const fd = new FormData(formEl);
    const _hp = (fd.get("_hp") as string | null) ?? "";
    const _ts = (fd.get("_ts") as string | null) ?? "";

    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id,
          email: email.trim(),
          phone: phone.trim(),
          persons: persons.map((p, idx) => ({
            firstName: p.firstName.trim(),
            lastName: p.lastName.trim(),
            isChild: p.isChild,
            // Der Server prüft selbst; die Datei folgt nach der Anmeldung.
            discountRequest: openRequests[idx]
              ? { discount: openRequests[idx]!.discount, remember: openRequests[idx]!.remember }
              : undefined,
          })),
          discountConsent,
          _hp,
          _ts,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ein Fehler ist aufgetreten.");
        return;
      }

      setSuccess(true);
      setStatusToken(data.status_token || null);
      onSuccess();

      // Nachweise einzeln hochladen – autorisiert über den eben erhaltenen Token.
      const created: Array<{ person_index: number; id: number }> = data.discount_requests ?? [];
      setRequestCount(created.length);
      if (created.length > 0 && data.status_token) {
        setUploadState({ running: true, failed: [] });
        const failed: UploadState["failed"] = [];
        for (const { person_index, id } of created) {
          const person = persons[person_index];
          const file = person?.discountRequest.file;
          const name = person ? `${person.firstName.trim()} ${person.lastName.trim()}` : "Person";
          const result = file ? await uploadProof(data.status_token, id, file) : { ok: false as const, error: "Keine Datei" };
          if (!result.ok) failed.push({ name, requestId: id, error: result.error });
        }
        setUploadState({ running: false, failed });
      }
    } catch {
      setError("Verbindungsfehler. Bitte versuche es erneut.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!event) return null;

  const isFull = event.is_full ?? false;

  // Erkannte Ermäßigung gilt sofort, beantragte vorbehaltlich der Prüfung.
  const pricedPersons = persons.map((p, idx) => ({
    is_child: p.isChild,
    discount: discountPreview[idx] ?? requestedDiscount(idx),
  }));
  const pricing = calculatePersonsPrice(event, pricedPersons);
  const totalPrice = pricing ? pricing.totalCents / 100 : null;
  const anyRequested = persons.some((_, idx) => requestedDiscount(idx));
  // Ermäßigen lässt sich nur, wo es einen verbindlichen Preis gibt.
  const discountsAvailable = calculateTierPrices(event) != null;
  // Hinweis je Person nur, wenn es tatsächlich etwas zu ermäßigen gibt.
  const discountNoticeFor = (idx: number) => {
    const discount = pricedPersons[idx].discount;
    const fullCents = pricing ? pricing.centsFor({ is_child: pricedPersons[idx].is_child, discount: null }) : null;
    if (!discount || !pricing || !fullCents) return { discount: null, fullCents: null, reducedCents: null };
    return {
      discount,
      fullCents,
      reducedCents: pricing.centsFor(pricedPersons[idx]),
      pending: !discountPreview[idx],
    };
  };
  // Bis wann storniert werden kann – entweder der am Event hinterlegte
  // Zeitpunkt oder 24 Stunden vor Beginn. Siehe lib/cancellation.ts.
  const deadline = cancellationDeadline({
    event_date: event.date,
    event_time: event.time,
    cancellation_deadline: event.cancellation_deadline,
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="mx-4 max-h-[90vh] overflow-y-auto">
        {success ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {isFull ? "Auf der Warteliste!" : "Anmeldung eingegangen!"}
            </h3>
            <p className="text-gray-600 mb-1">
              {isFull
                ? "Deine Anmeldung für die Warteliste wird nun geprüft:"
                : "Deine Anmeldung wird nun geprüft:"}
            </p>
            <p className="font-semibold text-gray-900 mb-2">{event.title}</p>
            <div className="text-sm text-gray-500 space-y-1 mb-2">
              <p>
                {new Date(event.date + "T00:00:00").toLocaleDateString("de-DE", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                um {event.time} Uhr
              </p>
              <p>{event.location}</p>
            </div>
            {persons.length > 0 && (
              <div className="bg-green-50 rounded-lg p-3 mb-3 text-left">
                <p className="text-xs font-semibold text-green-700 mb-1">
                  {persons.length} {persons.length === 1 ? "Person" : "Personen"}{" "}
                  {isFull ? "auf der Warteliste" : "angemeldet"}:
                </p>
                {persons.map((p, i) => (
                  <p key={i} className="text-sm text-green-900">
                    {p.firstName} {p.lastName}
                  </p>
                ))}
              </div>
            )}
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3 mb-4">
              {isFull
                ? "Du stehst auf der Warteliste. Wir melden uns per E-Mail, sobald ein Platz frei wird oder deine Anmeldung bestätigt wurde."
                : "Du erhältst eine E-Mail, sobald deine Anmeldung bestätigt wurde."}
            </p>
            {requestCount > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 mb-4 text-left text-sm text-amber-900 space-y-2" aria-live="polite">
                <p className="font-semibold">
                  {requestCount === 1 ? "Ermäßigung beantragt" : `${requestCount} Ermäßigungen beantragt`}
                </p>
                {uploadState?.running ? (
                  <p className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Nachweise werden hochgeladen …
                  </p>
                ) : uploadState && uploadState.failed.length > 0 ? (
                  <>
                    <p>Mindestens ein Nachweis konnte nicht hochgeladen werden. Bitte wähle ihn hier direkt erneut aus:</p>
                    <div className="space-y-3">
                      {uploadState.failed.map(({ name, requestId, error: uploadError }) => (
                        <div key={requestId} className="rounded-md border border-amber-200 bg-white/70 p-2.5 space-y-2">
                          <p className="text-xs"><span className="font-semibold">{name}:</span> {uploadError}</p>
                          {statusToken && (
                            <ProofUpload
                              statusToken={statusToken}
                              requestId={requestId}
                              hasProof={false}
                              onUploaded={() => setUploadState((current) => current ? {
                                ...current,
                                failed: current.failed.filter((entry) => entry.requestId !== requestId),
                              } : current)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>Wir prüfen deinen Nachweis. Danach kannst du bezahlen – du bekommst eine E-Mail.</p>
                )}
                {pricing && pricing.totalCents > 0 && (
                  <div className="pt-1">
                    <PriceSummary pricing={pricing} note="Ermäßigung vorbehaltlich der Prüfung" />
                  </div>
                )}
              </div>
            )}
            {statusToken && totalPrice != null && totalPrice > 0 && !isFull && requestCount === 0 && (
              <div className="border border-gray-200 rounded-lg p-4 mb-4 text-left">
                <p className="text-sm font-semibold text-gray-900">
                  Anmeldung bestätigen
                </p>
                {pricing?.hasDiscount ? (
                  <div className="mt-2 mb-3">
                    <PriceSummary pricing={pricing} />
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-1 mb-3">
                    {pricing?.breakdown}
                    {" = "}
                    <span className="font-semibold text-gray-900">
                      {formatEuro(totalPrice)}
                    </span>
                  </p>
                )}
                {deadline && (
                  <p className="text-xs text-gray-500 mb-3">
                    Nach der Zahlung kannst du bis {formatDeadline(deadline)}
                    stornieren.
                  </p>
                )}
                <Button onClick={handlePay} disabled={payLoading} className="w-full">
                  {payLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Wird geöffnet...
                    </>
                  ) : (
                    "Jetzt bezahlen"
                  )}
                </Button>
                {payError && (
                  <p className="mt-2 text-xs text-red-600">{payError}</p>
                )}
              </div>
            )}

            {statusToken && (
              <a
                href={`/status/${statusToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline block mb-4"
              >
                Status deiner Anmeldung ansehen
              </a>
            )}
            <Button onClick={() => handleClose(false)} className="rounded-full">
              Schließen
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {isFull ? "Warteliste" : "Anmeldung"}: {event.title}
              </DialogTitle>
              <DialogDescription>
                {isFull
                  ? "Dieses Event ist ausgebucht. Trage dich in die Warteliste ein – wir benachrichtigen dich, sobald ein Platz frei wird."
                  : "Fülle das Formular aus, um dich für dieses Event anzumelden."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5">
              {isFull && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">
                  Das Event ist aktuell ausgebucht. Mit dieser Anmeldung setzen
                  wir dich auf die Warteliste und melden uns, sobald ein Platz
                  frei wird.
                </div>
              )}
              {/* Contact */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">E-Mail *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    maxLength={255}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="max@beispiel.de"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefonnummer (WhatsApp) *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    required
                    value={phone}
                    maxLength={20}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0151 12345678"
                  />
                </div>
              </div>

              {/* Persons */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <Label className="text-sm font-semibold">
                      Personen
                    </Label>
                    <span className="text-xs text-gray-400">
                      (max. {maxPerEmail} pro E-Mail)
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {persons.length} / {maxPerEmail}
                  </span>
                </div>

                {discountsAvailable && (
                  <div className="flex items-start gap-2 rounded-lg border border-green-100 bg-green-50/60 px-3 py-2.5 text-xs text-gray-700">
                    <BadgePercent className="mt-0.5 w-4 h-4 shrink-0 text-green-700" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">Ermäßigung nach § 3 möglich</p>
                      <ul className="mt-1 space-y-0.5">
                        <li>
                          <span className="font-semibold text-green-800">−{DISCOUNTS.reduced_30.percent} %</span> bei Sozialleistungen
                        </li>
                        <li>
                          <span className="font-semibold text-green-800">−{DISCOUNTS.reduced_50.percent} %</span> bei Schwerbehinderung (GdB ab 50)
                        </li>
                      </ul>
                      <p className="mt-1.5 text-gray-600">Bei der jeweiligen Person beantragen.</p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {persons.map((person, idx) => (
                    <div
                      key={idx}
                      className="border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-2"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-600">
                          Person {idx + 1}
                          {idx === 0 && (
                            <span className="ml-1 text-gray-400">(du)</span>
                          )}
                        </span>
                        {persons.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePerson(idx)}
                            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Person entfernen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Input
                            ref={(el) => { firstNameRefs.current[idx] = el; }}
                            required
                            value={person.firstName}
                            maxLength={50}
                            onChange={(e) => updatePerson(idx, "firstName", e.target.value)}
                            placeholder="Vorname"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <LastNameInput
                            required
                            value={person.lastName}
                            maxLength={50}
                            onChange={(v) => updatePerson(idx, "lastName", v)}
                            siblings={persons.filter((_, i) => i !== idx).map((p) => p.lastName)}
                            className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <span
                          id={`child-label-${idx}`}
                          className="text-xs text-gray-600"
                        >
                          Kind (unter 18 Jahren)?
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs ${
                              person.isChild ? "text-gray-400" : "font-semibold text-gray-700"
                            }`}
                          >
                            Nein
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={person.isChild}
                            aria-labelledby={`child-label-${idx}`}
                            onClick={() => updatePerson(idx, "isChild", !person.isChild)}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ${
                              person.isChild ? "bg-green-600" : "bg-gray-300"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                person.isChild ? "translate-x-5.5" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                          <span
                            className={`text-xs ${
                              person.isChild ? "font-semibold text-gray-700" : "text-gray-400"
                            }`}
                          >
                            Ja
                          </span>
                        </div>
                      </div>
                      <DiscountNotice {...discountNoticeFor(idx)} />
                      {/* Wer schon erkannt ist, braucht keinen Antrag. */}
                      {discountsAvailable && !discountPreview[idx] && (
                        <DiscountRequestFields
                          value={person.discountRequest}
                          onChange={(draft) => updateDiscountRequest(idx, draft)}
                          disabled={submitting}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {persons.length < maxPerEmail && (
                  <button
                    type="button"
                    onClick={addPerson}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Person hinzufügen
                  </button>
                )}
              </div>

              {/* Consent */}
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="accepted"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                  <Label htmlFor="accepted" className="text-sm text-gray-600 cursor-pointer">
                    Ich akzeptiere die{" "}
                    <Link
                      href="/teilnahmebedingungen"
                      target="_blank"
                      className="underline hover:text-gray-900"
                    >
                      Teilnahmebedingungen
                    </Link>{" "}
                    und habe die{" "}
                    <Link
                      href="/datenschutz"
                      target="_blank"
                      className="underline hover:text-gray-900"
                    >
                      Datenschutzerklärung
                    </Link>{" "}
                    zur Kenntnis genommen. *
                  </Label>
                </div>

                {hasOpenRequest && (
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="discount-consent"
                      checked={discountConsent}
                      onChange={(e) => setDiscountConsent(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    />
                    <Label htmlFor="discount-consent" className="text-sm text-gray-600 cursor-pointer">
                      {DISCOUNT_REQUEST_CONSENT_TEXT} Mehr dazu in der{" "}
                      <Link href="/datenschutz" target="_blank" className="underline hover:text-gray-900">
                        Datenschutzerklärung
                      </Link>
                      . *
                    </Label>
                  </div>
                )}
              </div>

              {/* Kosten */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                {pricing ? (
                  <PriceSummary
                    pricing={pricing}
                    note={anyRequested ? "Ermäßigung vorbehaltlich der Prüfung" : undefined}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm text-gray-600">
                      <Euro className="w-4 h-4 text-gray-400" />
                      Kosten
                    </span>
                    <span className="text-base font-semibold text-gray-900">
                      {formatEventPrice(event)}
                    </span>
                  </div>
                )}
                {event.child_price && <p className="mt-1 text-xs text-gray-500">Kinder: {event.child_price}</p>}
                {totalPrice != null && totalPrice > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {isFull
                      ? "Der Betrag wird erst fällig, wenn du von der Warteliste nachrückst."
                      : "Der Betrag wird mit der Bestätigung deiner Anmeldung fällig."}
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {error}
                </div>
              )}

              <HoneypotFields />

              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Wird gesendet...
                  </>
                ) : isFull ? (
                  "In die Warteliste einschreiben"
                ) : (
                  `${persons.length} ${persons.length === 1 ? "Person" : "Personen"} anmelden`
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
