"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Wifi,
  WifiOff,
  Camera,
  UserCheck,
  Undo2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import type { RegistrationPerson } from "@/lib/types";

interface ScanError {
  type: "error";
  message: string;
}

interface ScanPreview {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  is_walk_in: boolean;
  checked_in_at: string | null;
  persons: RegistrationPerson[];
  token: string;
}

interface OfflineScan {
  token: string;
  scannedAt: string;
  synced: boolean;
}

const OFFLINE_QUEUE_KEY = "checkin_offline_queue";

function loadOfflineQueue(): OfflineScan[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: OfflineScan[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function formatTime(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default function ScannerPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();

  const qrRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string>("");
  const cooldownRef = useRef(false);
  const handleScanRef = useRef<(text: string) => void>(() => {});

  const [cameraState, setCameraState] = useState<"starting" | "scanning" | "error">("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<ScanError | null>(null);
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Per-person check-in state inside preview
  const [personLoadingId, setPersonLoadingId] = useState<string | null>(null);
  const [checkinAllLoading, setCheckinAllLoading] = useState(false);

  const stopCamera = useCallback(async () => {
    document.querySelectorAll<HTMLVideoElement>("#qr-reader video").forEach((video) => {
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    });
    try {
      if (qrRef.current?.isScanning) await qrRef.current.stop();
      qrRef.current?.clear();
    } catch { /* ignore */ }
  }, []);

  const navigateTo = useCallback(async (href: string) => {
    await stopCamera();
    router.push(href);
  }, [stopCamera, router]);

  // ── Online tracking ──────────────────────────────────────
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    setIsOnline(navigator.onLine);
    setOfflineCount(loadOfflineQueue().filter((s) => !s.synced).length);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // ── Offline sync ─────────────────────────────────────────
  const syncOfflineQueue = useCallback(async () => {
    const queue = loadOfflineQueue();
    const pending = queue.filter((s) => !s.synced);
    if (pending.length === 0) return;
    setSyncing(true);
    let synced = 0;
    for (const scan of pending) {
      try {
        const res = await fetch("/api/checkin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: scan.token }),
        });
        if (res.ok) { scan.synced = true; synced++; }
      } catch { /* keep unsynced */ }
    }
    saveOfflineQueue(queue);
    setOfflineCount(queue.filter((s) => !s.synced).length);
    setSyncing(false);
    if (synced > 0) {
      setScanError({ type: "error", message: `${synced} offline Scan(s) synchronisiert.` });
      setTimeout(() => setScanError(null), 3000);
    }
  }, []);

  useEffect(() => {
    if (isOnline && offlineCount > 0) syncOfflineQueue();
  }, [isOnline, offlineCount, syncOfflineQueue]);

  // ── Close preview & resume scanning ──────────────────────
  const closePreview = useCallback(() => {
    setPreview(null);
    setScanError(null);
    setTimeout(() => {
      cooldownRef.current = false;
      lastScannedRef.current = "";
    }, 500);
  }, []);

  // ── Scan handler ─────────────────────────────────────────
  const handleScan = useCallback(async (decodedText: string) => {
    if (cooldownRef.current || decodedText === lastScannedRef.current) return;

    let token: string | null = null;
    try {
      token = new URL(decodedText).searchParams.get("token");
    } catch {
      token = decodedText.length > 20 ? decodedText : null;
    }

    if (!token) {
      setScanError({ type: "error", message: "Ungültiger QR-Code – kein gültiges Token gefunden." });
      setTimeout(() => setScanError(null), 3000);
      return;
    }

    cooldownRef.current = true;
    lastScannedRef.current = decodedText;

    if (!navigator.onLine) {
      const queue = loadOfflineQueue();
      queue.push({ token, scannedAt: new Date().toISOString(), synced: false });
      saveOfflineQueue(queue);
      setOfflineCount(queue.filter((s) => !s.synced).length);
      setScanError({ type: "error", message: "Offline gespeichert – wird synchronisiert sobald Verbindung besteht." });
      setTimeout(() => { cooldownRef.current = false; lastScannedRef.current = ""; setScanError(null); }, 3000);
      return;
    }

    try {
      const res = await fetch("/api/checkin/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok) {
        setScanError({ type: "error", message: data.error ?? "Fehler beim Laden." });
        setTimeout(() => { cooldownRef.current = false; lastScannedRef.current = ""; setScanError(null); }, 3000);
      } else {
        setPreview({ ...data, token });
        setScanError(null);
        // cooldown stays ON until user closes the preview
      }
    } catch {
      setScanError({ type: "error", message: "Netzwerkfehler. Bitte versuche es erneut." });
      setTimeout(() => { cooldownRef.current = false; lastScannedRef.current = ""; setScanError(null); }, 3000);
    }
  }, []);

  handleScanRef.current = handleScan;

  // ── Per-person check-in toggle ───────────────────────────
  const handlePersonCheckin = useCallback(async (personId: string) => {
    if (!preview) return;
    setPersonLoadingId(personId);
    try {
      const res = await fetch(`/api/checkin/persons/${personId}`, { method: "POST" });
      if (res.ok) {
        const now = new Date().toISOString();
        setPreview((p) => p ? {
          ...p,
          persons: p.persons.map((pp) => pp.id === personId ? { ...pp, checked_in_at: now } : pp),
        } : p);
      }
    } catch { /* silent */ }
    finally { setPersonLoadingId(null); }
  }, [preview]);

  const handlePersonUndo = useCallback(async (personId: string) => {
    if (!preview) return;
    setPersonLoadingId(personId);
    try {
      const res = await fetch(`/api/checkin/persons/${personId}`, { method: "DELETE" });
      if (res.ok) {
        setPreview((p) => p ? {
          ...p,
          persons: p.persons.map((pp) => pp.id === personId ? { ...pp, checked_in_at: null } : pp),
        } : p);
      }
    } catch { /* silent */ }
    finally { setPersonLoadingId(null); }
  }, [preview]);

  // ── Check in all ─────────────────────────────────────────
  const handleCheckinAll = useCallback(async () => {
    if (!preview) return;
    setCheckinAllLoading(true);
    try {
      const res = await fetch("/api/checkin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: preview.token }),
      });
      if (res.ok) {
        const now = new Date().toISOString();
        setPreview((p) => p ? {
          ...p,
          checked_in_at: now,
          persons: p.persons.map((pp) => ({ ...pp, checked_in_at: pp.checked_in_at ?? now })),
        } : p);
      }
    } catch { /* silent */ }
    finally { setCheckinAllLoading(false); }
  }, [preview]);

  // ── Camera init / cleanup ────────────────────────────────
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    let qr: Html5Qrcode | null = null;

    timerId = setTimeout(() => {
      qr = new Html5Qrcode("qr-reader");
      qrRef.current = qr;

      qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (text) => handleScanRef.current(text),
        undefined
      )
        .then(() => setCameraState("scanning"))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          setCameraState("error");
          setCameraError(msg.includes("Permission") || msg.includes("NotAllowed")
            ? "Kamera-Zugriff verweigert. Bitte Berechtigung in den Browser-Einstellungen erlauben."
            : "Kamera konnte nicht gestartet werden.");
        });
    }, 0);

    return () => {
      clearTimeout(timerId);
      if (qr) {
        document.querySelectorAll<HTMLVideoElement>("#qr-reader video").forEach((video) => {
          (video.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
        });
        (async () => {
          try {
            if (qr!.isScanning) await qr!.stop();
            qr!.clear();
          } catch { /* ignore */ }
        })();
      }
    };
  }, []);

  const previewAllCheckedIn = preview ? preview.persons.every((p) => p.checked_in_at !== null) : false;
  const previewCheckedCount = preview ? preview.persons.filter((p) => p.checked_in_at !== null).length : 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateTo(`/admin/events/${eventId}/dashboard`)}
            className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold text-lg leading-none">QR-Scanner</h1>
            <p className="text-xs text-gray-400 mt-0.5">Event #{eventId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Wifi className="w-3.5 h-3.5" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <WifiOff className="w-3.5 h-3.5" /> Offline
            </span>
          )}
          {offlineCount > 0 && (
            <button
              onClick={syncOfflineQueue}
              disabled={syncing || !isOnline}
              className="text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-medium px-2 py-1 rounded"
            >
              {syncing ? "Sync…" : `${offlineCount} ausstehend`}
            </button>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Scan error banner (only shown when no preview open) */}
        {scanError && !preview && (
          <div className="rounded-xl p-4 flex gap-3 items-start bg-red-900/60 border border-red-600">
            <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{scanError.message}</p>
          </div>
        )}

        {/* Camera viewport */}
        <div className={`rounded-xl overflow-hidden bg-black relative transition-opacity duration-200 ${preview ? "opacity-30" : "opacity-100"}`}>
          <div id="qr-reader" />
          {cameraState === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3 min-h-[300px]">
              <Camera className="w-8 h-8 text-gray-500 animate-pulse" />
              <p className="text-sm text-gray-400">Kamera wird gestartet…</p>
            </div>
          )}
          {cameraState === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3 p-6 min-h-[300px]">
              <XCircle className="w-8 h-8 text-red-500" />
              <p className="text-sm text-red-300 text-center">{cameraError}</p>
            </div>
          )}
        </div>

        {!preview && (
          <p className="text-center text-xs text-gray-500">
            Kamera auf den QR-Code des Teilnehmers richten
          </p>
        )}

        <button
          onClick={() => navigateTo(`/admin/events/${eventId}/dashboard`)}
          className="w-full py-3 border border-gray-600 rounded-xl text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-sm"
        >
          Zum Dashboard wechseln
        </button>
      </div>

      {/* ── Preview overlay ── */}
      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-white">
                      {preview.first_name} {preview.last_name}
                    </h2>
                    {preview.is_walk_in && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-800 text-blue-200">
                        Walk-in
                      </span>
                    )}
                  </div>
                  {preview.email && (
                    <p className="text-sm text-gray-400 mt-0.5 truncate">{preview.email}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {preview.persons.length} Person{preview.persons.length !== 1 ? "en" : ""} ·{" "}
                    {previewCheckedCount} eingecheckt
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {previewAllCheckedIn ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-900/50 px-2.5 py-1 rounded-full">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Alle ein
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-amber-400 bg-amber-900/50 px-2.5 py-1 rounded-full">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Check-in offen
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Person list */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-700">
              {preview.persons.map((person, idx) => {
                const isChecked = person.checked_in_at !== null;
                const busy = personLoadingId === person.id;
                return (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between px-5 py-3.5 ${isChecked ? "bg-green-900/20" : ""}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isChecked ? "bg-green-400" : "bg-gray-500"}`} />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${isChecked ? "text-green-200" : "text-white"}`}>
                          {person.first_name} {person.last_name}
                          {idx === 0 && (
                            <span className="ml-1.5 text-xs text-gray-500 font-normal">(Hauptperson)</span>
                          )}
                        </p>
                        {isChecked && (
                          <p className="text-xs text-green-500 mt-0.5">
                            ✓ {formatTime(person.checked_in_at)} Uhr
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => isChecked ? handlePersonUndo(person.id) : handlePersonCheckin(person.id)}
                      disabled={busy || checkinAllLoading}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                        isChecked
                          ? "border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-400 hover:bg-red-900/20"
                          : "border-gray-600 text-gray-300 hover:border-green-500 hover:text-green-400 hover:bg-green-900/20"
                      }`}
                    >
                      {busy ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : isChecked ? (
                        <Undo2 className="w-3.5 h-3.5" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                      {isChecked ? "Zurück" : "Einch."}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="px-5 py-4 border-t border-gray-700 flex-shrink-0 space-y-2">
              {!previewAllCheckedIn && (
                <button
                  onClick={handleCheckinAll}
                  disabled={checkinAllLoading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  {checkinAllLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Alle einchecken ({preview.persons.length - previewCheckedCount} ausstehend)
                </button>
              )}
              <button
                onClick={closePreview}
                className="w-full py-3 border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white rounded-xl text-sm font-medium transition-colors"
              >
                {previewAllCheckedIn ? "Fertig – nächsten scannen" : "Schließen"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        #qr-reader { border: none !important; padding: 0 !important; }
        #qr-reader video { width: 100% !important; height: auto !important; display: block !important; }
        #qr-reader canvas { display: none !important; }
        #qr-reader__scan_region { background: #000 !important; }
        #qr-reader__dashboard { display: none !important; }
      `}</style>
    </div>
  );
}
