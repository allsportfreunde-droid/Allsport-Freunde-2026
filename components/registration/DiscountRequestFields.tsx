"use client";

import { useId, useRef, useState } from "react";
import { BadgePercent, Paperclip, X } from "lucide-react";
import { DISCOUNTS, type Discount } from "@/lib/discounts";
import { REMEMBER_TEXT } from "@/lib/discount-requests";
import { PROOF_ACCEPT, proofFileError, proofSelectionError } from "./proofFile";

/** Entwurf eines Antrags im Formular – je Person. */
export interface DiscountRequestDraft {
  open: boolean;
  discount: Discount | "";
  file: File | null;
  remember: boolean;
}

export const emptyDiscountRequest = (): DiscountRequestDraft => ({ open: false, discount: "", file: null, remember: false });

/** Ist der Entwurf vollständig genug, um abgeschickt zu werden? */
export function isDiscountRequestComplete(draft: DiscountRequestDraft): boolean {
  return draft.open && draft.discount !== "" && draft.file != null && proofSelectionError(draft.file) == null;
}

const DISCOUNT_KEYS = Object.keys(DISCOUNTS) as Discount[];

/**
 * "Ermäßigung beantragen" unter einer Person: Satz wählen, Nachweis anhängen,
 * optional für künftige Anmeldungen speichern. Zugeklappt nur ein dezenter Link.
 */
export default function DiscountRequestFields({
  value,
  onChange,
  disabled = false,
}: {
  value: DiscountRequestDraft;
  onChange: (next: DiscountRequestDraft) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [selectedFileError, setSelectedFileError] = useState<string | null>(null);
  const validationId = useRef(0);
  const fileError = selectedFileError ?? (value.file ? proofSelectionError(value.file) : null);

  async function chooseFile(file: File | undefined) {
    const currentValidation = ++validationId.current;
    if (!file) {
      setSelectedFileError(null);
      onChange({ ...value, file: null });
      return;
    }
    const error = await proofFileError(file);
    // Falls während der Prüfung schon eine andere Datei ausgewählt wurde.
    if (currentValidation !== validationId.current) return;
    if (error) {
      setSelectedFileError(error);
      return;
    }
    setSelectedFileError(null);
    onChange({ ...value, file });
  }

  if (!value.open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ ...value, open: true })}
        className="inline-flex items-center gap-1.5 text-xs text-green-700 hover:text-green-800 hover:underline"
      >
        <BadgePercent className="w-3.5 h-3.5" />
        Ermäßigung beantragen
      </button>
    );
  }

  return (
    <fieldset className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2.5" disabled={disabled}>
      <legend className="sr-only">Ermäßigung beantragen</legend>
      <div className="flex items-center justify-between gap-2">
        <p aria-hidden="true" className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
          <BadgePercent className="w-3.5 h-3.5 text-amber-700" />
          Ermäßigung beantragen
        </p>
        <button
          type="button"
          onClick={() => onChange(emptyDiscountRequest())}
          className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-white"
          aria-label="Antrag entfernen"
          title="Antrag entfernen"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1.5" role="radiogroup" aria-label="Ermäßigung">
        {DISCOUNT_KEYS.map((key) => (
          <label key={key} className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="radio"
              name={`${id}-discount`}
              value={key}
              checked={value.discount === key}
              onChange={() => onChange({ ...value, discount: key })}
              className="mt-0.5 h-3.5 w-3.5 text-green-600 focus:ring-green-500"
            />
            <span>
              <span className="font-semibold">−{DISCOUNTS[key].percent} %</span> {DISCOUNTS[key].reason}
              <span className="block text-gray-500">Nachweis: {DISCOUNTS[key].proof}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="space-y-1">
        <label htmlFor={`${id}-file`} className="text-xs font-medium text-gray-700">
          Nachweis (Foto oder PDF) *
        </label>
        <div className="flex items-center gap-2">
          <label
            htmlFor={`${id}-file`}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 cursor-pointer hover:bg-gray-50"
          >
            <Paperclip className="w-3.5 h-3.5" />
            {value.file ? "Andere Datei wählen" : "Datei wählen"}
          </label>
          <input
            id={`${id}-file`}
            type="file"
            accept={PROOF_ACCEPT}
            required={value.open}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              void chooseFile(file);
            }}
          />
          {value.file && !fileError && <span className="text-xs text-green-700 truncate">Datei ausgewählt ✓</span>}
        </div>
        {fileError && <p className="text-xs text-red-600">{fileError}</p>}
      </div>

      <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={value.remember}
          onChange={(e) => onChange({ ...value, remember: e.target.checked })}
          className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
        <span>{REMEMBER_TEXT}</span>
      </label>
    </fieldset>
  );
}
