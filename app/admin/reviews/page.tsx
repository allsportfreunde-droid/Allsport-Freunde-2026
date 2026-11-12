"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewsOverviewView } from "@/components/admin/ReviewsOverviewView";
import type { ReviewOverviewResponse } from "@/lib/types";

export default function ReviewsPage() {
  const [data, setData] = useState<ReviewOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const mounted = useRef(false);
  const locked = useRef(false);
  const latestLoad = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++latestLoad.current;
    if (mounted.current) setLoading(true);
    try {
      const response = await fetch("/api/admin/reviews", { cache: "no-store", signal });
      const body = await response.json();
      if (!mounted.current || signal?.aborted || sequence !== latestLoad.current) return;
      if (!response.ok) { setError(body.error ?? "Reviews konnten nicht geladen werden."); return; }
      setData(body);
    } catch {
      if (mounted.current && !signal?.aborted && sequence === latestLoad.current) setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      if (mounted.current && !signal?.aborted && sequence === latestLoad.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => { mounted.current = false; controller.abort(); };
  }, [load]);

  async function refresh() {
    if (locked.current || loading) return;
    locked.current = true; setError(null);
    await load();
    locked.current = false;
  }

  async function togglePublish(id: number, published: boolean) {
    if (locked.current || loading) return;
    locked.current = true; setBusyId(id); setError(null);
    try {
      const response = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published }),
      });
      const result = await response.json();
      if (mounted.current && !response.ok) setError(result.error ?? "Die Freigabe konnte nicht geändert werden.");
    } catch {
      if (mounted.current) setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      // Auch bei Konflikten den aktuellen Freigabestand aus der API übernehmen.
      if (mounted.current) await load();
      locked.current = false;
      if (mounted.current) setBusyId(null);
    }
  }

  return <div className="min-w-0 space-y-6 p-4 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><Star aria-hidden="true" className="h-6 w-6 text-green-600" />Reviews</h1>
        <p className="mt-0.5 text-sm text-gray-500">Bewertungen aller Events und Freigabe von Kommentaren</p>
      </div>
      <Button type="button" variant="outline" disabled={loading || busyId !== null} onClick={() => { void refresh(); }}>
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Aktualisieren
      </Button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading && !data && <div role="status" className="flex items-center justify-center gap-2 py-20 text-sm text-gray-500">
      <RefreshCw aria-hidden="true" className="h-5 w-5 animate-spin text-green-600" />Reviews werden geladen…
    </div>}
    {data && <ReviewsOverviewView data={data} busyId={busyId} busy={loading} onTogglePublish={(id, published) => { void togglePublish(id, published); }} />}
  </div>;
}
