"use client";

import { useEffect } from "react";
import { X, Loader2, User, Users, Calendar, CheckCircle2, Info, Euro, ExternalLink } from "lucide-react";
import StatusBadge from "@/components/status/StatusBadge";
import ChildBadge from "@/components/ChildBadge";
import PaidBadge from "@/components/PaidBadge";
import type { RegistrationDetail } from "@/lib/types";
import { formatEuro } from "@/lib/finance";

interface Props {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  data: RegistrationDetail | null;
  error?: string | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 min-w-[150px] shrink-0">{label}</span>
      <span className="text-sm text-gray-900 break-words min-w-0 flex-1">
        {value !== null && value !== undefined && value !== "" ? (
          value
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </span>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <div className="bg-gray-50 rounded-lg px-4 py-1">{children}</div>
    </div>
  );
}

export default function RegistrationDetailModal({
  open,
  onClose,
  loading,
  data,
  error,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-50 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-border bg-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-4 sm:zoom-in-95"
        role="dialog"
        aria-modal="true"
        aria-label="Anmeldungs-Details"
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-background z-10 flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-lg font-semibold text-gray-900">
            Anmeldungs-Details
          </h2>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
            type="button"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 text-center">
              {error}
            </p>
          )}

          {data && !loading && (
            <>
              {/* Persönliche Daten */}
              <Section title="Persönliche Daten" icon={User}>
                <Row label="Vorname" value={data.first_name} />
                <Row label="Nachname" value={data.last_name} />
                <Row label="E-Mail" value={data.email} />
                <Row label="Telefonnummer" value={data.phone} />
              </Section>

              {/* Angemeldete Personen */}
              <Section
                title={`Angemeldete Personen (${data.persons?.length ?? 0})`}
                icon={Users}
              >
                {data.persons && data.persons.length > 0 ? (
                  data.persons.map((person, idx) => (
                    <div
                      key={person.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 break-words">
                          {person.first_name} {person.last_name}
                          {person.is_child && (
                            <ChildBadge className="ml-1.5 align-middle" />
                          )}
                          {idx === 0 && (
                            <span className="ml-1.5 text-xs text-gray-400 font-normal">
                              (Hauptperson)
                            </span>
                          )}
                        </p>
                        {person.checked_in_at && (
                          <p className="text-xs text-green-700 mt-0.5">
                            Eingecheckt · {formatDateTime(person.checked_in_at)}
                          </p>
                        )}
                      </div>
                      {person.checked_in_at ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-green-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Ein
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-400">
                          Ausstehend
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-2">
                    <span className="text-sm text-gray-400">
                      Keine Personen vorhanden
                    </span>
                  </div>
                )}
              </Section>

              {/* Anmeldungs-Details */}
              <Section title="Anmeldungs-Details" icon={Info}>
                <Row label="Anmeldungs-ID" value={`#${data.id}`} />
                <Row
                  label="Angemeldet am"
                  value={formatDateTime(data.created_at)}
                />
                <Row
                  label="Status"
                  value={<StatusBadge status={data.status} />}
                />
                {data.status_changed_at && (
                  <Row
                    label="Status geändert am"
                    value={formatDateTime(data.status_changed_at)}
                  />
                )}
                {data.status_note && (
                  <Row label="Status-Hinweis" value={data.status_note} />
                )}
                <Row
                  label="Event"
                  value={
                    data.event_title +
                    " · " +
                    formatDate(data.event_date) +
                    (data.event_time ? " · " + data.event_time + " Uhr" : "")
                  }
                />
                <Row label="Veranstaltungsort" value={data.event_location} />
                <Row
                  label="Begleitpersonen"
                  value={
                    (data.person_count - 1) > 0
                      ? `${data.person_count - 1} Person${(data.person_count - 1) !== 1 ? "en" : ""}`
                      : "Keine"
                  }
                />
                <Row
                  label="Walk-in"
                  value={
                    data.is_walk_in ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                        Ja
                      </span>
                    ) : (
                      "Nein"
                    )
                  }
                />
                {data.notes && (
                  <Row label="Interne Notizen" value={data.notes} />
                )}
              </Section>

              {/* Zahlung */}
              <Section title="Zahlung" icon={Euro}>
                {data.checkout_notices?.map((notice, index) => (
                  <div key={`${notice.created_at}-${index}`} className="my-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">{notice.kind === "payment_failed" ? "SEPA-Einzug fehlgeschlagen" : "E-Mail-Versand prüfen"}</p>
                    {notice.data.amount != null && <p>Betrag: {formatEuro(notice.data.amount)}</p>}
                    {notice.data.reason && <p>{notice.data.reason}</p>}
                    <p>{formatDateTime(notice.created_at)}</p>
                    {notice.kind === "payment_failed" && <p>Die Teilnahme wurde dadurch nicht zurückgenommen.
                      {data.paid_at ? " Inzwischen ist eine Zahlung verbucht." : " Bitte den offenen Betrag klären."}</p>}
                    {notice.delivery_uncertain
                      ? <p>Versandausgang unklar. Bitte vor erneutem Versand beim E-Mail-Dienst prüfen.</p>
                      : <p>{notice.sent_at ? "Admin-E-Mail versendet." : "Admin-E-Mail steht noch aus."}</p>}
                    {notice.stripe_url && <a className="underline" href={notice.stripe_url} target="_blank" rel="noopener noreferrer">Zahlung bei Stripe</a>}
                  </div>
                ))}
                <Row
                  label="Status"
                  value={<PaidBadge paid={data.paid_at != null} className="text-xs" />}
                />
                {data.paid_at && (
                  <>
                    <Row
                      label="Bezahlt am"
                      value={formatDateTime(data.paid_at)}
                    />
                    <Row
                      label="Betrag"
                      value={
                        data.amount_paid != null
                          ? formatEuro(data.amount_paid)
                          : null
                      }
                    />
                    {/* Storniert wurde bereits und der Teilnehmer hat den
                        Betrag schriftlich zugesagt bekommen – die Rückzahlung
                        selbst passiert von Hand im Stripe-Dashboard. */}
                    {data.refund_due && (
                      <Row
                        label="Zu erstatten"
                        value={
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-semibold text-amber-700">
                              {formatEuro(data.refund_due.amount)}
                            </span>
                            <span className="text-xs text-gray-500">
                              {data.refund_due.persons === 1
                                ? "1 abgemeldete Person"
                                : `${data.refund_due.persons} abgemeldete Personen`}
                            </span>
                          </span>
                        }
                      />
                    )}
                    {data.stripe_dashboard_url && (
                      <Row
                        label="Bei Stripe"
                        value={
                          <a
                            href={data.stripe_dashboard_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            Zahlung im Dashboard öffnen
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        }
                      />
                    )}
                    <Row
                      label="Payment-ID"
                      value={
                        data.stripe_payment_intent_id ? (
                          <span className="font-mono text-xs break-all">
                            {data.stripe_payment_intent_id}
                          </span>
                        ) : null
                      }
                    />
                    <Row
                      label="Checkout-Session"
                      value={
                        data.stripe_session_id ? (
                          <span className="font-mono text-xs break-all">
                            {data.stripe_session_id}
                          </span>
                        ) : null
                      }
                    />
                  </>
                )}
              </Section>

              {/* Check-In */}
              <Section title="Check-In" icon={CheckCircle2}>
                <Row
                  label="Eingecheckt"
                  value={
                    data.checked_in_at ? (
                      <span className="font-medium text-green-700">Ja</span>
                    ) : (
                      <span className="text-gray-400">Nein</span>
                    )
                  }
                />
                {data.checked_in_at && (
                  <>
                    <Row
                      label="Eingecheckt am"
                      value={formatDateTime(data.checked_in_at)}
                    />
                    <Row
                      label="Eingecheckt von"
                      value={data.checked_in_by}
                    />
                  </>
                )}
              </Section>

              {/* Technische Details */}
              <Section title="Technische Details" icon={Calendar}>
                <Row label="Anmeldungs-ID" value={`#${data.id}`} />
                <Row label="Event-ID" value={`#${data.event_id}`} />
                <Row
                  label="Status-Seite"
                  value={
                    data.status_token ? (
                      <a
                        href={`/status/${data.status_token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        Status-Seite öffnen
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : null
                  }
                />
                <Row
                  label="QR-Code"
                  value={
                    data.qr_token ? (
                      <span className="text-green-700 text-xs font-medium">
                        Generiert
                      </span>
                    ) : (
                      <span className="text-gray-400">Nicht generiert</span>
                    )
                  }
                />
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
