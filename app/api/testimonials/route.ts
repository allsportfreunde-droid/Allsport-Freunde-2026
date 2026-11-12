import { NextResponse } from "next/server";
import { getPublicTestimonials, isPostgresConfigured } from "@/lib/db";
import { getFromCache, setCache } from "@/lib/cache";
import type { PublicTestimonialsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE_KEY = "testimonials:public";
const EMPTY: PublicTestimonialsResponse = { average: null, count: 0, items: [] };
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    if (!isPostgresConfigured()) return NextResponse.json(EMPTY, { headers });
    const cached = getFromCache<PublicTestimonialsResponse>(CACHE_KEY);
    if (cached !== null) return NextResponse.json(cached, { headers });
    const testimonials = await getPublicTestimonials(6);
    setCache(CACHE_KEY, testimonials);
    return NextResponse.json(testimonials, { headers });
  } catch (error) {
    console.error("Fehler beim Laden der Teilnehmerstimmen:", error);
    return NextResponse.json(EMPTY, { headers });
  }
}
