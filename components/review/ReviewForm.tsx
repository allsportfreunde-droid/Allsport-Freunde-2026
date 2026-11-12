"use client";

import Link from "next/link";
import { Calendar, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewTokenInfo, ReviewWouldReturn } from "@/lib/types";

export interface ReviewDraft {
  rating: number | null;
  would_return: ReviewWouldReturn | null;
  comment: string;
  publish_consent: boolean;
}

interface Props {
  info: ReviewTokenInfo;
  value?: ReviewDraft;
  saving?: boolean;
  saved?: boolean;
  submitted?: boolean;
  error?: string | null;
  onChange?: (change: Partial<ReviewDraft>) => void;
  onRatingChange?: (rating: number) => void;
  onSubmit?: () => void;
  onEdit?: () => void;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(date));
}

/** Reine Ansicht: Daten und Aktionen kommen vollständig aus den Props. */
export default function ReviewForm({ info, value, saving = false, saved = false, submitted = false, error, onChange, onRatingChange, onSubmit, onEdit }: Props) {
  const draft: ReviewDraft = value ?? {
    rating: info.review?.rating ?? null, would_return: info.review?.would_return ?? null,
    comment: info.review?.comment ?? "", publish_consent: info.review?.publish_consent ?? false,
  };
  const hasComment = draft.comment.trim().length > 0;
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg space-y-5">
        <p className="text-center text-sm font-semibold text-green-700">Allsport Freunde 2026 e.V.</p>
        <Card>
          <CardHeader className="space-y-3">
            <p className="text-sm text-gray-600">Assalamu Alaikum {info.first_name}</p>
            <h1 className="text-2xl font-bold text-gray-900">{info.event_title}</h1>
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar aria-hidden="true" className="h-4 w-4" />{formatDate(info.event_date)}
            </p>
          </CardHeader>
          <CardContent>
            {error && <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {!info.is_open ? (
              <div className="space-y-4">
                <p className="text-gray-700">Die Bewertung für dieses Event ist geschlossen.</p>
                <p className="text-sm text-gray-600">
                  Deine Einwilligung zur Veröffentlichung kannst du weiterhin durch <Link href="/#kontakt" className="text-green-700 underline underline-offset-2">Kontaktaufnahme mit dem Verein</Link> widerrufen.
                </p>
                {info.review && <p aria-label={`${info.review.rating} von 5 Sternen`} className="text-3xl tracking-wider text-amber-500">
                  <span aria-hidden="true">{"★".repeat(info.review.rating)}{"☆".repeat(5 - info.review.rating)}</span>
                </p>}
              </div>
            ) : submitted ? (
              <div className="space-y-5">
                <h2 className="text-xl font-semibold text-gray-900">Danke für dein Feedback! 🤍</h2>
                <p className="text-sm text-gray-600">Du kannst deine Bewertung bis {formatDate(info.deadline)} ändern.</p>
                <Button type="button" variant="outline" size="lg" onClick={onEdit}>Bewertung ändern</Button>
              </div>
            ) : (
              <form className="space-y-7" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }} aria-busy={saving}>
                <fieldset disabled={saving} className="space-y-2">
                  <legend className="font-semibold text-gray-900">Wie hat dir das Event gefallen?</legend>
                  <div className="flex gap-1" role="group" aria-label="Bewertung mit Sternen">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <Button key={rating} type="button" variant="ghost" className="h-12 w-12 p-1 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                        aria-label={`${rating} von 5 Sternen`} aria-pressed={draft.rating === rating}
                        onClick={() => onRatingChange?.(rating)}>
                        <Star aria-hidden="true" className="h-8 w-8" fill={rating <= (draft.rating ?? 0) ? "currentColor" : "none"} />
                      </Button>
                    ))}
                  </div>
                  <p role="status" aria-live="polite" className="min-h-5 text-sm text-green-700">
                    {saving ? "Wird gespeichert…" : saved ? "Gespeichert ✓" : "1 = gar nicht · 5 = super"}
                  </p>
                </fieldset>
                <fieldset disabled={saving} className="space-y-3">
                  <legend className="font-semibold text-gray-900">Würdest du wieder mitmachen?</legend>
                  <div className="flex flex-wrap gap-2">
                    {([ ["ja", "Ja"], ["vielleicht", "Vielleicht"], ["nein", "Nein"] ] as const).map(([choice, label]) => (
                      <Button key={choice} type="button" variant={draft.would_return === choice ? "default" : "outline"} className="min-h-11"
                        aria-pressed={draft.would_return === choice} onClick={() => onChange?.({ would_return: draft.would_return === choice ? null : choice })}>
                        {label}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                <div className="space-y-2">
                  <label htmlFor="review-comment" className="block font-semibold text-gray-900">Was sollen wir beibehalten oder besser machen?</label>
                  <Textarea id="review-comment" value={draft.comment} maxLength={2000} rows={5} disabled={saving}
                    aria-describedby="review-comment-count" onChange={(event) => onChange?.({ comment: event.target.value })} />
                  <p id="review-comment-count" className="text-right text-xs text-gray-500">{draft.comment.length} / 2000 Zeichen</p>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="review-consent" aria-labelledby="review-consent-label" className="h-11 w-11"
                    checked={hasComment && draft.publish_consent} disabled={saving || !hasComment}
                    onChange={(event) => onChange?.({ publish_consent: event.target.checked })} />
                  <div className="pt-2 text-sm leading-relaxed text-gray-600">
                    <label id="review-consent-label" htmlFor="review-consent">
                      Mein Kommentar darf mit Vorname und Anfangsbuchstaben des Nachnamens (z. B. „Ahmet K.“) auf der Website von Allsport Freunde gezeigt werden. Diese Einwilligung kann ich innerhalb der Bewertungsfrist über diesen Link oder jederzeit durch Kontaktaufnahme mit dem Verein widerrufen.
                    </label>{" "}
                    <Link href="/datenschutz" target="_blank" rel="noopener noreferrer" className="text-green-700 underline underline-offset-2">Datenschutz</Link>
                  </div>
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={saving || draft.rating === null}>{saving ? "Wird gespeichert…" : "Absenden"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-gray-500">Gemeinsam sportlich in der Rhein-Main-Region</p>
      </div>
    </main>
  );
}
