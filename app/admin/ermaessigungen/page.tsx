"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgePercent, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/ResponsiveTable";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DiscountHolderForm from "@/components/admin/DiscountHolderForm";
import DiscountBadge from "@/components/DiscountBadge";
import DiscountRequestsPanel from "@/components/admin/DiscountRequestsPanel";
import { DISCOUNTS, type Discount } from "@/lib/price-tiers";
import { discountHolderStatus } from "@/lib/discount-holders";
import { berlinToday } from "@/lib/review";
import type { DiscountHolder } from "@/lib/types";

const DISCOUNT_KEYS = Object.keys(DISCOUNTS) as Discount[];

/** "2026-11-10" → "10.11.2026" – ohne Umweg über Date, damit keine Zeitzone verschiebt. */
function formatDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}

function sortHolders(holders: DiscountHolder[]): DiscountHolder[] {
  return [...holders].sort((a, b) =>
    a.last_name.localeCompare(b.last_name, "de") || a.first_name.localeCompare(b.first_name, "de") || a.id - b.id
  );
}

type FormState = { mode: "create" } | { mode: "edit"; holder: DiscountHolder } | null;

export default function ErmaessigungenPage() {
  const { toast } = useToast();
  const [holders, setHolders] = useState<DiscountHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [discountFilter, setDiscountFilter] = useState<Discount | "all">("all");
  const [form, setForm] = useState<FormState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiscountHolder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<"list" | "requests">("list");
  const [pendingCount, setPendingCount] = useState(0);
  const today = berlinToday();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ermaessigungen");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      setHolders(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Ermäßigungsliste konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return holders.filter((h) => {
      if (discountFilter !== "all" && h.discount !== discountFilter) return false;
      if (!q) return true;
      return `${h.first_name} ${h.last_name} ${h.email}`.toLowerCase().includes(q);
    });
  }, [holders, search, discountFilter]);

  const expiredCount = holders.filter((h) => discountHolderStatus(h, today) === "expired").length;

  function handleSaved(saved: DiscountHolder) {
    const isNew = form?.mode === "create";
    setHolders((prev) => sortHolders([...prev.filter((h) => h.id !== saved.id), saved]));
    setForm(null);
    toast(isNew ? "Person eingetragen." : "Eintrag gespeichert.", "success");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/ermaessigungen/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Löschen fehlgeschlagen.", "error");
        return;
      }
      setHolders((prev) => prev.filter((h) => h.id !== deleteTarget.id));
      toast("Eintrag gelöscht.", "success");
      setDeleteTarget(null);
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Kopf */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="flex items-center gap-3">
          <BadgePercent className="w-6 h-6 text-green-600 shrink-0" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Ermäßigungen</h1>
            {!loading && !error && (
              <p className="text-sm text-gray-500">
                {holders.length} {holders.length === 1 ? "Person" : "Personen"}
                {expiredCount > 0 && ` · davon ${expiredCount} abgelaufen`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} title="Aktualisieren">
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">Aktualisieren</span>
          </Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setForm({ mode: "create" })}>
            <Plus className="w-4 h-4 mr-1" />
            Person eintragen
          </Button>
        </div>
      </div>

      {/* Regeln nach § 3 */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4 text-sm">
        <p className="font-medium text-gray-900 mb-2">Ermäßigungen nach § 3</p>
        <ul className="space-y-1.5">
          {[...DISCOUNT_KEYS].reverse().map((key) => (
            <li key={key} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
              <DiscountBadge discount={key} className="self-start" />
              <span className="text-gray-700">
                {DISCOUNTS[key].reason}{" "}
                <span className="text-gray-500">· Nachweis: {DISCOUNTS[key].proof}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          In der Liste wird der Nachweis nur vermerkt. Mit Anträgen hochgeladene Nachweise werden nach der
          Entscheidung gelöscht.
        </p>
      </div>

      {/* Reiter */}
      <div className="flex gap-1 border-b border-gray-200 mb-4" role="tablist" aria-label="Ermäßigungen">
        {([["list", "Liste"], ["requests", "Anfragen"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === key ? "border-green-600 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
            {key === "requests" && pendingCount > 0 && (
              <span className="ml-2 inline-flex min-w-5 justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div id="panel-requests" role="tabpanel" aria-labelledby="tab-requests" hidden={tab !== "requests"}>
        <DiscountRequestsPanel onPendingCount={setPendingCount} onListChanged={() => void load()} />
      </div>

      <div id="panel-list" role="tabpanel" aria-labelledby="tab-list" hidden={tab !== "list"}>
      {/* Suche + Filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name oder E-Mail suchen…"
            aria-label="Name oder E-Mail suchen"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Nach Ermäßigung filtern">
          {(["all", ...DISCOUNT_KEYS] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={discountFilter === key}
              onClick={() => setDiscountFilter(key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                discountFilter === key
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {key === "all" ? "Alle" : `${DISCOUNTS[key].percent} %`}
            </button>
          ))}
        </div>
      </div>

      {/* Inhalt */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-600 mb-4">{error}</p>
          <Button variant="outline" onClick={load}>Erneut versuchen</Button>
        </div>
      ) : (
        <ResponsiveTable
          data={filtered}
          keyField="id"
          tableWrapperClassName="border border-gray-200 rounded-xl"
          emptyMessage={holders.length === 0 ? "Noch niemand eingetragen." : "Keine Einträge für diese Suche."}
          rowClassName={(h) =>
            discountHolderStatus(h, today) === "expired" ? "bg-gray-50 border-gray-200 opacity-75" : "bg-white border-gray-200"
          }
          columns={[
            {
              key: "last_name",
              label: "Name",
              render: (h) => <span className="font-medium">{h.last_name}, {h.first_name}</span>,
            },
            {
              key: "email",
              label: "Kontakt",
              render: (h) => (
                <div className="text-gray-600">
                  <a href={`mailto:${h.email}`} className="hover:text-green-600 break-all">{h.email}</a>
                  {h.phone && <p className="text-xs">{h.phone}</p>}
                </div>
              ),
            },
            {
              key: "discount",
              label: "Ermäßigung",
              render: (h) => <DiscountBadge discount={h.discount} />,
            },
            {
              key: "proof_checked_at",
              label: "Nachweis geprüft",
              render: (h) => (
                <div>
                  {formatDay(h.proof_checked_at)}
                  <p className="text-xs text-gray-500 break-all">von {h.proof_checked_by}</p>
                </div>
              ),
            },
            {
              key: "valid_until",
              label: "Gültig bis",
              render: (h) =>
                h.valid_until ? (
                  <span className="inline-flex items-center gap-2">
                    {formatDay(h.valid_until)}
                    {discountHolderStatus(h, today) === "expired" && (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        abgelaufen
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-gray-500">unbefristet</span>
                ),
            },
            {
              key: "notes",
              label: "Notiz",
              hideOnMobile: true,
              render: (h) => <span className="text-gray-600 line-clamp-2 max-w-xs">{h.notes ?? "–"}</span>,
            },
          ]}
          actions={(h) => (
            <>
              <Button size="sm" variant="outline" onClick={() => setForm({ mode: "edit", holder: h })}
                aria-label={`${h.first_name} ${h.last_name} bearbeiten`}>
                <Pencil className="w-4 h-4 md:mr-0 mr-1" />
                <span className="md:sr-only">Bearbeiten</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDeleteTarget(h)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                aria-label={`${h.first_name} ${h.last_name} löschen`}>
                <Trash2 className="w-4 h-4 md:mr-0 mr-1" />
                <span className="md:sr-only">Löschen</span>
              </Button>
            </>
          )}
        />
      )}

      </div>

      {/* Anlegen / Bearbeiten */}
      <Dialog open={form !== null} onOpenChange={(open) => { if (!open) setForm(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form?.mode === "edit" ? "Eintrag bearbeiten" : "Person eintragen"}</DialogTitle>
            <DialogDescription>
              Erst eintragen, wenn der Nachweis vorgelegen hat.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <DiscountHolderForm
              key={form.mode === "edit" ? form.holder.id : "new"}
              holder={form.mode === "edit" ? form.holder : null}
              onSaved={handleSaved}
              onCancel={() => setForm(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Löschen bestätigen */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintrag löschen</DialogTitle>
            <DialogDescription>
              {deleteTarget && `${deleteTarget.first_name} ${deleteTarget.last_name} wird endgültig aus der Ermäßigungsliste entfernt.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Abbrechen</Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Endgültig löschen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
