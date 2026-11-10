"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, MessageSquare, RefreshCw, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/MetricCard";
import { MetricGrid } from "@/components/ui/MetricGrid";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EventReviewDashboard, ReviewSendKind, ReviewSendResult } from "@/lib/types";

interface ViewProps {
  data: EventReviewDashboard;
  busy: boolean;
  message: ReviewSendResult | null;
  error?: string | null;
  onSend: (kind: ReviewSendKind) => void;
  onTogglePublish: (reviewId: number, published: boolean) => void;
  onRefresh: () => void;
}

function formatDate(value: string, withTime = false): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
  }).format(new Date(value));
}

function percent(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

/** Reine Ansicht: Daten, Rückmeldungen und Aktionen kommen aus den Props. */
export function ReviewTabView({ data, busy, message, error, onSend, onTogglePublish, onRefresh }: ViewProps) {
  const { stats } = data;
  const returnAnswers = stats.would_return.ja + stats.would_return.vielleicht + stats.would_return.nein;
  const responseRate = data.requested > 0 ? percent(stats.responses / data.requested) : "–";
  const returnLabels = { ja: "Ja", vielleicht: "Vielleicht", nein: "Nein" };
  const reviews = [...data.reviews].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  return (
    <div className="min-w-0 space-y-4" aria-busy={busy}>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRefresh}>
          <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />Aktualisieren
        </Button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <div role="status" className="space-y-1 rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <p className="text-green-700">{message.sent} gesendet</p>
        {message.failed > 0 && <p className="text-red-600">{message.failed} fehlgeschlagen – per Nachsenden erneut versuchen</p>}
      </div>}

      <section className="space-y-3 rounded-xl border border-gray-100 bg-white p-5" aria-labelledby="review-request-title">
        <h2 id="review-request-title" className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Send aria-hidden="true" className="h-4 w-4 text-gray-500" />Review-Anfrage
        </h2>
        {!data.can_send && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
          {data.send_blocked_reason === "event_cancelled"
            ? "Das Event wurde abgesagt – kein Review-Versand."
            : `Der Versand ist ab dem Event-Tag (${formatDate(data.event.date)}) möglich.`}
        </p>}
        {data.requested === 0 ? (
          <>
            <p className="text-sm text-gray-600">{data.pending_initial} eingecheckte Anmeldungen mit E-Mail · {data.without_email} ohne E-Mail</p>
            {data.can_send && <Button type="button" disabled={busy || data.pending_initial === 0} onClick={() => onSend("initial")}>
              Review an {data.pending_initial} senden
            </Button>}
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <BadgeCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-green-800">Verschickt am {data.first_requested_at ? formatDate(data.first_requested_at, true) : "–"} · {data.requested} Mails</p>
              </div>
            </div>
            {data.pending_initial > 0 && <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-700">{data.pending_initial} später Eingecheckte noch ohne Anfrage</p>
              {data.can_send && <Button type="button" variant="outline" disabled={busy} onClick={() => onSend("initial")}>Nachsenden</Button>}
            </div>}
          </>
        )}
        {data.reminder_sent_at ? (
          <p className="text-xs text-green-700">Erinnerung verschickt am {formatDate(data.reminder_sent_at, true)}</p>
        ) : data.requested > 0 && data.can_send ? (
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal text-left"
            disabled={busy || data.reminder_candidates === 0} onClick={() => onSend("reminder")}>
            Erinnerung an {data.reminder_candidates} ohne Antwort
          </Button>
        ) : null}
      </section>

      {data.requested > 0 && <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-5" aria-labelledby="review-results-title">
        <h2 id="review-results-title" className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Star aria-hidden="true" className="h-4 w-4 text-amber-500" />Ergebnisse
        </h2>
        <MetricGrid className="[&>div]:grid-cols-1 sm:[&>div]:grid-cols-3">
          <MetricCard label="Durchschnitt" value={stats.average === null ? "–" : `${stats.average.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★`} color="amber" />
          <MetricCard label="Antwortquote" value={responseRate} sub={`${stats.responses} von ${data.requested} (${responseRate})`} color="blue" />
          <MetricCard label="Würden wieder mitmachen" value={returnAnswers > 0 ? percent(stats.would_return.ja / returnAnswers) : "–"}
            sub={returnAnswers > 0 ? `${stats.would_return.ja} von ${returnAnswers} Angaben: Ja` : "Noch keine Angabe"} color="green" />
        </MetricGrid>
        <div className="space-y-2" aria-label="Verteilung der Sterne">
          {([5, 4, 3, 2, 1] as const).map((rating) => (
            <div key={rating} className="flex items-center gap-3 text-sm" aria-label={`${rating} Sterne: ${stats.distribution[rating]} Antworten`}>
              <span className="w-8 shrink-0 text-amber-600">{rating}★</span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${stats.responses > 0 ? stats.distribution[rating] / stats.responses * 100 : 0}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums text-gray-600">{stats.distribution[rating]}</span>
            </div>
          ))}
        </div>
      </section>}

      <section className="space-y-3 rounded-xl border border-gray-100 bg-white p-5" aria-labelledby="review-comments-title">
        <h2 id="review-comments-title" className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <MessageSquare aria-hidden="true" className="h-4 w-4 text-gray-500" />Kommentare
        </h2>
        {reviews.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Noch keine Antworten.</p> : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <article key={review.id} className="min-w-0 space-y-3 rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-medium text-gray-900">{review.first_name} {review.last_name}</p>
                  <time className="text-xs text-gray-400" dateTime={review.created_at}>{formatDate(review.created_at, true)}</time>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-amber-500" aria-label={`${review.rating} von 5 Sternen`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                  {review.would_return && <Badge variant="outline">Wieder dabei: {returnLabels[review.would_return]}</Badge>}
                </div>
                {review.comment ? <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{review.comment}</p> : <p className="text-xs italic text-gray-400">Kein Kommentar.</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {review.publish_consent && review.comment && <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Darf veröffentlicht werden</Badge>}
                  {(review.published_at || (review.publish_consent && review.comment)) && <Button type="button" variant="outline" size="sm"
                    disabled={busy} onClick={() => onTogglePublish(review.id, !review.published_at)}>
                    {review.published_at ? "Von Website nehmen" : "Auf Website zeigen"}
                  </Button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function ReviewTab({ eventId, onChanged }: { eventId: number; onChanged?: (data: EventReviewDashboard) => void }) {
  const [data, setData] = useState<EventReviewDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<ReviewSendResult | null>(null);
  const [sendKind, setSendKind] = useState<ReviewSendKind | null>(null);
  const locked = useRef(false);
  const mounted = useRef(false);
  const latestLoad = useRef(0);
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; }, [onChanged]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++latestLoad.current;
    try {
      const response = await fetch(`/api/admin/events/${eventId}/review`, { cache: "no-store", signal });
      const body = await response.json();
      if (!mounted.current || signal?.aborted || sequence !== latestLoad.current) return;
      if (!response.ok) { setError(body.error ?? "Reviews konnten nicht geladen werden."); return; }
      setData(body);
      changed.current?.(body);
    } catch {
      if (mounted.current && !signal?.aborted && sequence === latestLoad.current) setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      if (mounted.current && !signal?.aborted && sequence === latestLoad.current) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setData(null); setLoading(true); setError(null); setMessage(null); setSendKind(null);
    void load(controller.signal);
    return () => { mounted.current = false; controller.abort(); };
  }, [load]);

  async function refresh() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    await load();
    locked.current = false;
    if (mounted.current) setBusy(false);
  }

  async function act(url: string, method: "POST" | "PATCH", body: unknown) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    if (method === "POST") setMessage(null);
    try {
      const response = await fetch(url, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!mounted.current) return;
      if (!response.ok) setError(result.error ?? "Die Aktion konnte nicht ausgeführt werden.");
      else if (method === "POST") setMessage(result);
    } catch {
      if (mounted.current) setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      // Auch nach einem Konflikt den aktuellen Versand- und Freigabestand laden.
      if (mounted.current) await load();
      locked.current = false;
      if (mounted.current) { setBusy(false); setSendKind(null); }
    }
  }

  if (loading && !data) return <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white p-8 text-sm text-gray-500">
    <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin text-green-600" />Reviews werden geladen…
  </div>;
  if (!data) return <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-5">
    <p role="alert" className="text-sm text-red-700">{error ?? "Reviews konnten nicht geladen werden."}</p>
    <Button type="button" variant="outline" disabled={busy} onClick={() => { void refresh(); }}>Aktualisieren</Button>
  </div>;
  return <>
    <ReviewTabView data={data} busy={busy} message={message} error={error} onRefresh={() => { void refresh(); }}
      onSend={(kind) => { if (!locked.current) setSendKind(kind); }}
      onTogglePublish={(reviewId, published) => { void act(`/api/admin/reviews/${reviewId}`, "PATCH", { published }); }} />
    <Dialog open={sendKind !== null} onOpenChange={(open) => { if (!open && !locked.current) setSendKind(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sendKind === "reminder" ? "Erinnerung senden?" : "Review-Anfrage senden?"}</DialogTitle>
          <DialogDescription>
            {sendKind === "reminder" ? `Erinnerung an ${data.reminder_candidates} Teilnehmer ohne Antwort senden? Die Erinnerung kann pro Event nur einmal verschickt werden.`
              : `Review-Anfrage an ${data.pending_initial} Teilnehmer senden? Jede Anmeldung bekommt die Mail nur einmal.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => setSendKind(null)}>Abbrechen</Button>
          <Button type="button" disabled={busy || sendKind === null} onClick={() => {
            if (sendKind !== null) void act(`/api/admin/events/${eventId}/review/send`, "POST", { kind: sendKind });
          }}>{busy ? "Wird gesendet…" : "Jetzt senden"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
