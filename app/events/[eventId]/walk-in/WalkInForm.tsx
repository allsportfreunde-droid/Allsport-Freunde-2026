"use client";

import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import {
  MapPin,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Users,
  Plus,
  X,
} from "lucide-react";
import { LastNameInput } from "@/components/ui/LastNameInput";
import { formatEuro } from "@/lib/finance";
import { calculateRegistrationPrice } from "@/lib/price";

interface WalkInFormProps {
  eventId: number;
  token: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  maxPersons: number;
  /** Anzeigetext des Events – "Kostenlos" oder echter Freitext. */
  priceText: string;
  /** Betrag pro Person in Euro. null = nichts zu zahlen. */
  entryPrice: number | null;
  childEntryPrice?: number | null;
  childPriceText?: string | null;
}

interface Person {
  firstName: string;
  lastName: string;
  /** true = Kind (U18). Default ist "Nein", also ein Erwachsener. */
  isChild: boolean;
}

const emptyPerson = (): Person => ({ firstName: "", lastName: "", isChild: false });

interface FormState {
  persons: Person[];
  email: string;
  phone: string;
  notes: string;
  privacy_accepted: boolean;
  terms_accepted: boolean;
}

const EMPTY_FORM: FormState = {
  persons: [emptyPerson()],
  email: "",
  phone: "",
  notes: "",
  privacy_accepted: false,
  terms_accepted: false,
};

export function WalkInForm({
  eventId,
  token,
  eventTitle,
  eventDate,
  eventLocation,
  maxPersons,
  priceText,
  entryPrice,
  childEntryPrice,
  childPriceText,
}: WalkInFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  /** Vom Server bestätigter offener Betrag, z. B. "2 × 8,00 € = 16,00 €". */
  const [dueLabel, setDueLabel] = useState<string | null>(null);
  const firstNameRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Ein Betrag macht die E-Mail zur Pflicht: der Zahlungslink führt auf die
  // Status-Seite, und die erreicht den Gast nur per Mail.
  const pricing = calculateRegistrationPrice(
    { price: priceText, entry_price: entryPrice, child_entry_price: childEntryPrice },
    form.persons.length,
    form.persons.filter((p) => p.isChild).length
  );
  const totalPrice = pricing ? pricing.totalCents / 100 : null;
  const hasAmount = totalPrice != null && totalPrice > 0;

  useEffect(() => {
    firstNameRefs.current[0]?.focus();
  }, []);

  const addPerson = () => {
    const newIdx = form.persons.length;
    flushSync(() => {
      setForm((f) => ({ ...f, persons: [...f.persons, emptyPerson()] }));
    });
    firstNameRefs.current[newIdx]?.focus();
  };

  const removePerson = (idx: number) =>
    setForm((f) => ({ ...f, persons: f.persons.filter((_, i) => i !== idx) }));

  const updatePerson = <K extends keyof Person>(
    idx: number,
    field: K,
    value: Person[K]
  ) =>
    setForm((f) => ({
      ...f,
      persons: f.persons.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          token,
          persons: form.persons.map((p) => ({
            firstName: p.firstName.trim(),
            lastName: p.lastName.trim(),
            isChild: p.isChild,
          })),
          email: form.email || undefined,
          phone: form.phone || undefined,
          notes: form.notes || undefined,
          privacy_accepted: form.privacy_accepted,
          terms_accepted: form.terms_accepted,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Fehler bei der Registrierung.");
      } else {
        // Den Betrag nennt der Server – er hat die verbindlichen Zahlen.
        setDueLabel(typeof body.priceLabel === "string" ? body.priceLabel : null);
        setSuccess(true);
      }
    } catch {
      setError("Netzwerkfehler. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Erfolgreich registriert!
          </h1>
          <p className="text-gray-600 text-sm leading-relaxed">
            Du bist jetzt für <strong>{eventTitle}</strong> eingetragen.
            Bitte melde dich beim Organisator vor Ort.
          </p>
          {dueLabel && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-left space-y-1">
              <p className="text-xs font-semibold text-amber-800">
                Offener Teilnahmebetrag
              </p>
              <p className="text-sm font-semibold text-amber-900">{dueLabel}</p>
              <p className="text-xs text-amber-700 leading-snug">
                Wir haben dir eine E-Mail an <strong>{form.email}</strong>
                {" "}geschickt – darin ist der Bezahlen-Button für deine
                Anmeldung.
              </p>
            </div>
          )}
          {!dueLabel && form.email && (
            <p className="text-xs text-gray-400 leading-snug">
              Wir haben dir eine E-Mail an <strong>{form.email}</strong>
              {" "}geschickt – darüber kannst du deine Anmeldung jederzeit
              ansehen oder stornieren.
            </p>
          )}
          {form.persons.length > 0 && (
            <div className="bg-green-50 rounded-xl p-3 text-left">
              <p className="text-xs font-semibold text-green-700 mb-1">
                {form.persons.length} {form.persons.length === 1 ? "Person" : "Personen"} eingetragen:
              </p>
              {form.persons.map((p, i) => (
                <p key={i} className="text-sm text-green-900">
                  {p.firstName} {p.lastName}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Event info card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{eventTitle}</h1>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>{eventDate}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>{eventLocation}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 pt-1 border-t border-gray-50">
            Vor-Ort-Anmeldung · Trage dich jetzt ein
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              E-Mail{" "}
              {hasAmount ? (
                <span className="text-red-500">*</span>
              ) : (
                <span className="text-gray-400 font-normal text-xs">(optional)</span>
              )}
            </label>
            <input
              type="email"
              required={hasAmount}
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              placeholder="max@beispiel.de"
            />
            {hasAmount && (
              <p className="mt-1.5 text-xs text-gray-400">
                Hierhin geht der Zahlungslink für den Teilnahmebetrag.
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Telefonnummer{" "}
              <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              placeholder="0151 12345678"
            />
          </div>

          {/* Persons */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Users className="w-4 h-4" />
                Personen <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-gray-400">
                {form.persons.length} / {maxPersons}
              </span>
            </div>

            {form.persons.map((person, idx) => (
              <div
                key={idx}
                className="border border-gray-100 rounded-xl p-4 bg-white space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    Person {idx + 1}
                    {idx === 0 && (
                      <span className="ml-1 text-gray-400">(du)</span>
                    )}
                  </span>
                  {form.persons.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePerson(idx)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    ref={(el) => { firstNameRefs.current[idx] = el; }}
                    type="text"
                    required
                    autoComplete={idx === 0 ? "given-name" : "off"}
                    value={person.firstName}
                    maxLength={50}
                    onChange={(e) => updatePerson(idx, "firstName", e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    placeholder="Vorname"
                  />
                  <LastNameInput
                    required
                    autoComplete={idx === 0 ? "family-name" : "off"}
                    value={person.lastName}
                    maxLength={50}
                    onChange={(v) => updatePerson(idx, "lastName", v)}
                    siblings={form.persons.filter((_, i) => i !== idx).map((p) => p.lastName)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  />
                </div>

                {/* Kind-Kennzeichnung wie im Anmeldeformular – der Betrag
                    bleibt gleich, aber das Team weiß, wer U18 ist. */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span id={`walkin-child-label-${idx}`} className="text-xs text-gray-600">
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
                      aria-labelledby={`walkin-child-label-${idx}`}
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
              </div>
            ))}

            {form.persons.length < maxPersons && (
              <button
                type="button"
                onClick={addPerson}
                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Begleitperson hinzufügen
              </button>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Bemerkung{" "}
              <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-green-500 bg-white resize-none"
              placeholder="z.B. Probetraining, komme mit Mitglied XY…"
            />
          </div>

          {/* Kosten nach Erwachsenen- und Kinderpreis */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-gray-600">
                {totalPrice != null ? (
                  <>
                    {pricing?.breakdown}
                  </>
                ) : (
                  "Kosten"
                )}
              </span>
              <span className="text-base font-semibold text-gray-900">
                {totalPrice != null ? formatEuro(totalPrice) : priceText}
              </span>
            </div>
            {childPriceText && <p className="mt-1 text-xs text-gray-500">Kinder: {childPriceText}</p>}
            {hasAmount && (
              <p className="mt-1 text-xs text-gray-500">
                Den Zahlungslink schicken wir dir per E-Mail – dein Platz ist
                schon vor der Zahlung eingetragen.
              </p>
            )}
          </div>

          {/* Checkboxes */}
          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={form.privacy_accepted}
                onChange={(e) => setForm((f) => ({ ...f, privacy_accepted: e.target.checked }))}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
              />
              <span className="text-sm text-gray-600 leading-snug">
                Ich habe die{" "}
                <a href="/datenschutz" className="underline hover:text-gray-900">
                  Datenschutzerklärung
                </a>{" "}
                gelesen und stimme der Verarbeitung meiner Daten zu.{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={form.terms_accepted}
                onChange={(e) => setForm((f) => ({ ...f, terms_accepted: e.target.checked }))}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
              />
              <span className="text-sm text-gray-600 leading-snug">
                Ich akzeptiere die{" "}
                <a href="/teilnahmebedingungen" className="underline hover:text-gray-900">
                  Teilnahmebedingungen
                </a>
                .{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold text-base rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Wird registriert…
              </>
            ) : (
              `${form.persons.length} ${form.persons.length === 1 ? "Person" : "Personen"} eintragen`
            )}
          </button>

          <p className="text-center text-xs text-gray-400">
            Mit dem Absenden wirst du direkt als Vor-Ort-Teilnehmer eingetragen.
            {hasAmount && " Der Teilnahmebetrag bleibt danach offen."}
          </p>
        </form>
      </div>
    </div>
  );
}
