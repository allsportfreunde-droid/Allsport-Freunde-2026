"use client";

import { useEffect, useRef, useState } from "react";
import type { Discount } from "@/lib/discounts";
import { isDiscount, normalizeName } from "@/lib/discount-holders";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_NAME_LENGTH = 2;
const DEBOUNCE_MS = 500;

/** Schlüssel einer Person für die Abfrage – null, solange die Angaben unvollständig sind. */
export function discountPreviewKey(email: string, firstName: string, lastName: string): string | null {
  const mail = email.trim().toLowerCase();
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);
  if (!EMAIL_RE.test(mail) || first.length < MIN_NAME_LENGTH || last.length < MIN_NAME_LENGTH) return null;
  return JSON.stringify([mail, first, last]);
}

/**
 * Vorschau der Ermäßigung je Person im Anmeldeformular.
 *
 * Fragt erst nach einer Tipp-Pause und je Person nur einmal; veraltete
 * Anfragen werden abgebrochen. Verbindlich ist das nicht – beim Absenden
 * gleicht der Server selbst ab, das Formular schickt keine Ermäßigung mit.
 */
export function useDiscountPreview(
  email: string,
  persons: ReadonlyArray<{ firstName: string; lastName: string }>
): Array<Discount | null> {
  // Ergebnisse in einer Ref: Ein eingetroffenes Ergebnis soll nur neu
  // rendern, nicht den Effekt neu starten und laufende Anfragen abbrechen.
  const cache = useRef(new Map<string, Discount | null>());
  const [, setVersion] = useState(0);

  const keys = persons.map((p) => discountPreviewKey(email, p.firstName, p.lastName));
  const signature = keys.join("\n");

  useEffect(() => {
    const missing = [...new Set(keys.filter((key): key is string => key != null && !cache.current.has(key)))];
    if (missing.length === 0) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      for (const key of missing) {
        const [mail, first, last] = JSON.parse(key) as [string, string, string];
        try {
          const res = await fetch("/api/discounts/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: mail, first_name: first, last_name: last }),
            signal: controller.signal,
          });
          // Bei Fehlern (etwa 429) nichts merken – die nächste Eingabe fragt erneut.
          if (!res.ok) continue;
          const data = await res.json();
          cache.current.set(key, isDiscount(data.discount) ? data.discount : null);
          setVersion((v) => v + 1);
        } catch {
          if (controller.signal.aborted) return;
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `keys` ist durch `signature` vollständig beschrieben.
  }, [signature]);

  return keys.map((key) => (key ? cache.current.get(key) ?? null : null));
}
