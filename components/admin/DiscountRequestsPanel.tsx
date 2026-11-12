"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveTable } from "@/components/ui/ResponsiveTable";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ChildBadge from "@/components/ChildBadge";
import DiscountBadge from "@/components/DiscountBadge";
import { DISCOUNTS } from "@/lib/discounts";
import { PROOF_RETENTION_DAYS } from "@/lib/discount-requests";
import type { AdminDiscountRequest } from "@/lib/db/discount-requests";

/** "2026-11-10" oder ISO-Zeitstempel → "10.11.2026" */
function formatDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

const STATUS_LABELS = {
  pending: { label: "offen", className: "bg-amber-50 text-amber-800 border-amber-200" },
  approved: { label: "bestätigt", className: "bg-green-50 text-green-700 border-green-200" },
  rejected: { label: "abgelehnt", className: "bg-gray-50 text-gray-600 border-gray-200" },
} as const;

type Decision = { request: AdminDiscountRequest; decision: "approve" | "reject" };

/**
 * Ermäßigungsanträge aus der Anmeldung prüfen – auf Vertrauen: Mit dem
 * Nachweis gilt die Ermäßigung sofort, die Person kann gleich bezahlen.
 * Die Prüfung hier ist nur ein Vermerk, es geht keine Mail raus. Der
 * Nachweis öffnet sich in einem neuen Tab und wird mit der Entscheidung gelöscht.
 */
export default function DiscountRequestsPanel({
  onPendingCount,
  onListChanged,
}: {
  onPendingCount: (count: number) => void;
  /** Ein bestätigter Antrag mit "merken" verändert die Ermäßigungsliste. */
  onListChanged: () => void;
}) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<AdminDiscountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/discount-requests");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      setRequests(data);
      onPendingCount((data as AdminDiscountRequest[]).filter((r) => r.status === "pending").length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anträge konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [onPendingCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (showAll ? requests : requests.filter((r) => r.status === "pending")),
    [requests, showAll]
  );

  function openDecision(request: AdminDiscountRequest, kind: Decision["decision"]) {
    setNote("");
    setDecision({ request, decision: kind });
  }

  async function submitDecision() {
    if (!decision) return;
    setDeciding(true);
    try {
      const res = await fetch(`/api/admin/discount-requests/${decision.request.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decision.decision, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Entscheidung konnte nicht gespeichert werden.", "error");
        return;
      }
      const parts = [decision.decision === "approve" ? "Ermäßigung bestätigt" : "Antrag abgelehnt – bitte persönlich klären"];
      if (data.remembered) parts.push("in die Liste übernommen");
      toast(parts.join(" · "), "success");
      setDecision(null);
      if (data.remembered) onListChanged();
      await load();
    } catch {
      toast("Verbindungsfehler.", "error");
    } finally {
      setDeciding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Mit Nachweis gilt die Ermäßigung sofort – hier wird nur noch geprüft, ohne E-Mail an die Person.
          Nachweise werden nach der Entscheidung gelöscht, spätestens nach {PROOF_RETENTION_DAYS} Tagen.
        </p>
        <div className="flex items-center gap-1.5" role="group" aria-label="Anträge filtern">
          {([[false, "Offen"], [true, "Alle"]] as const).map(([all, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={showAll === all}
              onClick={() => setShowAll(all)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                showAll === all ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-600 border-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-red-600 mb-4">{error}</p>
          <Button variant="outline" onClick={() => void load()}>Erneut versuchen</Button>
        </div>
      ) : (
        <ResponsiveTable
          data={visible}
          keyField="id"
          tableWrapperClassName="border border-gray-200 rounded-xl"
          emptyMessage={showAll ? "Noch keine Anträge." : "Keine offenen Anträge."}
          columns={[
            {
              key: "last_name",
              label: "Person",
              render: (r) => (
                <div>
                  <span className="font-medium">{r.first_name} {r.last_name}</span>
                  {r.is_child && <ChildBadge className="ml-1.5 align-middle" />}
                  <p className="text-xs text-gray-500 break-all">{r.email}</p>
                  {(r.person_cancelled || r.registration_status === "cancelled") && (
                    <p className="text-xs text-red-600">storniert</p>
                  )}
                </div>
              ),
            },
            {
              key: "event_title",
              label: "Event",
              render: (r) => (
                <div>
                  {r.event_title}
                  <p className="text-xs text-gray-500">{formatDay(r.event_date)}</p>
                </div>
              ),
            },
            {
              key: "discount",
              label: "Beantragt",
              render: (r) => <DiscountBadge discount={r.discount} />,
            },
            {
              key: "has_proof",
              label: "Nachweis",
              render: (r) =>
                r.has_proof ? (
                  <a
                    href={`/api/admin/discount-requests/${r.id}/proof`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-green-700 hover:underline"
                  >
                    Ansehen <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : r.proof_deleted_at ? (
                  <span className="text-gray-500">gelöscht</span>
                ) : (
                  <span className="text-gray-500">nicht eingereicht · regulärer Preis</span>
                ),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => (
                <div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_LABELS[r.status].className}`}>
                    {STATUS_LABELS[r.status].label}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.decided_at ? `${formatDay(r.decided_at)} · ${r.decided_by ?? ""}` : `seit ${formatDay(r.created_at)}`}
                  </p>
                  <p className="text-xs text-gray-500">{r.paid ? "bezahlt" : "noch nicht bezahlt"}</p>
                  {r.remember && <p className="text-xs text-gray-500">für künftige Anmeldungen merken</p>}
                  {r.decision_note && <p className="text-xs text-gray-500 italic wrap-break-word">Notiz: {r.decision_note}</p>}
                </div>
              ),
            },
          ]}
          actions={(r) =>
            r.status === "pending" ? (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => openDecision(r, "approve")}
                  disabled={!r.proof_uploaded}
                  title={!r.proof_uploaded ? "Ohne eingereichten Nachweis lässt sich nichts bestätigen." : undefined}
                >
                  <Check className="w-4 h-4 mr-1" /> Bestätigen
                </Button>
                <Button size="sm" variant="outline" onClick={() => openDecision(r, "reject")}>
                  <X className="w-4 h-4 mr-1" /> Ablehnen
                </Button>
              </>
            ) : null
          }
        />
      )}

      <Dialog open={decision !== null} onOpenChange={(open) => { if (!open && !deciding) setDecision(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision?.decision === "approve" ? "Ermäßigung bestätigen" : "Antrag ablehnen"}</DialogTitle>
            <DialogDescription>
              {decision && (
                <>
                  −{DISCOUNTS[decision.request.discount].percent} % für {decision.request.first_name}{" "}
                  {decision.request.last_name}.{" "}
                  {decision.decision === "approve"
                    ? decision.request.remember
                      ? "Die Ermäßigung gilt bereits. Die Person wird außerdem in die Ermäßigungsliste übernommen."
                      : "Die Ermäßigung gilt bereits, nur für diese Anmeldung."
                    : "Am Preis ändert sich nichts und die Person erfährt nichts davon – bitte persönlich klären."}{" "}
                  Der Nachweis wird gelöscht.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {decision && !decision.request.proof_uploaded && decision.decision === "approve" && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 mb-3">
              Zu diesem Antrag wurde kein Nachweis eingereicht – es gilt der reguläre Preis.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="decision_note">Interne Notiz (optional)</Label>
            <Textarea
              id="decision_note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={decision?.decision === "reject" ? "z. B. Bescheid war nicht mehr gültig" : ""}
            />
            <p className="text-xs text-muted-foreground">Nur für das Team sichtbar. Keine Diagnosen eintragen.</p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDecision(null)} disabled={deciding}>Abbrechen</Button>
            <Button
              onClick={() => void submitDecision()}
              disabled={deciding || (decision?.decision === "approve" && !decision.request.proof_uploaded)}
              className={decision?.decision === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700 text-white"}
            >
              {deciding && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {decision?.decision === "approve" ? "Bestätigen" : "Ablehnen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
