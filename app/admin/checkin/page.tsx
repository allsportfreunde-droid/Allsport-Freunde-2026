"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  RefreshCw,
  CheckCircle2,
  Users,
} from "lucide-react";
import TodayEventCard from "@/components/admin/TodayEventCard";
import type { CheckinEvent, CheckinEventsResponse } from "@/lib/types";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function UpcomingCard({ event }: { event: CheckinEvent }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 text-sm truncate">{event.title}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {formatDate(event.date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {event.time} Uhr
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" /> {event.approved_count} Angemeldete
          </span>
        </div>
      </div>
      <Link
        href={`/admin/events/${event.id}/dashboard`}
        className="shrink-0 flex items-center gap-1.5 py-1.5 px-3 border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-medium rounded-lg transition-colors"
      >
        <LayoutDashboard className="w-3.5 h-3.5" />
        Dashboard
      </Link>
    </div>
  );
}

function PastCard({ event }: { event: CheckinEvent }) {
  return UpcomingCard({ event });
}

export default function CheckinOverviewPage() {
  const [data, setData] = useState<CheckinEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/checkin/events");
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Fehler beim Laden der Events.");
      }
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-8 w-full">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Check-In</h1>
          <p className="text-sm text-gray-500 mt-0.5">Übersicht aller veröffentlichten Events</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-green-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          {error}{" "}
          <button onClick={load} className="underline font-medium hover:no-underline">Erneut versuchen</button>
        </div>
      ) : (
        <>
          {/* ── Heute ── */}
          <section className="bg-green-50 border border-green-100 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <h2 className="font-semibold text-green-900 text-lg">Heute</h2>
              {data?.today && data.today.length > 0 && (
                <span className="ml-auto text-xs bg-green-600 text-white font-medium px-2 py-0.5 rounded-full">
                  {data.today.length} Event{data.today.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {!data?.today || data.today.length === 0 ? (
              <p className="text-sm text-green-700/60 py-4 text-center">
                Heute keine veröffentlichten Events.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.today.map((event) => (
                  <TodayEventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </section>

          {/* ── Kommende Events ── */}
          <section className="space-y-3">
            <h2 className="font-semibold text-gray-700 text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              Kommende Events
            </h2>

            {!data?.upcoming || data.upcoming.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                Keine kommenden veröffentlichten Events.
              </p>
            ) : (
              <div className="space-y-2">
                {data.upcoming.map((event) => (
                  <UpcomingCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </section>

          {/* ── Vergangene Events ── */}
          <section className="space-y-3">
            <h2 className="font-semibold text-gray-700 text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-gray-400" />
              Vergangene Events
            </h2>

            {!data?.past || data.past.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                Keine vergangenen veröffentlichten Events.
              </p>
            ) : (
              <div className="space-y-2">
                {data.past.map((event) => (
                  <PastCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
