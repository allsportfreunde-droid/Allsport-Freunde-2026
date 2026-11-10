"use client";

import Link from "next/link";
import { BadgeCheck, MessageSquare, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/MetricCard";
import { ResponsiveTable } from "@/components/ui/ResponsiveTable";
import { formatPublicName } from "@/lib/review";
import type { EventReviewWithAuthor, ReviewOverviewEvent, ReviewOverviewResponse } from "@/lib/types";

interface Props {
  data: ReviewOverviewResponse;
  busyId: number | null;
  busy?: boolean;
  onTogglePublish: (reviewId: number, published: boolean) => void;
}

function formatDate(value: string, withTime = false): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
  }).format(new Date(value));
}

function average(value: number | null): string {
  return value === null ? "–" : `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★`;
}

function percent(value: number | null): string {
  return value === null ? "–" : new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

function CommentCard({ review, published, disabled, busy, onTogglePublish }: {
  review: EventReviewWithAuthor; published: boolean; disabled: boolean; busy: boolean;
  onTogglePublish: Props["onTogglePublish"];
}) {
  return <article className="min-w-0 space-y-3 rounded-lg border border-gray-100 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-1">
        <h3 className="break-words text-sm font-semibold text-gray-900">{review.first_name} {review.last_name}</h3>
        <Link href={`/admin/events/${review.event_id}/dashboard?tab=review`} className="block break-words text-sm text-green-700 hover:underline">
          {review.event_title ?? `Event #${review.event_id}`}
        </Link>
      </div>
      <time dateTime={review.created_at} className="text-xs text-gray-400">{formatDate(review.created_at, true)}</time>
    </div>
    <p className="text-amber-500" aria-label={`${review.rating} von 5 Sternen`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
    <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{review.comment}</p>
    <p className="text-xs text-gray-500">erscheint als: {formatPublicName(review.first_name, review.last_name)}</p>
    {published && review.published_at && <p className="text-xs text-green-700">
      Freigegeben am <time dateTime={review.published_at}>{formatDate(review.published_at, true)}</time>
    </p>}
    <Button type="button" variant="outline" size="sm" disabled={disabled || (!published && (!review.publish_consent || !review.comment))}
      onClick={() => onTogglePublish(review.id, !published)}>
      {busy && <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
      {published ? "Von Website nehmen" : "Auf Website zeigen"}
    </Button>
  </article>;
}

/** Zustandslose Übersicht; Anfragen und Aktionen übernimmt die Seite. */
export function ReviewsOverviewView({ data, busyId, busy = false, onTogglePublish }: Props) {
  const events = [...data.events].sort((a, b) => b.date.localeCompare(a.date) || b.event_id - a.event_id);
  const pending = [...data.pending_approval].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const published = [...data.published].sort((a, b) => Date.parse(b.published_at ?? b.created_at) - Date.parse(a.published_at ?? a.created_at) || b.id - a.id);
  const requested = events.reduce((sum, event) => sum + event.requested, 0);
  const responses = events.reduce((sum, event) => sum + event.responses, 0);
  const ratedResponses = events.reduce((sum, event) => sum + (event.average === null ? 0 : event.responses), 0);
  // Große und kleine Events zählen entsprechend ihrer tatsächlichen Antwortzahl.
  const weightedTotal = events.reduce((sum, event) => sum + (event.average ?? 0) * event.responses, 0);
  const disabled = busy || busyId !== null;

  return <div className="min-w-0 space-y-6" aria-busy={disabled}>
    <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-5" aria-labelledby="reviews-pending-title">
      <h2 id="reviews-pending-title" className="flex items-center gap-2 text-base font-semibold text-gray-800">
        <MessageSquare aria-hidden="true" className="h-4 w-4 text-amber-500" />Freigabe ausstehend ({pending.length})
      </h2>
      {pending.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">Keine Kommentare warten auf Freigabe.</p> : (
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          {pending.map((review) => <CommentCard key={review.id} review={review} published={false} disabled={disabled} busy={busyId === review.id} onTogglePublish={onTogglePublish} />)}
        </div>
      )}
    </section>

    <section className="min-w-0 space-y-4 rounded-xl border border-gray-100 bg-white p-5" aria-labelledby="reviews-events-title">
      <h2 id="reviews-events-title" className="flex items-center gap-2 text-base font-semibold text-gray-800">
        <Star aria-hidden="true" className="h-4 w-4 text-amber-500" />Events im Vergleich
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Durchschnitt aller Events" value={average(ratedResponses > 0 ? weightedTotal / ratedResponses : null)} color="amber" />
        <MetricCard label="Gesamte Antwortquote" value={percent(requested > 0 ? responses / requested : null)} sub={`${responses} von ${requested} Anfragen`} color="blue" />
        <MetricCard label="Antworten insgesamt" value={responses} color="green" />
      </div>
      <ResponsiveTable<ReviewOverviewEvent> data={events} keyField="event_id" emptyMessage="Noch keine Reviews verschickt."
        tableWrapperClassName="rounded-lg border border-gray-100" columns={[
          { key: "title", label: "Event", render: (event) => <Link href={`/admin/events/${event.event_id}/dashboard?tab=review`} className="block max-w-sm break-words font-medium text-green-700 hover:underline">{event.title}</Link> },
          { key: "date", label: "Datum", render: (event) => formatDate(event.date) },
          { key: "requested", label: "Angefragt", align: "right" },
          { key: "responses", label: "Antworten", align: "right" },
          { key: "response_rate", label: "Antwortquote", align: "right", render: (event) => percent(event.response_rate) },
          { key: "average", label: "Durchschnitt", align: "right", render: (event) => average(event.average) },
          { key: "would_return_yes_rate", label: "Wieder dabei: Ja", align: "right", render: (event) => percent(event.would_return_yes_rate) },
        ]} />
    </section>

    <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-5" aria-labelledby="reviews-published-title">
      <h2 id="reviews-published-title" className="flex items-center gap-2 text-base font-semibold text-gray-800">
        <BadgeCheck aria-hidden="true" className="h-4 w-4 text-green-600" />Auf der Website ({published.length})
      </h2>
      {published.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">Noch keine Kommentare auf der Website.</p> : (
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          {published.map((review) => <CommentCard key={review.id} review={review} published disabled={disabled} busy={busyId === review.id} onTogglePublish={onTogglePublish} />)}
        </div>
      )}
    </section>
  </div>;
}

export default ReviewsOverviewView;
