"use client";

import { useState, useEffect, useMemo } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import StatusBadge from "@/components/status/StatusBadge";
import ChildBadge from "@/components/ChildBadge";
import { Trash2, Loader2, Search, Download, CheckCircle2, XCircle, Clock, Mail, X } from "lucide-react";
import RegistrationDetailButton from "@/components/RegistrationDetailButton";
import type { RegistrationWithEvent, RegistrationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RegistrationTableProps {
  eventId?: number;
  upcomingOnly?: boolean;
  /**
   * Vorbelegung der Suche. Aus E-Mails kommt man mit einer Adresse im Link
   * hierher – dann soll die gesuchte Anmeldung sofort dastehen und nicht
   * zwischen hunderten gefunden werden müssen.
   */
  initialSearch?: string;
}

const PAGE_SIZE = 25;

/** Was mit der aktuellen Auswahl passieren soll. */
type BulkOp =
  | { kind: "status"; status: RegistrationStatus }
  | { kind: "offer" }
  | { kind: "delete" };

/** Nur Wartelisten-Anmeldungen kann man einen Platz anbieten. */
const isOfferable = (r: RegistrationWithEvent) =>
  r.status === "pending" && !!r.is_waitlist;

export default function RegistrationTable({
  eventId,
  upcomingOnly = false,
  initialSearch = "",
}: RegistrationTableProps) {
  const today = new Date().toISOString().split("T")[0];
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<RegistrationWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<RegistrationWithEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<number | null>(null);
  const [bulkOp, setBulkOp] = useState<BulkOp | null>(null);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ reg: RegistrationWithEvent; status: RegistrationStatus } | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [statusProcessing, setStatusProcessing] = useState(false);
  const [offeringId, setOfferingId] = useState<number | null>(null);

  /**
   * Bietet einer Wartelisten-Anmeldung einen frei gewordenen Platz an: das
   * Wartelisten-Flag fällt weg, der Status bleibt ausstehend. Die Anmeldung
   * wird damit zahlbar und bekommt eine E-Mail.
   */
  const handleOfferSpot = async (reg: RegistrationWithEvent) => {
    setOfferingId(reg.id);
    try {
      const res = await fetch("/api/checkin/waitlist/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: reg.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Platz konnte nicht angeboten werden.", "error");
        return;
      }
      toast("Platz angeboten – E-Mail ist unterwegs.", "success");
      fetchRegistrations();
    } catch {
      toast("Netzwerkfehler.", "error");
    } finally {
      setOfferingId(null);
    }
  };

  const fetchRegistrations = () => {
    setLoading(true);
    const url = eventId
      ? `/api/admin/events/${eventId}/registrations`
      : "/api/admin/registrations";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setRegistrations(data);
        setSelectedIds(new Set());
      })
      .catch(() => toast("Anmeldungen konnten nicht geladen werden.", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRegistrations(); }, [eventId]);

  // Reset to first page whenever filters change
  useEffect(() => { setPage(1); }, [search, categoryFilter, statusFilter, upcomingOnly]);

  const filtered = useMemo(() => {
    return registrations.filter((r) => {
      if (upcomingOnly && !eventId && r.event_date < today) return false;
      if (categoryFilter !== "alle" && r.event_category !== categoryFilter) return false;
      if (statusFilter !== "alle" && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.first_name.toLowerCase().includes(q) &&
          !r.last_name.toLowerCase().includes(q) &&
          !r.email?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [registrations, search, categoryFilter, statusFilter, upcomingOnly, eventId, today]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectedRegs = useMemo(
    () => registrations.filter((r) => selectedIds.has(r.id)),
    [registrations, selectedIds]
  );
  const offerableIds = useMemo(
    () => selectedRegs.filter(isOfferable).map((r) => r.id),
    [selectedRegs]
  );
  const pageSelectedCount = paginated.filter((r) => selectedIds.has(r.id)).length;
  const allOnPageSelected = paginated.length > 0 && pageSelectedCount === paginated.length;
  const bulkStatus = bulkOp?.kind === "status" ? bulkOp.status : null;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/registrations/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Fehler beim Löschen.", "error");
        return;
      }
      toast("Anmeldung gelöscht!", "success");
      setDeleteTarget(null);
      fetchRegistrations();
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusTarget) return;
    setStatusProcessing(true);
    try {
      const res = await fetch(`/api/admin/registrations/${statusTarget.reg.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusTarget.status, note: statusNote || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Fehler beim Statuswechsel.", "error");
        return;
      }
      toast(
        statusTarget.status === "approved" ? "Anmeldung bestätigt!" : "Anmeldung abgelehnt.",
        "success"
      );
      setStatusTarget(null);
      setStatusNote("");
      fetchRegistrations();
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setStatusProcessing(false);
    }
  };

  /**
   * Führt die im Dialog bestätigte Bulk-Aktion aus.
   *
   * Statuswechsel kann der Server in einem Rutsch (bulk-status). Anbieten und
   * Löschen laufen pro Anmeldung, weil beide Endpunkte einzeln arbeiten –
   * E-Mail-Versand bzw. Platzfreigabe hängen an der einzelnen Anmeldung.
   */
  const runBulkOp = async () => {
    if (!bulkOp || selectedIds.size === 0) return;
    setBulkProcessing(true);
    try {
      if (bulkOp.kind === "status") {
        const res = await fetch("/api/admin/registrations/bulk-status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: Array.from(selectedIds),
            status: bulkOp.status,
            note: bulkNote || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          toast(data.error || "Fehler bei Bulk-Aktion.", "error");
          return;
        }
        toast(`${selectedIds.size} Anmeldung(en) aktualisiert!`, "success");
      } else {
        const ids = bulkOp.kind === "offer" ? offerableIds : Array.from(selectedIds);
        let done = 0;
        let failed = 0;
        for (const id of ids) {
          try {
            const res =
              bulkOp.kind === "offer"
                ? await fetch("/api/checkin/waitlist/offer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ registrationId: id }),
                  })
                : await fetch(`/api/admin/registrations/${id}`, { method: "DELETE" });
            if (res.ok) done++;
            else failed++;
          } catch {
            failed++;
          }
        }
        const verb = bulkOp.kind === "offer" ? "Platz angeboten" : "gelöscht";
        if (failed === 0) {
          toast(`${done} Anmeldung(en) ${verb}.`, "success");
        } else {
          toast(
            `${done} von ${ids.length} ${verb} – ${failed} fehlgeschlagen.`,
            done === 0 ? "error" : "success"
          );
        }
      }
      setBulkOp(null);
      setBulkNote("");
      fetchRegistrations();
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setBulkProcessing(false);
    }
  };

  /**
   * Auswahl umschalten. Mit gedrückter Shift-Taste wird der Bereich seit dem
   * letzten Klick mitgenommen – wie man es aus Dateimanagern kennt.
   */
  const toggleSelect = (id: number, shiftKey = false) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const anchor = lastClickedId;
      if (shiftKey && anchor !== null && anchor !== id) {
        const from = paginated.findIndex((r) => r.id === anchor);
        const to = paginated.findIndex((r) => r.id === id);
        if (from !== -1 && to !== -1) {
          const select = !next.has(id);
          for (const r of paginated.slice(Math.min(from, to), Math.max(from, to) + 1)) {
            if (select) next.add(r.id);
            else next.delete(r.id);
          }
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastClickedId(id);
  };

  /** Kopf-Checkbox: wählt die sichtbare Seite aus bzw. ab. */
  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) paginated.forEach((r) => next.delete(r.id));
      else paginated.forEach((r) => next.add(r.id));
      return next;
    });
    setLastClickedId(null);
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map((r) => r.id)));
    setLastClickedId(null);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  };

  const handleExport = () => {
    const url = eventId
      ? `/api/admin/registrations/export?event_id=${eventId}`
      : "/api/admin/registrations/export";
    window.open(url, "_blank");
  };

  const formatDate = (d: string) => {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const formatDateTime = (d: string) => {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Name oder E-Mail suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-40">
          <option value="alle">Alle Status</option>
          <option value="pending">Ausstehend</option>
          <option value="approved">Bestätigt</option>
          <option value="rejected">Abgelehnt</option>
          <option value="cancelled">Storniert</option>
        </Select>
        {!eventId && (
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full sm:w-40">
            <option value="alle">Alle Kategorien</option>
            <option value="fussball">Fußball</option>
            <option value="fitness">Fitness</option>
            <option value="schwimmen">Schwimmen</option>
          </Select>
        )}
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          CSV Export
        </Button>
      </div>

      {/* Bulk action bar – bleibt beim Scrollen durch lange Listen sichtbar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 shadow-sm sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 sm:shrink-0">
            <span className="text-sm font-semibold text-blue-900">
              {selectedIds.size} ausgewählt
            </span>
            {selectedIds.size < filtered.length && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-sm text-blue-700 underline underline-offset-2 hover:text-blue-900"
              >
                Alle {filtered.length} auswählen
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="border-green-300 bg-white text-green-700 hover:bg-green-50"
              onClick={() => setBulkOp({ kind: "status", status: "approved" })}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              Bestätigen
            </Button>
            {offerableIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-blue-300 bg-white text-blue-700 hover:bg-blue-100"
                onClick={() => setBulkOp({ kind: "offer" })}
              >
                <Mail className="mr-1 h-4 w-4" />
                Platz anbieten ({offerableIds.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 bg-white text-amber-700 hover:bg-amber-50"
              onClick={() => setBulkOp({ kind: "status", status: "pending" })}
            >
              <Clock className="mr-1 h-4 w-4" />
              Auf ausstehend
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 bg-white text-red-700 hover:bg-red-50"
              onClick={() => setBulkOp({ kind: "status", status: "rejected" })}
            >
              <XCircle className="mr-1 h-4 w-4" />
              Ablehnen
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 bg-white text-red-700 hover:bg-red-50"
              onClick={() => setBulkOp({ kind: "delete" })}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Löschen
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-blue-900 hover:bg-blue-100"
              onClick={clearSelection}
              title="Auswahl aufheben"
            >
              <X className="mr-1 h-4 w-4" />
              Aufheben
            </Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">Keine Anmeldungen gefunden.</p>
      ) : (
        <>
          {/* ── Desktop: Tabelle (sm+) ── */}
          <div className="hidden sm:block border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      label="Alle auf dieser Seite auswählen"
                      checked={allOnPageSelected}
                      indeterminate={pageSelectedCount > 0 && !allOnPageSelected}
                      onChange={toggleSelectPage}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">E-Mail</TableHead>
                  <TableHead className="hidden lg:table-cell">Gäste</TableHead>
                  <TableHead>Status</TableHead>
                  {!eventId && <TableHead className="hidden xl:table-cell">Event</TableHead>}
                  <TableHead className="hidden md:table-cell">Datum</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((r) => (
                  <TableRow
                    key={r.id}
                    // twMerge sorgt dafür, dass hover hier den Standard der Zeile ersetzt
                    className={cn(
                      "cursor-pointer select-none",
                      selectedIds.has(r.id) && "bg-blue-50 hover:bg-blue-100"
                    )}
                    // Shift+Klick markiert Bereiche – ohne das hier zieht der
                    // Browser stattdessen Text über die Zeilen hinweg.
                    onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button, a, input, label")) return;
                      toggleSelect(r.id, e.shiftKey);
                    }}
                  >
                    <TableCell className="py-1">
                      <Checkbox
                        label={`${r.first_name} ${r.last_name} auswählen`}
                        checked={selectedIds.has(r.id)}
                        onChange={(e) =>
                          toggleSelect(r.id, (e.nativeEvent as MouseEvent).shiftKey === true)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">
                          {r.first_name} {r.last_name}
                          {r.is_walk_in && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 leading-none">
                              Walk-in
                            </span>
                          )}
                        </span>
                        <span className="block md:hidden text-xs text-gray-500">{r.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{r.email}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        {Math.max(0, r.person_count - 1)}
                        {r.child_count > 0 && <ChildBadge count={r.child_count} />}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={r.status || "pending"} />
                        {r.payment_failed && <span className="text-xs font-medium text-red-700">SEPA-Einzug fehlgeschlagen</span>}
                        {r.status === "pending" && r.is_waitlist && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 leading-none">
                            Warteliste
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {!eventId && <TableCell className="hidden xl:table-cell max-w-[200px] truncate">{r.event_title}</TableCell>}
                    <TableCell className="hidden md:table-cell">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <RegistrationDetailButton registrationId={r.id} />
                        {r.status === "pending" && r.is_waitlist && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Platz anbieten – wird zahlbar und bekommt eine E-Mail"
                            disabled={offeringId === r.id}
                            onClick={() => handleOfferSpot(r)}
                          >
                            <Mail className="w-4 h-4 text-blue-500" />
                          </Button>
                        )}
                        {r.status !== "approved" && r.status !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Bestätigen"
                            onClick={() => setStatusTarget({ reg: r, status: "approved" })}
                          >
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          </Button>
                        )}
                        {r.status !== "rejected" && r.status !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ablehnen"
                            onClick={() => setStatusTarget({ reg: r, status: "rejected" })}
                          >
                            <XCircle className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                        {r.status !== "pending" && r.status !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Auf ausstehend setzen"
                            onClick={() => setStatusTarget({ reg: r, status: "pending" })}
                          >
                            <Clock className="w-4 h-4 text-amber-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Löschen"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ── Mobile: Card-Stack (< sm) ── */}
          <div className="sm:hidden space-y-3">
            {/* Auswahl auch am Handy – vorher gab es sie nur in der Tabelle */}
            <div className="flex items-center gap-1 px-1">
              <Checkbox
                label="Alle auf dieser Seite auswählen"
                checked={allOnPageSelected}
                indeterminate={pageSelectedCount > 0 && !allOnPageSelected}
                onChange={toggleSelectPage}
              />
              <button
                type="button"
                onClick={toggleSelectPage}
                className="text-sm text-muted-foreground"
              >
                {pageSelectedCount > 0 ? `${pageSelectedCount} auf dieser Seite` : "Alle auswählen"}
              </button>
            </div>
            {paginated.map((r) => (
              <div
                key={r.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a, input, label")) return;
                  toggleSelect(r.id);
                }}
                className={cn(
                  "rounded-lg border p-4 shadow-sm transition-colors",
                  selectedIds.has(r.id)
                    ? "border-blue-300 bg-blue-50"
                    : "border-gray-200 bg-white"
                )}
              >
                {/* Name + Status */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <Checkbox
                    label={`${r.first_name} ${r.last_name} auswählen`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    className="-ml-2 -mt-2"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm">
                      {r.first_name} {r.last_name}
                      {r.is_walk_in && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 leading-none">
                          Walk-in
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{r.email}</p>
                    {!eventId && r.event_title && (
                      <p className="text-xs text-gray-400 truncate">{r.event_title}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge status={r.status || "pending"} />
                    {r.payment_failed && <span className="text-xs font-medium text-red-700">SEPA-Einzug fehlgeschlagen</span>}
                    {r.status === "pending" && r.is_waitlist && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 leading-none">
                        Warteliste
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
                  <RegistrationDetailButton
                    registrationId={r.id}
                    size="sm"
                    className="w-full justify-start"
                  />
                  {r.status === "pending" && r.is_waitlist && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-blue-700 border-blue-200 w-full"
                      disabled={offeringId === r.id}
                      onClick={() => handleOfferSpot(r)}
                    >
                      <Mail className="w-3.5 h-3.5 mr-1.5" />
                      Platz anbieten
                    </Button>
                  )}
                  {r.status !== "approved" && r.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-700 border-green-200 w-full"
                      onClick={() => setStatusTarget({ reg: r, status: "approved" })}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Bestätigen
                    </Button>
                  )}
                  {r.status !== "rejected" && r.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700 border-red-200 w-full"
                      onClick={() => setStatusTarget({ reg: r, status: "rejected" })}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" />
                      Ablehnen
                    </Button>
                  )}
                  {r.status !== "pending" && r.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-700 border-amber-200 w-full"
                      onClick={() => setStatusTarget({ reg: r, status: "pending" })}
                    >
                      <Clock className="w-3.5 h-3.5 mr-1.5" />
                      Ausstehend
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-700 border-red-200 w-full"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Löschen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>
          {filtered.length} Anmeldung{filtered.length !== 1 ? "en" : ""}
          {totalPages > 1 && ` · Seite ${page} von ${totalPages}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              ←
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
            >
              →
            </Button>
          </div>
        )}
      </div>

      {/* Status change dialog */}
      <Dialog open={!!statusTarget} onOpenChange={(o) => { if (!o) { setStatusTarget(null); setStatusNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.status === "approved"
                ? "Anmeldung bestätigen"
                : statusTarget?.status === "rejected"
                ? "Anmeldung ablehnen"
                : "Status ändern"}
            </DialogTitle>
            <DialogDescription>
              {statusTarget?.reg.first_name} {statusTarget?.reg.last_name} –{" "}
              {statusTarget?.reg.event_title}
            </DialogDescription>
          </DialogHeader>
          {statusTarget?.status === "rejected" && (
            <div className="space-y-2">
              <Label htmlFor="status-note">Begründung (optional)</Label>
              <Textarea
                id="status-note"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Grund für die Ablehnung..."
                rows={3}
              />
            </div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => { setStatusTarget(null); setStatusNote(""); }}>
              Abbrechen
            </Button>
            <Button
              variant={statusTarget?.status === "rejected" ? "destructive" : "default"}
              onClick={handleStatusChange}
              disabled={statusProcessing}
            >
              {statusProcessing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {statusTarget?.status === "approved"
                ? "Bestätigen"
                : statusTarget?.status === "rejected"
                ? "Ablehnen"
                : "Ändern"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk action dialog */}
      <Dialog open={!!bulkOp} onOpenChange={(o) => { if (!o) { setBulkOp(null); setBulkNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkOp?.kind === "delete"
                ? `${selectedIds.size} Anmeldung(en) löschen`
                : bulkOp?.kind === "offer"
                ? `${offerableIds.length} Wartelisten-Anmeldung(en): Platz anbieten`
                : bulkStatus === "approved"
                ? `${selectedIds.size} Anmeldung(en) bestätigen`
                : bulkStatus === "rejected"
                ? `${selectedIds.size} Anmeldung(en) ablehnen`
                : `${selectedIds.size} Anmeldung(en) auf ausstehend setzen`}
            </DialogTitle>
            <DialogDescription>
              {bulkOp?.kind === "delete"
                ? "Die Anmeldungen werden endgültig entfernt und die Plätze wieder freigegeben. Das lässt sich nicht rückgängig machen."
                : bulkOp?.kind === "offer"
                ? "Die Warteliste-Markierung fällt weg, der Status bleibt ausstehend. Alle bekommen eine E-Mail mit dem Platzangebot. Nicht ausgewählte Wartelisten-Anmeldungen bleiben unberührt."
                : bulkStatus === "pending"
                ? "Die ausgewählten Anmeldungen wandern zurück auf ausstehend."
                : "Diese Aktion betrifft alle ausgewählten Anmeldungen. E-Mail-Benachrichtigungen werden versendet."}
            </DialogDescription>
          </DialogHeader>
          {bulkOp?.kind === "status" && bulkOp.status === "rejected" && (
            <div className="space-y-2">
              <Label htmlFor="bulk-note">Begründung (optional)</Label>
              <Textarea
                id="bulk-note"
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder="Grund für die Ablehnung..."
                rows={3}
              />
            </div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => { setBulkOp(null); setBulkNote(""); }}>
              Abbrechen
            </Button>
            <Button
              variant={
                bulkOp?.kind === "delete" ||
                (bulkOp?.kind === "status" && bulkOp.status === "rejected")
                  ? "destructive"
                  : "default"
              }
              onClick={runBulkOp}
              disabled={bulkProcessing}
            >
              {bulkProcessing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {bulkOp?.kind === "delete"
                ? "Alle löschen"
                : bulkOp?.kind === "offer"
                ? "Platz anbieten"
                : bulkStatus === "approved"
                ? "Alle bestätigen"
                : bulkStatus === "rejected"
                ? "Alle ablehnen"
                : "Auf ausstehend setzen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anmeldung löschen</DialogTitle>
            <DialogDescription>
              Möchtest du die Anmeldung von {deleteTarget?.first_name}{" "}
              {deleteTarget?.last_name} wirklich löschen? Der Platz wird wieder freigegeben.
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
