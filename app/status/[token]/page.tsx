"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import StatusPage from "@/components/status/StatusPage";
import { Loader2 } from "lucide-react";
import type { RegistrationStatusInfo } from "@/lib/types";

export default function StatusPageRoute() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const justCancelled = searchParams.get("cancelled") === "true";
  // Beschreibt nur den Rückkehrweg von Stripe. Der Zahlungsstatus kommt aus der API.
  const zahlung = searchParams.get("zahlung");
  const paymentResult = zahlung === "erfolg" || zahlung === "abbruch" ? zahlung : null;
  const sessionId = searchParams.get("session_id");
  const [info, setInfo] = useState<RegistrationStatusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let currentInfo: RegistrationStatusInfo | null = null;
    setLoading(true);
    setError(false);

    async function load() {
      let synchronized = false;
      let retry = true;
      // Auch ohne Stripe-Rückkehrlink verwaiste Anlagen wiederaufnehmen.
      // Wiederholungen erreichen ebenso Sperren, die erst später ablaufen.
      try {
        const confirmation = await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status_token: token, ...(sessionId ? { session_id: sessionId } : {}) }),
          signal,
        });
        synchronized = confirmation.ok;
      } catch {
        // Der gespeicherte Stand wird trotzdem geladen; unklare Zahlungen
        // bleiben bis zum nächsten erfolgreichen Abgleich gesperrt.
      }
      if (signal.aborted) return;

      try {
        const res = await fetch(`/api/status/${token}`, { cache: "no-store", signal });
        if (!res.ok) throw new Error();
        const nextInfo: RegistrationStatusInfo = await res.json();
        if (signal.aborted) return;
        if (!synchronized && !nextInfo.paid_at && nextInfo.payment_state !== "paid" && nextInfo.payment_state !== "processing") {
          nextInfo.payment_state = "checking";
        }
        currentInfo = nextInfo;
        setInfo(nextInfo);
        setError(false);
        retry = nextInfo.payment_state === "checking" || nextInfo.payment_state === "processing";
      } catch {
        if (!signal.aborted && !currentInfo) setError(true);
      } finally {
        if (!signal.aborted) {
          setLoading(false);
          // Erst nach Abschluss beider Requests planen, damit nichts überlappt.
          if (retry) timer = setTimeout(load, 5000);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [token, sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Anmeldung nicht gefunden</h1>
          <p className="text-gray-500">Der Link ist ungültig oder die Anmeldung existiert nicht mehr.</p>
        </div>
      </div>
    );
  }

  return <StatusPage info={info} justCancelled={justCancelled} paymentResult={paymentResult} />;
}
