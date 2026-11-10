"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import ReviewForm from "@/components/review/ReviewForm";
import type { ReviewDraft } from "@/components/review/ReviewForm";
import type { ReviewInput } from "@/lib/review";
import type { ReviewTokenInfo } from "@/lib/types";

type Answer = NonNullable<ReviewTokenInfo["review"]>;
type SaveResult = { ok: true; review: Answer } | { ok: false; status: number; error: string };

function toDraft(review: ReviewTokenInfo["review"]): ReviewDraft {
  return {
    rating: review?.rating ?? null, would_return: review?.would_return ?? null,
    comment: review?.comment ?? "", publish_consent: review?.publish_consent ?? false,
  };
}

async function postReview(token: string, input: ReviewInput): Promise<SaveResult> {
  try {
    const response = await fetch(`/api/review/${encodeURIComponent(token)}`, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) return { ok: false, status: response.status, error: data.error ?? "Deine Bewertung konnte nicht gespeichert werden." };
    return { ok: true, review: data.review };
  } catch {
    return { ok: false, status: 0, error: "Netzwerkfehler. Bitte versuche es erneut." };
  }
}

function ReviewPage({ token, emailRating }: { token: string; emailRating: number | null }) {
  const [info, setInfo] = useState<ReviewTokenInfo | null>(null);
  const [draft, setDraft] = useState<ReviewDraft>(() => toDraft(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const initialRating = useRef(emailRating);
  const automaticSave = useRef<Promise<SaveResult> | null>(null);
  const savingRef = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/review/${encodeURIComponent(token)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) { setError(data.error ?? "Dieser Link ist ungültig."); return; }
        let next: ReviewTokenInfo = data;
        if (initialRating.current !== null && next.is_open) {
          // Die laufende Anfrage überlebt die Effekt-Wiederholung im StrictMode.
          // POST nicht abbrechen: Der Server könnte bereits gespeichert haben.
          automaticSave.current ??= postReview(token, { rating: initialRating.current });
          const result = await automaticSave.current;
          if (!active) return;
          if (result.ok) { next = { ...next, review: result.review }; setSaved(true); }
          else { setError(result.error); if (result.status === 410) next = { ...next, is_open: false }; }
          const url = new URL(window.location.href);
          url.searchParams.delete("rating");
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        }
        setInfo(next);
        setDraft(toDraft(next.review));
      } catch {
        if (active) setError("Netzwerkfehler. Bitte versuche es erneut.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; mounted.current = false; controller.abort(); };
  }, [token]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  async function save(input: ReviewInput, complete = false) {
    if (savingRef.current || !info?.is_open) return;
    savingRef.current = true;
    setSaving(true);
    setSaved(false);
    setError(null);
    const result = await postReview(token, input);
    savingRef.current = false;
    if (!mounted.current) return;
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      if (result.status === 410) setInfo((current) => current ? { ...current, is_open: false } : current);
      return;
    }
    setInfo((current) => current ? { ...current, review: result.review } : current);
    // Beim Sternklick bleiben noch nicht abgeschickte optionale Antworten erhalten.
    setDraft((current) => complete ? toDraft(result.review) : { ...current, rating: result.review.rating });
    setSaved(true);
    if (complete) setSubmitted(true);
  }

  if (loading) return (
    <main className="flex min-h-screen items-center justify-center gap-3 bg-gray-50 px-4" role="status">
      <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-green-600" /><p>Deine Bewertung wird geladen…</p>
    </main>
  );
  if (!info) return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div role="alert" className="max-w-lg text-center">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Bewertung nicht gefunden</h1>
        <p className="text-gray-600">{error ?? "Dieser Link ist ungültig."}</p>
      </div>
    </main>
  );
  return <ReviewForm info={info} value={draft} saving={saving} saved={saved} submitted={submitted} error={error}
    onChange={(change) => setDraft((current) => ({
      ...current, ...change, ...(change.comment !== undefined && !change.comment.trim() ? { publish_consent: false } : {}),
    }))}
    onRatingChange={(rating) => { void save({ rating }); }}
    onSubmit={() => { if (draft.rating !== null) void save({ ...draft, rating: draft.rating, publish_consent: !!draft.comment.trim() && draft.publish_consent }, true); }}
    onEdit={() => setSubmitted(false)} />;
}

export default function ReviewPageRoute() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const rawRating = searchParams.get("rating") ?? "";
  const emailRating = /^[1-5]$/.test(rawRating) ? Number(rawRating) : null;
  return <ReviewPage key={token} token={token} emailRating={emailRating} />;
}
