"use client";

import Link from "next/link";
import {
  QrCode,
  LayoutDashboard,
  Clock,
  MapPin,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { formatEuro } from "@/lib/finance";
import type { CheckinEvent } from "@/lib/types";

export const categoryLabels: Record<string, string> = {
  fussball: "Fußball",
  fitness: "Fitness",
  schwimmen: "Schwimmen",
};

/** Check-In Fortschritt eines Events (eingecheckt / angemeldet). */
export function CheckinProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{value} / {max} eingecheckt</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * TodayEventCard – prominente Karte für ein Event am heutigen Tag.
 * Wird sowohl im Check-In Screen als auch auf dem Dashboard verwendet.
 */
export default function TodayEventCard({ event }: { event: CheckinEvent }) {
  const showFinance =
    event.total_costs > 0 ||
    (event.entry_price != null && event.entry_price > 0) ||
    event.total_donations > 0;
  const balance = event.actual_revenue + event.total_donations - event.total_costs;

  return (
    <div className="bg-white rounded-xl border border-green-200 shadow-sm p-5 space-y-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 text-base leading-tight">{event.title}</h3>
          <span className="shrink-0 text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
            {categoryLabels[event.category] ?? event.category}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {event.time} Uhr
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {event.location}
          </span>
        </div>
      </div>

      <CheckinProgressBar value={event.checked_in_count} max={event.approved_count} />

      {/* Compact finance line */}
      {showFinance && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 pt-1 border-t border-gray-100">
          {event.total_costs > 0 && (
            <span>Kosten: <strong className="text-gray-700">{formatEuro(event.total_costs)}</strong></span>
          )}
          {event.entry_price != null && event.entry_price > 0 && (
            <span>
              Umsatz: <strong className="text-gray-700">{formatEuro(event.actual_revenue)}</strong>
              <span className="text-gray-400"> / {formatEuro(event.expected_revenue)} erw.</span>
            </span>
          )}
          {event.total_donations > 0 && (
            <span className="text-rose-600">
              +<strong>{formatEuro(event.total_donations)}</strong> Spenden
            </span>
          )}
          {event.total_costs > 0 && (
            <span className={`flex items-center gap-0.5 font-semibold ${balance > 0 ? "text-green-600" : balance < 0 ? "text-red-600" : "text-gray-500"}`}>
              {balance > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {balance > 0 ? "+" : ""}{formatEuro(balance)}
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Link
          href={`/admin/events/${event.id}/scanner`}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <QrCode className="w-4 h-4" />
          Scanner öffnen
        </Link>
        <Link
          href={`/admin/events/${event.id}/dashboard`}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </Link>
      </div>
    </div>
  );
}
