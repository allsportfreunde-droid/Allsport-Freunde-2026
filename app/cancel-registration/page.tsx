"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Calendar, Clock, MapPin, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TokenStatus = "valid" | "expired" | "already_cancelled" | "not_found";

interface PreviewData {
  tokenStatus: TokenStatus;
  firstName?: string;
  lastName?: string;
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function CancelRegistrationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<"cancelled" | "already_cancelled" | "expired" | "deadline_passed" | null>(null);
  // Begründung der API – benennt die Frist oder den bereits erfolgten Beginn.
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`/api/cancel-registration?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: PreviewData) => setPreview(data))
      .catch(() => setError("Der Link konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCancel() {
    if (!token) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/cancel-registration?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.status === "cancelled") {
        router.push(`/status/${data.statusToken}?cancelled=true`);
      } else if (data.status === "already_cancelled") {
        setCancelResult("already_cancelled");
      } else if (data.status === "expired") {
        setCancelResult("expired");
      } else if (data.status === "deadline_passed") {
        setBlockedReason(typeof data.reason === "string" ? data.reason : null);
        setCancelResult("deadline_passed");
      } else {
        setError("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
      }
    } catch {
      setError("Netzwerkfehler. Bitte versuche es erneut.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!token || (preview && preview.tokenStatus === "not_found") || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link ungültig</h1>
          <p className="text-gray-500 text-sm">
            {error ?? "Dieser Absage-Link ist ungültig oder existiert nicht mehr."}
          </p>
        </div>
      </div>
    );
  }

  // Terminal states from POST (shouldn't normally render since we redirect on success)
  if (cancelResult === "already_cancelled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Bereits abgesagt</h1>
          <p className="text-gray-500 text-sm">Du hast deine Anmeldung bereits abgesagt.</p>
        </div>
      </div>
    );
  }

  if (cancelResult === "deadline_passed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Absage nicht mehr möglich</h1>
          <p className="text-gray-500 text-sm">
            {blockedReason ??
              "Die Stornofrist für diese Veranstaltung ist abgelaufen."}{" "}
            Melde dich bitte direkt bei uns, wenn du nicht teilnehmen kannst.
          </p>
        </div>
      </div>
    );
  }

  if (cancelResult === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link abgelaufen</h1>
          <p className="text-gray-500 text-sm">Der Absage-Link ist nicht mehr gültig.</p>
        </div>
      </div>
    );
  }

  // Terminal states from GET preview (no confirm button shown)
  if (preview?.tokenStatus === "already_cancelled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-lg text-gray-700">Bereits abgesagt</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Die Anmeldung von <strong>{preview.firstName} {preview.lastName}</strong> für{" "}
              <strong>{preview.eventTitle}</strong> wurde bereits storniert.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (preview?.tokenStatus === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-lg text-gray-700">Link abgelaufen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Dieser Absage-Link ist nicht mehr gültig. Das Event hat bereits stattgefunden.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Valid token — show confirmation
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Anmeldung absagen</h1>
          <p className="text-gray-500 mt-1">Allsport Freunde 2026 e.V.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event-Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold text-gray-900">{preview?.eventTitle}</p>
            <div className="space-y-1 text-gray-600">
              {preview?.eventDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{formatDate(preview.eventDate)}</span>
                </div>
              )}
              {preview?.eventTime && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{preview.eventTime} Uhr</span>
                </div>
              )}
              {preview?.eventLocation && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{preview.eventLocation}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-gray-700">
              Hallo <strong>{preview?.firstName} {preview?.lastName}</strong>,
            </p>
            <p className="text-sm font-medium text-gray-900">
              Möchtest du deine Anmeldung für{" "}
              <span className="text-red-600">{preview?.eventTitle}</span> wirklich absagen?
            </p>
            <p className="text-xs text-gray-500">Diese Aktion kann nicht rückgängig gemacht werden.</p>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 bg-red-600 text-white text-sm font-medium rounded-lg py-2.5 px-4 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {cancelling ? "Wird abgesagt…" : "Ja, absagen"}
              </button>
              <button
                onClick={() => router.back()}
                disabled={cancelling}
                className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2.5 px-4 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CancelRegistrationPage() {
  return (
    <Suspense fallback={<div>Lädt...</div>}>
      <CancelRegistrationContent />
    </Suspense>
  )
}
