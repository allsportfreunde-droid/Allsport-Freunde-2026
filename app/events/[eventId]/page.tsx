import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX } from "lucide-react";
import { getEventFull } from "@/lib/db";
import { toPublicEvent, type EventWithRegistrations } from "@/lib/types";
import EventSharePage from "./EventSharePage";

// Belegung und Status sollen beim Teilen immer aktuell sein.
export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://allsport-freunde.com";
const SITE_NAME = "Allsport Freunde 2026 e.V.";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Heutiges Datum als YYYY-MM-DD – gleiches Format wie event.date. */
function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function loadEvent(eventIdStr: string): Promise<EventWithRegistrations | null> {
  const id = Number(eventIdStr);
  if (!Number.isInteger(id) || id <= 0) return null;
  return getEventFull(id);
}

/** Nur veröffentlichte, noch nicht vergangene Events sind öffentlich teilbar. */
function isShareable(event: EventWithRegistrations): boolean {
  return event.status === "published" && event.date >= todayISO();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  const event = await loadEvent(eventId);

  if (!event || !isShareable(event)) {
    return {
      title: `Veranstaltung nicht verfügbar – ${SITE_NAME}`,
      robots: { index: false },
    };
  }

  const title = `${event.title} – ${formatDate(event.date)}`;
  const teaser = event.description?.trim().replace(/\s+/g, " ").slice(0, 160) ?? "";
  const description = `${event.time} Uhr · ${event.location}${teaser ? ` – ${teaser}` : ""}`;
  // Erstes Event-Foto, sonst das Vereinslogo als Vorschaubild.
  const image = event.images?.[0]?.url ?? `${BASE_URL}/og-default.jpg`;
  const url = `${BASE_URL}/events/${event.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, type: "website", locale: "de_DE", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await loadEvent(eventId);

  if (!event || !isShareable(event)) {
    const cancelled = event?.status === "cancelled";
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <CalendarX className="w-7 h-7 text-gray-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {cancelled ? "Diese Veranstaltung wurde abgesagt" : "Diese Veranstaltung ist nicht mehr verfügbar"}
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            {cancelled && event?.cancellation_reason
              ? event.cancellation_reason
              : "Der Link ist abgelaufen oder die Veranstaltung ist bereits vorbei. Schau dir gerne unsere kommenden Events an."}
          </p>
          <Link
            href="/#events"
            className="inline-flex items-center justify-center h-11 px-6 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Zu den aktuellen Events
          </Link>
        </div>
      </main>
    );
  }

  // Rohe Teilnehmerzahlen nie an den Browser geben – wie in der Events-Liste.
  return <EventSharePage event={toPublicEvent(event)} />;
}
