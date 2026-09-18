"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  UserCheck,
  UserX,
  UserPlus,
  UsersRound,
  Search,
  Info,
  X,
  Loader2,
  CalendarCheck,
  Phone,
  Mail,
  User,
} from "lucide-react";
import ChildBadge from "@/components/ChildBadge";
import type { EventWithRegistrations, RegistrationWithEvent } from "@/lib/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPast(dateIso: string) {
  return dateIso < new Date().toISOString().split("T")[0];
}

// ─── participant categorisation ─────────────────────────────────────────────

type ParticipantCategory = "checkin" | "walkin" | "noshow";

function categorise(r: RegistrationWithEvent): ParticipantCategory {
  if (r.is_walk_in) return "walkin";
  if (r.checked_in_at) return "checkin";
  return "noshow";
}

// ─── status badge ────────────────────────────────────────────────────────────

function ParticipantBadge({ cat }: { cat: ParticipantCategory }) {
  if (cat === "checkin") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
        <UserCheck className="w-3 h-3" />
        Eingecheckt
      </span>
    );
  }
  if (cat === "walkin") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
        <UserPlus className="w-3 h-3" />
        Walk-In
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <UserX className="w-3 h-3" />
      No-Show
    </span>
  );
}

// ─── info modal ──────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 min-w-[140px] shrink-0">{label}</span>
      <span className="text-sm text-gray-900 break-words min-w-0 flex-1">
        {value != null && value !== "" ? value : <span className="text-gray-400">—</span>}
      </span>
    </div>
  );
}

function ParticipantInfoModal({
  reg,
  onClose,
}: {
  reg: RegistrationWithEvent;
  onClose: () => void;
}) {
  const cat = categorise(reg);

  // close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  // lock scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* sheet */}
      <div
        className="relative z-50 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-border bg-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-4 sm:zoom-in-95"
        role="dialog"
        aria-modal="true"
      >
        {/* sticky header */}
        <div className="sticky top-0 bg-background z-10 flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {reg.first_name} {reg.last_name}
            </h2>
            <div className="mt-1">
              <ParticipantBadge cat={cat} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="px-6 py-5 space-y-5">
          {/* Kontaktdaten */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Kontaktdaten
              </h3>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-1">
              <InfoRow label="Vorname" value={reg.first_name} />
              <InfoRow label="Nachname" value={reg.last_name} />
              <InfoRow
                label="Telefonnummer"
                value={
                  reg.phone ? (
                    <a
                      href={`tel:${reg.phone}`}
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3" />
                      {reg.phone}
                    </a>
                  ) : null
                }
              />
              <InfoRow
                label="E-Mail"
                value={
                  reg.email ? (
                    <a
                      href={`mailto:${reg.email}`}
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" />
                      {reg.email}
                    </a>
                  ) : null
                }
              />
            </div>
          </div>

          {/* Teilnahme-Details */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CalendarCheck className="w-4 h-4 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Teilnahme
              </h3>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-1">
              <InfoRow label="Status" value={<ParticipantBadge cat={cat} />} />
              <InfoRow
                label="Begleitpersonen"
                value={
                  (reg.person_count - 1) > 0
                    ? `${reg.person_count - 1} Person${(reg.person_count - 1) !== 1 ? "en" : ""}`
                    : "Keine"
                }
              />
              {reg.child_count > 0 && (
                <InfoRow
                  label="Davon Kinder"
                  value={`${reg.child_count} Kind${reg.child_count !== 1 ? "er" : ""} (U18)`}
                />
              )}
              {reg.checked_in_at && (
                <InfoRow
                  label="Eingecheckt um"
                  value={formatDateTime(reg.checked_in_at)}
                />
              )}
              {reg.checked_in_by && (
                <InfoRow label="Eingecheckt von" value={reg.checked_in_by} />
              )}
              {reg.notes && (
                <InfoRow label="Notizen" value={reg.notes} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── metric card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: "gray" | "green" | "blue" | "red" | "amber" | "purple";
  icon: React.ReactNode;
}) {
  const styles: Record<
    typeof color,
    { card: string; icon: string; value: string }
  > = {
    gray:   { card: "bg-gray-50   border-gray-200",  icon: "text-gray-500",  value: "text-gray-900"  },
    green:  { card: "bg-green-50  border-green-200", icon: "text-green-600", value: "text-green-800" },
    blue:   { card: "bg-blue-50   border-blue-100",  icon: "text-blue-500",  value: "text-blue-900"  },
    red:    { card: "bg-red-50    border-red-200",   icon: "text-red-500",   value: "text-red-800"   },
    amber:  { card: "bg-amber-50  border-amber-200", icon: "text-amber-600", value: "text-amber-900" },
    purple: { card: "bg-purple-50 border-purple-200",icon: "text-purple-500",value: "text-purple-900"},
  };
  const s = styles[color];

  return (
    <div className={`rounded-xl border p-4 space-y-1.5 ${s.card}`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${s.icon}`}>
        {icon}
        {label}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${s.value}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

// ─── filter types ─────────────────────────────────────────────────────────────

type FilterKey = "all" | "checkin" | "walkin" | "noshow";

const filterLabels: Record<FilterKey, string> = {
  all: "Alle",
  checkin: "Eingecheckt",
  walkin: "Walk-In",
  noshow: "No-Show",
};

// ─── main page ───────────────────────────────────────────────────────────────

export default function EventReportPage() {
  const params = useParams();
  const eventId = Number(params.id);

  const [event, setEvent] = useState<EventWithRegistrations | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [infoTarget, setInfoTarget] = useState<RegistrationWithEvent | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [evRes, regRes] = await Promise.all([
          fetch(`/api/admin/events/${eventId}`),
          fetch(`/api/admin/events/${eventId}/registrations`),
        ]);
        if (!evRes.ok) throw new Error("Event nicht gefunden.");
        if (!regRes.ok) throw new Error("Anmeldungen konnten nicht geladen werden.");
        const [evData, regData] = await Promise.all([evRes.json(), regRes.json()]);
        setEvent(evData);
        setRegistrations(regData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  // Only approved registrations matter for the report
  const approved = useMemo(
    () => registrations.filter((r) => r.status === "approved"),
    [registrations]
  );

  // Category splits
  const checkins  = useMemo(() => approved.filter((r) => !r.is_walk_in && r.checked_in_at), [approved]);
  const walkIns   = useMemo(() => approved.filter((r) => r.is_walk_in), [approved]);
  const noShows   = useMemo(() => approved.filter((r) => !r.is_walk_in && !r.checked_in_at), [approved]);
  const registered = useMemo(() => approved.filter((r) => !r.is_walk_in), [approved]);

  // KPI values
  const totalPresent = useMemo(
    () => [...checkins, ...walkIns].reduce((s, r) => s + r.person_count, 0),
    [checkins, walkIns]
  );
  const totalGuests = useMemo(
    () => [...checkins, ...walkIns].reduce((s, r) => s + (r.person_count - 1), 0),
    [checkins, walkIns]
  );
  const noShowRate = registered.length > 0
    ? ((noShows.length / registered.length) * 100).toFixed(1)
    : null;

  // Table data: filter + search
  const tableData = useMemo(() => {
    let base = approved;
    if (activeFilter === "checkin") base = checkins;
    else if (activeFilter === "walkin") base = walkIns;
    else if (activeFilter === "noshow") base = noShows;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      base = base.filter(
        (r) =>
          r.first_name.toLowerCase().includes(q) ||
          r.last_name.toLowerCase().includes(q)
      );
    }

    return [...base].sort((a, b) => {
      const na = `${a.last_name} ${a.first_name}`.toLowerCase();
      const nb = `${b.last_name} ${b.first_name}`.toLowerCase();
      return na.localeCompare(nb, "de");
    });
  }, [approved, checkins, walkIns, noShows, activeFilter, search]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-green-600" />
      </div>
    );
  }

  // ── Error ──
  if (error || !event) {
    return (
      <div className="p-6 space-y-4">
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Zur Eventliste
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-center">
          {error ?? "Daten konnten nicht geladen werden."}
        </div>
      </div>
    );
  }

  // ── Future event guard ──
  if (!isPast(event.date) && event.status !== "cancelled") {
    return (
      <div className="p-6 space-y-4 max-w-xl mx-auto">
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Zur Eventliste
        </Link>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center space-y-3">
          <CalendarCheck className="w-10 h-10 text-amber-400 mx-auto" />
          <p className="font-semibold text-amber-900">{event.title}</p>
          <p className="text-sm text-amber-700">
            Diese Veranstaltung hat noch nicht stattgefunden.
            <br />
            Die Auswertung ist erst nach dem{" "}
            <strong>{formatDate(event.date)}</strong> verfügbar.
          </p>
          <Link
            href={`/admin/events/${eventId}/registrations`}
            className="inline-block mt-2 text-sm text-amber-700 underline hover:text-amber-900"
          >
            Anmeldungen anzeigen →
          </Link>
        </div>
      </div>
    );
  }

  const filterCounts: Record<FilterKey, number> = {
    all:     approved.length,
    checkin: checkins.length,
    walkin:  walkIns.length,
    noshow:  noShows.length,
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="space-y-1">
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zur Eventliste
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {formatDate(event.date)}
              {event.time && ` · ${event.time} Uhr`}
              {event.location && ` · ${event.location}`}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 self-start shrink-0">
            Auswertung
          </span>
        </div>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Teilnehmer gesamt"
          value={totalPresent}
          sub="tatsächlich anwesend"
          color="green"
          icon={<Users className="w-3.5 h-3.5" />}
        />
        <MetricCard
          label="Anmeldungen"
          value={registered.length}
          sub="vorher registriert"
          color="gray"
          icon={<User className="w-3.5 h-3.5" />}
        />
        <MetricCard
          label="Check-Ins"
          value={checkins.length}
          sub="angemeldet & da"
          color="green"
          icon={<UserCheck className="w-3.5 h-3.5" />}
        />
        <MetricCard
          label="Walk-Ins"
          value={walkIns.length}
          sub="ohne Anmeldung"
          color="blue"
          icon={<UserPlus className="w-3.5 h-3.5" />}
        />
        <MetricCard
          label="No-Shows"
          value={noShows.length}
          sub={
            noShowRate !== null
              ? `${noShowRate} % der Anmeldungen`
              : "keine Anmeldungen"
          }
          color={noShows.length > 0 ? "red" : "gray"}
          icon={<UserX className="w-3.5 h-3.5" />}
        />
        <MetricCard
          label="Begleitpersonen"
          value={totalGuests}
          sub="mitgekommen"
          color="purple"
          icon={<UsersRound className="w-3.5 h-3.5" />}
        />
      </div>

      {/* ── Participant list ── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Teilnehmerliste</h2>

        {/* Filter + search bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Filter buttons */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "checkin", "walkin", "noshow"] as FilterKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  activeFilter === key
                    ? key === "checkin"
                      ? "bg-green-600 text-white border-green-600"
                      : key === "walkin"
                      ? "bg-blue-600 text-white border-blue-600"
                      : key === "noshow"
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-gray-800 text-white border-gray-800"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {filterLabels[key]}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    activeFilter === key ? "bg-white/25" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {filterCounts[key]}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Name suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            />
          </div>
        </div>

        {/* Table */}
        {tableData.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl py-14 flex flex-col items-center gap-3">
            <Users className="w-10 h-10 text-gray-200" />
            <p className="text-sm text-gray-500">
              {search
                ? "Keine Ergebnisse für diese Suche."
                : "Keine Einträge in dieser Kategorie."}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide hidden sm:table-cell">
                      Begleitpersonen
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide w-16">
                      Info
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((reg, i) => {
                    const cat = categorise(reg);
                    return (
                      <tr
                        key={reg.id}
                        className={`border-b border-gray-50 last:border-0 ${
                          i % 2 === 1 ? "bg-gray-50/30" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {reg.first_name} {reg.last_name}
                          {/* mobile: show badge inline */}
                          <div className="sm:hidden mt-0.5">
                            <ParticipantBadge cat={cat} />
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <ParticipantBadge cat={cat} />
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600 hidden sm:table-cell">
                          <span className="inline-flex items-center gap-1.5">
                            {(reg.person_count - 1) > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <UsersRound className="w-3.5 h-3.5 text-gray-400" />
                                {reg.person_count - 1}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                            {reg.child_count > 0 && <ChildBadge count={reg.child_count} />}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setInfoTarget(reg)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors inline-flex"
                            title="Details anzeigen"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40">
              <p className="text-xs text-gray-500">
                {tableData.length} Eintrag{tableData.length !== 1 ? "e" : ""}
                {activeFilter !== "all" && ` · Filter: ${filterLabels[activeFilter]}`}
                {search && ` · Suche: „${search}"`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Info Modal ── */}
      {infoTarget && (
        <ParticipantInfoModal
          reg={infoTarget}
          onClose={() => setInfoTarget(null)}
        />
      )}
    </div>
  );
}
