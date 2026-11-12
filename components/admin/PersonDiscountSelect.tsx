"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { DISCOUNTS, type Discount } from "@/lib/discounts";

const DISCOUNT_KEYS = Object.keys(DISCOUNTS) as Discount[];

/** Kurzform des Grundes für die Auswahl – der volle Text steht in DISCOUNTS. */
const SHORT_REASON: Record<Discount, string> = {
  reduced_30: "Sozialleistungen",
  reduced_50: "Schwerbehinderung",
};

/**
 * Ermäßigung einer Person nachträglich setzen – speichert sofort.
 * Nur für unbezahlte Anmeldungen gedacht; der Server prüft das selbst.
 */
export default function PersonDiscountSelect({
  registrationId,
  personId,
  personName,
  value,
  onSaved,
}: {
  registrationId: number;
  personId: string;
  personName: string;
  value: Discount | null;
  onSaved: (discount: Discount | null) => void;
}) {
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Discount | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/persons/${personId}/discount`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Die Ermäßigung konnte nicht gespeichert werden.");
        return;
      }
      onSaved(next);
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">Ermäßigung für {personName}</label>
        <select
          id={id}
          value={value ?? ""}
          disabled={saving}
          onChange={(e) => void save(e.target.value === "" ? null : (e.target.value as Discount))}
          className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        >
          <option value="">Voller Preis</option>
          {DISCOUNT_KEYS.map((key) => (
            <option key={key} value={key}>
              −{DISCOUNTS[key].percent} % ({SHORT_REASON[key]})
            </option>
          ))}
        </select>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" aria-label="Wird gespeichert" />}
      </div>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
