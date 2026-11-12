"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import RegistrationDetailModal from "@/components/RegistrationDetailModal";
import type { RegistrationDetail } from "@/lib/types";

interface Props {
  registrationId: number;
  /** "icon" (default) = square icon-only; "sm" = small button with "Details" label */
  size?: "icon" | "sm";
  className?: string;
}

export default function RegistrationDetailButton({
  registrationId,
  size = "icon",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RegistrationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (data) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Fehler beim Laden der Anmeldung.");
      } else {
        setData(body as RegistrationDetail);
      }
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        title="Details anzeigen"
        onClick={handleOpen}
        type="button"
        className={className}
      >
        <Eye className="w-4 h-4 text-blue-500 shrink-0" />
        {size !== "icon" && <span className="ml-1.5">Details</span>}
      </Button>
      <RegistrationDetailModal
        open={open}
        onClose={() => setOpen(false)}
        loading={loading}
        data={data}
        error={error}
        onChange={setData}
      />
    </>
  );
}
