"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { centsFromDigits, formatAmountPlain, MAX_PRICE_CENTS } from "@/lib/price";

interface AmountInputProps {
  /** Betrag in Cent. */
  value: number;
  onChange: (cents: number) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}

/**
 * Betragseingabe wie an einem Kartenlesegerät: Ziffern schieben von rechts
 * nach, die Formatierung ist immer sichtbar.
 *
 *   1    →   0,01
 *   10   →   0,10
 *   1000 →  10,00
 *
 * Das Eingabefeld enthält bewusst nur die Zahl; das €-Zeichen steht daneben.
 * Stünde es im Feld, würde die Rücktaste zuerst das Währungszeichen löschen
 * statt eine Ziffer.
 *
 * Die Ziffern werden aus dem gesamten Feldinhalt gelesen, statt Tastendrücke
 * abzufangen – mobile Tastaturen liefern für `keydown` oft keinen brauchbaren
 * Key, `onChange` dagegen immer.
 */
export function AmountInput({
  value,
  onChange,
  id,
  disabled,
  className,
  ...rest
}: AmountInputProps) {
  const ref = React.useRef<HTMLInputElement>(null);
  const display = formatAmountPlain(value);

  // Der Cursor gehört ans Ende – sonst landen neue Ziffern in der Mitte und
  // die Verschiebe-Logik fühlt sich kaputt an.
  const caretToEnd = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) {
      el.setSelectionRange(end, end);
    }
  }, []);

  React.useEffect(() => {
    if (document.activeElement === ref.current) caretToEnd();
  }, [display, caretToEnd]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = centsFromDigits(e.target.value);
    // null = Obergrenze überschritten: vorherigen Wert beibehalten
    if (next === null) return;
    onChange(next);
  };

  return (
    <div className="relative">
      <input
        {...rest}
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={display}
        onChange={handleChange}
        onFocus={caretToEnd}
        onClick={caretToEnd}
        onSelect={caretToEnd}
        className={cn(
          "flex h-10 w-full rounded-lg border border-border bg-background py-2 pl-3 pr-9 text-right text-sm tabular-nums ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
      >
        €
      </span>
    </div>
  );
}

export { MAX_PRICE_CENTS };
