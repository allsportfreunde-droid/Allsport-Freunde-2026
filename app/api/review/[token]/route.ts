import { NextRequest, NextResponse } from "next/server";
import { getReviewTokenInfo, isPostgresConfigured, saveReview } from "@/lib/db";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/ratelimit";
import { parseReviewInput } from "@/lib/review";
import { invalidateCache } from "@/lib/cache";
import type { ReviewTokenInfo } from "@/lib/types";

const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ token: string }> };

/** Auch verschachtelte Antworten ausdrücklich auf öffentliche Felder begrenzen. */
function participantReview(review: NonNullable<ReviewTokenInfo["review"]>): NonNullable<ReviewTokenInfo["review"]> {
  return {
    rating: review.rating, would_return: review.would_return,
    comment: review.comment, publish_consent: review.publish_consent,
  };
}

export async function GET(request: NextRequest, { params }: Context) {
  try {
    if (!checkRateLimit(getClientIp(request.headers), RATE_LIMITS.review)) {
      return NextResponse.json({ error: "Zu viele Anfragen. Bitte später erneut versuchen." }, { status: 429, headers });
    }
    if (!isPostgresConfigured()) return NextResponse.json({ error: "Dieser Link ist ungültig." }, { status: 404, headers });
    const { token } = await params;
    const info = await getReviewTokenInfo(token);
    if (!info) return NextResponse.json({ error: "Dieser Link ist ungültig." }, { status: 404, headers });
    const response: ReviewTokenInfo = {
      first_name: info.first_name, event_title: info.event_title, event_date: info.event_date,
      deadline: info.deadline, is_open: info.is_open,
      review: info.review === null ? null : participantReview(info.review),
    };
    return NextResponse.json(response, { headers });
  } catch (error) {
    console.error("Fehler beim Laden der Bewertung:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500, headers });
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    if (!checkRateLimit(getClientIp(request.headers), RATE_LIMITS.review)) {
      return NextResponse.json({ error: "Zu viele Anfragen. Bitte später erneut versuchen." }, { status: 429, headers });
    }
    if (!isPostgresConfigured()) return NextResponse.json({ error: "Dieser Link ist ungültig." }, { status: 404, headers });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Bitte übermittle eine gültige Bewertung." }, { status: 400, headers });
    }
    const parsed = parseReviewInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers });
    const { token } = await params;
    const info = await getReviewTokenInfo(token);
    if (!info) return NextResponse.json({ error: "Dieser Link ist ungültig." }, { status: 404, headers });
    if (!info.is_open) {
      return NextResponse.json({ error: "Die Bewertungsfrist für dieses Event ist abgelaufen." }, { status: 410, headers });
    }
    const saved = await saveReview(info.registration_id, info.event_id, parsed.value);
    if (saved.unpublished) invalidateCache("testimonials");
    return NextResponse.json({ review: participantReview(saved.review) }, { headers });
  } catch (error) {
    console.error("Fehler beim Speichern der Bewertung:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500, headers });
  }
}
