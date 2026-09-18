"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Pencil, Trash2, Users, Loader2, Search, Ban, Globe, EyeOff, TrendingUp, TrendingDown, Minus, History, ArrowRight } from "lucide-react";
import type { EventWithRegistrations } from "@/lib/types";
import { formatEuro } from "@/lib/finance";

type CategoryFilter = "alle" | "fussball" | "fitness" | "schwimmen";

const today = new Date().toISOString().split("T")[0];

function isPastEvent(event: EventWithRegistrations): boolean {
  return event.status !== "draft" && event.status !== "cancelled" && event.date < today;
}

function FinanceSummary({ event }: { event: EventWithRegistrations }) {
  const hasPrice = event.entry_price != null && event.entry_price > 0;
  const costs = event.total_costs ?? 0;
  const actual = event.actual_revenue ?? 0;
  const expected = event.expected_revenue ?? 0;
  const donations = event.total_donations ?? 0;
  const balance = actual + donations - costs;

  if (!hasPrice && costs === 0 && donations === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
      {costs > 0 && (
        <span className="flex items-center gap-0.5">
          Kosten: <strong className="ml-0.5 text-gray-700">{formatEuro(costs)}</strong>
        </span>
      )}
      {hasPrice && (
        <span className="flex items-center gap-0.5">
          Umsatz: <strong className="ml-0.5 text-gray-700">{formatEuro(actual)}</strong>
          <span className="text-gray-400 ml-0.5">(erw. {formatEuro(expected)})</span>
        </span>
      )}
      {donations > 0 && (
        <span className="flex items-center gap-0.5 text-rose-600">
          +<strong className="ml-0.5">{formatEuro(donations)}</strong> Spenden
        </span>
      )}
      {(hasPrice || donations > 0) && costs > 0 && (
        <span className={`flex items-center gap-0.5 font-semibold ${balance > 0 ? "text-green-600" : balance < 0 ? "text-red-600" : "text-gray-500"}`}>
          {balance > 0 ? <TrendingUp className="w-3 h-3" /> : balance < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          {formatEuro(balance)}
        </span>
      )}
    </div>
  );
}

function PastEventSummary({ event }: { event: EventWithRegistrations }) {
  const totalReg = event.total_registrations ?? 0;
  const checkinCount = event.checkin_count ?? 0;
  const walkInCount = event.walk_in_count ?? 0;
  const noShowRate = totalReg > 0 ? ((totalReg - checkinCount) / totalReg * 100) : null;

  const costs = event.total_costs ?? 0;
  const actual = event.actual_revenue ?? 0;
  const donations = event.total_donations ?? 0;
  const balance = actual + donations - costs;
  const hasFinancials =
    (event.entry_price != null && event.entry_price > 0) || costs > 0 || donations > 0;

  return (
    <div className="mt-1.5 space-y-1">
      {/* Financial result + link */}
      {hasFinancials && (
        <div className="flex items-center gap-3 text-xs">
          <Link
            href={`/admin/finanzen/${event.id}`}
            className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 hover:underline"
          >
            Finanzdetails
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
      {/* Report link */}
      <div className="text-xs">
        <Link
          href={`/admin/events/${event.id}/report`}
          className="inline-flex items-center gap-0.5 text-gray-500 hover:text-gray-800 hover:underline"
        >
          Auswertung
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

function getPublishedStatus(event: EventWithRegistrations): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "cancelled";
} {
  if (event.status === "cancelled") return { label: "Abgesagt", variant: "cancelled" };
  if (event.date < today) return { label: "Beendet", variant: "secondary" };
  if (event.current_participants >= event.max_participants)
    return { label: "Ausgebucht", variant: "secondary" };
  return { label: "Aktiv", variant: "default" };
}

const categoryLabels: Record<string, string> = {
  fussball: "Fußball",
  fitness: "Fitness",
  schwimmen: "Schwimmen",
};

function MobileEventCard({
  event,
  past,
  onDelete,
  onCancel,
  onPublish,
  onUnpublish,
  formatDate,
}: {
  event: EventWithRegistrations;
  past?: boolean;
  onDelete: (e: EventWithRegistrations) => void;
  onCancel: (e: EventWithRegistrations) => void;
  onPublish: (e: EventWithRegistrations) => void;
  onUnpublish: (e: EventWithRegistrations) => void;
  formatDate: (d: string) => string;
}) {
  const isDraft = event.status === "draft";
  const cardBg = isDraft
    ? "bg-amber-50/40 border-amber-200"
    : past
    ? "bg-gray-50/80 border-gray-200"
    : "bg-white border-gray-200";

  return (
    <div className={`border rounded-lg p-4 shadow-sm overflow-hidden ${cardBg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 truncate">{event.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatDate(event.date)} · {event.location}
          </p>
        </div>
        <div className="shrink-0">
          {isDraft ? (
            <Badge variant="draft">Entwurf</Badge>
          ) : (
            <Badge variant={getPublishedStatus(event).variant}>
              {getPublishedStatus(event).label}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <Badge variant={event.category as "fussball" | "fitness" | "schwimmen"}>
          {categoryLabels[event.category]}
        </Badge>
        {!isDraft && (
          <span className="text-xs text-gray-500">
            {event.current_participants}/{event.max_participants} Plätze
          </span>
        )}
      </div>

      {past ? <PastEventSummary event={event} /> : !isDraft ? <FinanceSummary event={event} /> : null}

      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
        <Link href={`/admin/events/${event.id}/edit`}>
          <Button variant="outline" size="sm" className="w-full">
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </Link>

        {!isDraft ? (
          <Link href={`/admin/events/${event.id}/registrations`}>
            <Button variant="outline" size="sm" className="w-full">
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Anmeldungen
            </Button>
          </Link>
        ) : (
          <Button variant="outline" size="sm" className="w-full text-green-600" onClick={() => onPublish(event)}>
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            Veröffentlichen
          </Button>
        )}

        {event.status === "published" && (
          <Button variant="outline" size="sm" className="w-full text-amber-600" onClick={() => onUnpublish(event)}>
            <EyeOff className="w-3.5 h-3.5 mr-1.5" />
            Zurückziehen
          </Button>
        )}

        {event.status !== "cancelled" && (
          <Button variant="outline" size="sm" className="w-full text-purple-600" onClick={() => onCancel(event)}>
            <Ban className="w-3.5 h-3.5 mr-1.5" />
            Absagen
          </Button>
        )}

        <Button variant="outline" size="sm" className="w-full text-red-500" onClick={() => onDelete(event)}>
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Löschen
        </Button>
      </div>
    </div>
  );
}

function EventRow({
  event,
  past,
  onDelete,
  onCancel,
  onPublish,
  onUnpublish,
  formatDate,
}: {
  event: EventWithRegistrations;
  past?: boolean;
  onDelete: (e: EventWithRegistrations) => void;
  onCancel: (e: EventWithRegistrations) => void;
  onPublish: (e: EventWithRegistrations) => void;
  onUnpublish: (e: EventWithRegistrations) => void;
  formatDate: (d: string) => string;
}) {
  const isDraft = event.status === "draft";

  return (
    <TableRow
      className={
        isDraft
          ? "bg-amber-50/40"
          : past
          ? "bg-gray-50/80 text-gray-600"
          : undefined
      }
    >
      <TableCell className="font-medium">
        <div>
          <span className={past ? "text-gray-700" : undefined}>{event.title}</span>
          {past ? (
            <PastEventSummary event={event} />
          ) : (
            <FinanceSummary event={event} />
          )}
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant={event.category as "fussball" | "fitness" | "schwimmen"}>
          {categoryLabels[event.category]}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell">{formatDate(event.date)}</TableCell>
      <TableCell className="hidden lg:table-cell max-w-[200px] truncate">
        {event.location}
      </TableCell>
      <TableCell className="hidden lg:table-cell">{event.price}</TableCell>
      <TableCell>
        {isDraft ? "–" : `${event.current_participants}/${event.max_participants}`}
      </TableCell>
      <TableCell>
        {isDraft ? (
          <Badge variant="draft">Entwurf</Badge>
        ) : (
          <Badge variant={getPublishedStatus(event).variant}>
            {getPublishedStatus(event).label}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Link href={`/admin/events/${event.id}/edit`}>
            <Button variant="ghost" size="icon" title="Bearbeiten">
              <Pencil className="w-4 h-4" />
            </Button>
          </Link>
          {!isDraft && (
            <Link href={`/admin/events/${event.id}/registrations`}>
              <Button variant="ghost" size="icon" title="Anmeldungen">
                <Users className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {isDraft && (
            <Button
              variant="ghost"
              size="icon"
              title="Veröffentlichen"
              onClick={() => onPublish(event)}
            >
              <Globe className="w-4 h-4 text-green-600" />
            </Button>
          )}
          {event.status === "published" && (
            <Button
              variant="ghost"
              size="icon"
              title="Zurückziehen"
              onClick={() => onUnpublish(event)}
            >
              <EyeOff className="w-4 h-4 text-amber-600" />
            </Button>
          )}
          {event.status !== "cancelled" && (
            <Button
              variant="ghost"
              size="icon"
              title="Veranstaltung absagen"
              onClick={() => onCancel(event)}
            >
              <Ban className="w-4 h-4 text-purple-600" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            title="Löschen"
            onClick={() => onDelete(event)}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function EventTable() {
  const router = useRouter();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventWithRegistrations[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("alle");
  const [search, setSearch] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<EventWithRegistrations | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Cancel state
  const [cancelTarget, setCancelTarget] = useState<EventWithRegistrations | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Publish / unpublish state
  const [publishing, setPublishing] = useState<number | null>(null);
  const [publishTarget, setPublishTarget] = useState<EventWithRegistrations | null>(null);

  const fetchEvents = () => {
    setLoading(true);
    fetch("/api/admin/events")
      .then((r) => r.json())
      .then((data) => {
        // Bei einem Serverfehler kommt { error: "..." } statt einer Liste –
        // ungeprüft übernommen zerlegt das später den Filter mit einem
        // nichtssagenden "events.filter is not a function".
        if (!Array.isArray(data)) {
          throw new Error(data?.error || "Unerwartete Antwort vom Server.");
        }
        setEvents(data);
      })
      .catch((err) => toast(err?.message || "Events konnten nicht geladen werden.", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // Apply search + category filter
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (categoryFilter !== "alle" && e.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.title.toLowerCase().includes(q) && !e.location.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [events, categoryFilter, search]);

  // Upcoming: published/cancelled with date >= today
  const upcomingEvents = useMemo(
    () =>
      filtered
        .filter((e) => e.status !== "draft" && e.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [filtered]
  );

  // Past: published (not cancelled) with date < today
  const pastEvents = useMemo(
    () =>
      filtered
        .filter((e) => isPastEvent(e))
        .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
    [filtered]
  );

  // Drafts
  const draftEvents = useMemo(
    () =>
      filtered
        .filter((e) => e.status === "draft")
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [filtered]
  );

  const formatDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  // ── Handlers ──

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/events/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Fehler beim Löschen.", "error");
        return;
      }
      toast("Event gelöscht!", "success");
      setDeleteTarget(null);
      fetchEvents();
      router.refresh();
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/events/${cancelTarget.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Fehler beim Absagen.", "error");
        return;
      }
      toast(
        `Veranstaltung abgesagt. ${data.emailsSent} E-Mail${data.emailsSent === 1 ? "" : "s"} versendet.`,
        "success"
      );
      setCancelTarget(null);
      setCancelReason("");
      fetchEvents();
      router.refresh();
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setCancelling(false);
    }
  };

  const handlePublish = async (event: EventWithRegistrations) => {
    setPublishTarget(null);
    setPublishing(event.id);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Fehler beim Veröffentlichen.", "error");
        return;
      }
      toast("Event veröffentlicht!", "success");
      fetchEvents();
      router.refresh();
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setPublishing(null);
    }
  };

  const handleUnpublish = async (event: EventWithRegistrations) => {
    setPublishing(event.id);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/publish`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Fehler beim Zurückziehen.", "error");
        return;
      }
      toast("Event zurück in Planung gesetzt.", "success");
      fetchEvents();
      router.refresh();
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setPublishing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-green-600" />
      </div>
    );
  }

  const tableColumns = (
    <TableHeader>
      <TableRow>
        <TableHead>Titel</TableHead>
        <TableHead className="hidden sm:table-cell">Kategorie</TableHead>
        <TableHead className="hidden md:table-cell">Datum</TableHead>
        <TableHead className="hidden lg:table-cell">Ort</TableHead>
        <TableHead className="hidden lg:table-cell">Preis</TableHead>
        <TableHead>Plätze</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Aktionen</TableHead>
      </TableRow>
    </TableHeader>
  );

  const rowProps = {
    onDelete: setDeleteTarget,
    onCancel: (e: EventWithRegistrations) => {
      setCancelTarget(e);
      setCancelReason("");
    },
    onPublish: setPublishTarget,
    onUnpublish: handleUnpublish,
    formatDate,
  };

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Titel oder Ort suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
          className="w-full sm:w-40"
        >
          <option value="alle">Alle Kategorien</option>
          <option value="fussball">Fußball</option>
          <option value="fitness">Fitness</option>
          <option value="schwimmen">Schwimmen</option>
        </Select>
      </div>

      {/* ── Section 1: Upcoming published events ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-green-600" />
          Kommende Veranstaltungen
          <span className="text-xs font-normal text-muted-foreground">
            ({upcomingEvents.length})
          </span>
        </h2>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 pl-1">
            Keine kommenden Events gefunden.
          </p>
        ) : (
          <>
            <div className="hidden md:block border rounded-lg">
              <Table>
                {tableColumns}
                <TableBody>
                  {upcomingEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      {...rowProps}
                      onPublish={publishing === event.id ? () => {} : rowProps.onPublish}
                      onUnpublish={publishing === event.id ? () => {} : rowProps.onUnpublish}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden space-y-3">
              {upcomingEvents.map((event) => (
                <MobileEventCard
                  key={event.id}
                  event={event}
                  {...rowProps}
                  onPublish={publishing === event.id ? () => {} : rowProps.onPublish}
                  onUnpublish={publishing === event.id ? () => {} : rowProps.onUnpublish}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Section 2: Past events ── */}
      {(pastEvents.length > 0 || search || categoryFilter !== "alle") && (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-gray-400" />
            Vergangene Veranstaltungen
            <span className="text-xs font-normal text-muted-foreground">
              ({pastEvents.length})
            </span>
          </h2>
          {pastEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 pl-1">
              Keine vergangenen Events gefunden.
            </p>
          ) : (
            <>
              <div className="hidden md:block border rounded-lg border-gray-200 bg-gray-50/40">
                <Table>
                  {tableColumns}
                  <TableBody>
                    {pastEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        past
                        {...rowProps}
                        onPublish={publishing === event.id ? () => {} : rowProps.onPublish}
                        onUnpublish={publishing === event.id ? () => {} : rowProps.onUnpublish}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-3">
                {pastEvents.map((event) => (
                  <MobileEventCard
                    key={event.id}
                    event={event}
                    past
                    {...rowProps}
                    onPublish={publishing === event.id ? () => {} : rowProps.onPublish}
                    onUnpublish={publishing === event.id ? () => {} : rowProps.onUnpublish}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Section 3: Draft events ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <EyeOff className="w-4 h-4 text-amber-500" />
          In Planung (Entwürfe)
          <span className="text-xs font-normal text-muted-foreground">
            ({draftEvents.length})
          </span>
        </h2>
        {draftEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 pl-1">Keine Entwürfe vorhanden.</p>
        ) : (
          <>
            <div className="hidden md:block border rounded-lg border-amber-200">
              <Table>
                {tableColumns}
                <TableBody>
                  {draftEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      {...rowProps}
                      onPublish={publishing === event.id ? () => {} : rowProps.onPublish}
                      onUnpublish={publishing === event.id ? () => {} : rowProps.onUnpublish}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden space-y-3">
              {draftEvents.map((event) => (
                <MobileEventCard
                  key={event.id}
                  event={event}
                  {...rowProps}
                  onPublish={publishing === event.id ? () => {} : rowProps.onPublish}
                  onUnpublish={publishing === event.id ? () => {} : rowProps.onUnpublish}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Cancel confirmation dialog ── */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Veranstaltung absagen</DialogTitle>
            <DialogDescription>
              Möchtest du die Veranstaltung &bdquo;{cancelTarget?.title}&ldquo; wirklich
              absagen? Alle Teilnehmer werden per E-Mail benachrichtigt.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <Label htmlFor="cancel-reason">Absagegrund (optional)</Label>
            <Textarea
              id="cancel-reason"
              placeholder="z.B. Schlechtes Wetter, Hallenausfall, ..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setCancelTarget(null);
                setCancelReason("");
              }}
            >
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Veranstaltung absagen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Publish confirmation dialog ── */}
      <Dialog open={!!publishTarget} onOpenChange={(o) => !o && setPublishTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Event veröffentlichen</DialogTitle>
            <DialogDescription>
              Möchtest du &bdquo;{publishTarget?.title}&ldquo; jetzt veröffentlichen? Das Event
              wird für alle Besucher sichtbar und Anmeldungen sind möglich.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setPublishTarget(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => publishTarget && handlePublish(publishTarget)}
              disabled={publishing === publishTarget?.id}
            >
              {publishing === publishTarget?.id ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Globe className="w-4 h-4 mr-2" />
              )}
              Veröffentlichen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Event löschen</DialogTitle>
            <DialogDescription>
              Möchtest du das Event &bdquo;{deleteTarget?.title}&ldquo; wirklich löschen? Alle
              Anmeldungen werden ebenfalls gelöscht.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Löschen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
