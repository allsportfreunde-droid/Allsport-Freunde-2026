"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, RefreshCw, ArrowRight } from "lucide-react";
import StatsCards from "@/components/admin/StatsCards";
import TodayEventCard from "@/components/admin/TodayEventCard";
import type { CheckinEvent, CheckinEventsResponse } from "@/lib/types";

/**
 * TodayEvents – zeigt auf dem Dashboard die heutigen Events prominent an
 * (gleiche Darstellung wie im Check-In Screen). Nur wenn heute kein Event
 * stattfindet, werden stattdessen die Kennzahlen angezeigt.
 */
export default function TodayEvents() {
  const [today, setToday] = useState<CheckinEvent[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/admin/checkin/events");
      if (!res.ok) throw new Error("request failed");
      const data: CheckinEventsResponse = await res.json();
      setToday(data.today ?? []);
    } catch {
      // Kennzahlen als Fallback anzeigen
      setToday([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <RefreshCw className="w-6 h-6 animate-spin text-green-600" />
      </div>
    );
  }

  // Kein Event heute → Kennzahlen wie gewohnt
  if (!today || today.length === 0) {
    return <StatsCards />;
  }

  return (
    <section className="bg-green-50 border border-green-100 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-600" />
        <h2 className="font-semibold text-green-900 text-lg">Heute</h2>
        <span className="text-xs bg-green-600 text-white font-medium px-2 py-0.5 rounded-full">
          {today.length} Event{today.length > 1 ? "s" : ""}
        </span>
        <Link
          href="/admin/checkin"
          className="ml-auto flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-900 transition-colors"
        >
          Zum Check-In
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {today.map((event) => (
          <TodayEventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
