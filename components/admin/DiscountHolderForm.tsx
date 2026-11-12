"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DISCOUNTS, type Discount } from "@/lib/price-tiers";
import { DISCOUNT_HOLDER_LIMITS, isDiscount, validateDiscountHolderInput } from "@/lib/discount-holders";
import { berlinToday } from "@/lib/review";
import type { DiscountHolder } from "@/lib/types";

interface DiscountHolderFormProps {
  /** Bestehender Eintrag zum Bearbeiten; ohne = neue Person eintragen. */
  holder?: DiscountHolder | null;
  onSaved: (holder: DiscountHolder) => void;
  onCancel: () => void;
}

const DISCOUNT_KEYS = Object.keys(DISCOUNTS) as Discount[];

export default function DiscountHolderForm({ holder, onSaved, onCancel }: DiscountHolderFormProps) {
  const today = berlinToday();
  const [values, setValues] = useState({
    first_name: holder?.first_name ?? "",
    last_name: holder?.last_name ?? "",
    email: holder?.email ?? "",
    phone: holder?.phone ?? "",
    discount: holder?.discount ?? "",
    proof_checked_at: holder?.proof_checked_at ?? today,
    valid_until: holder?.valid_until ?? "",
    notes: holder?.notes ?? "",
  });
  const [consent, setConsent] = useState(!!holder?.consented_at);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (field: keyof typeof values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((prev) => ({ ...prev, [field]: e.target.value }));

  const selected = isDiscount(values.discount) ? DISCOUNTS[values.discount] : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Dieselbe Prüfung wie auf dem Server – Fehler erscheinen sofort.
    const check = validateDiscountHolderInput({ ...values, consent }, today);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(holder ? `/api/admin/ermaessigungen/${holder.id}` : "/api/admin/ermaessigungen", {
        method: holder ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...check.data, consent }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Speichern fehlgeschlagen.");
        return;
      }
      onSaved(data as DiscountHolder);
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dh_first_name">Vorname *</Label>
          <Input id="dh_first_name" value={values.first_name} onChange={set("first_name")}
            maxLength={DISCOUNT_HOLDER_LIMITS.name} required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dh_last_name">Nachname *</Label>
          <Input id="dh_last_name" value={values.last_name} onChange={set("last_name")}
            maxLength={DISCOUNT_HOLDER_LIMITS.name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dh_email">E-Mail *</Label>
          <Input id="dh_email" type="email" value={values.email} onChange={set("email")}
            maxLength={DISCOUNT_HOLDER_LIMITS.email} required aria-describedby="dh_email_hint" />
          <p id="dh_email_hint" className="text-xs text-muted-foreground">
            Die Adresse, mit der sich die Person anmeldet. Familien dürfen dieselbe nutzen.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dh_phone">Telefon</Label>
          <Input id="dh_phone" type="tel" value={values.phone} onChange={set("phone")}
            maxLength={DISCOUNT_HOLDER_LIMITS.phone} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dh_discount">Ermäßigung *</Label>
        <Select id="dh_discount" value={values.discount} onChange={set("discount")} required
          aria-describedby={selected ? "dh_discount_hint" : undefined}>
          <option value="">– bitte wählen –</option>
          {DISCOUNT_KEYS.map((key) => (
            <option key={key} value={key}>
              {DISCOUNTS[key].percent} % – {DISCOUNTS[key].reason}
            </option>
          ))}
        </Select>
        {selected && (
          <p id="dh_discount_hint" className="text-xs text-muted-foreground">
            Nachweis: {selected.proof}. Er wird nur angesehen, nicht gespeichert.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dh_proof_checked_at">Nachweis geprüft am *</Label>
          <Input id="dh_proof_checked_at" type="date" value={values.proof_checked_at}
            onChange={set("proof_checked_at")} max={today} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dh_valid_until">Gültig bis</Label>
          <Input id="dh_valid_until" type="date" value={values.valid_until}
            onChange={set("valid_until")} min={values.proof_checked_at || undefined}
            aria-describedby="dh_valid_until_hint" />
          <p id="dh_valid_until_hint" className="text-xs text-muted-foreground">
            Leer lassen, wenn der Nachweis unbefristet ist.
          </p>
        </div>
      </div>
      {holder && (
        <p className="text-xs text-muted-foreground">
          Zuletzt geprüft von {holder.proof_checked_by}. Ein neues Prüfdatum oder eine andere
          Ermäßigung trägt dich als prüfende Person ein.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="dh_notes">Notiz</Label>
        <Textarea id="dh_notes" value={values.notes} onChange={set("notes")} rows={2}
          maxLength={DISCOUNT_HOLDER_LIMITS.notes} aria-describedby="dh_notes_hint" />
        <p id="dh_notes_hint" className="text-xs text-muted-foreground">
          Keine Diagnosen oder Bescheid-Inhalte eintragen.
        </p>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 cursor-pointer">
        <input
          id="dh_consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
        <span>
          Die Person ist einverstanden, dass ihre Ermäßigung bei der Online-Anmeldung anhand von
          Name und E-Mail erkannt und angezeigt wird. *
        </span>
      </label>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700">
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {holder ? "Speichern" : "Eintragen"}
        </Button>
      </div>
    </form>
  );
}
