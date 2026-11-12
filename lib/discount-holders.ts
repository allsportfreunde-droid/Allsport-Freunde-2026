/**
 * Regeln für die Ermäßigungsliste – rein und ohne Datenbank, damit Formular
 * und API dieselbe Prüfung verwenden (und später auch die Anmeldung).
 */

import { DISCOUNTS, type Discount } from "./price-tiers";
import { berlinToday } from "./review";
import type { DiscountHolder, DiscountHolderInput } from "./types";

export const DISCOUNT_HOLDER_LIMITS = { name: 50, email: 255, phone: 50, notes: 500 } as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DiscountHolderValidation =
  | { ok: true; data: DiscountHolderInput }
  | { ok: false; error: string };

/** Dieselbe Person (Vorname + Nachname + E-Mail) steht schon in der Liste. */
export class DuplicateDiscountHolderError extends Error {
  constructor() {
    super("Diese Person steht bereits in der Ermäßigungsliste.");
    this.name = "DuplicateDiscountHolderError";
  }
}

export function isDiscount(value: unknown): value is Discount {
  return typeof value === "string" && Object.hasOwn(DISCOUNTS, value);
}

/** Echtes Kalenderdatum im Format YYYY-MM-DD (kein 31.02.). */
function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Prüft und normalisiert eine Eingabe aus dem Formular. Felder, die nicht
 * hierher gehören (etwa `proof_checked_by`), werden verworfen.
 */
export function validateDiscountHolderInput(body: unknown, today = berlinToday()): DiscountHolderValidation {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const fail = (error: string): DiscountHolderValidation => ({ ok: false, error });

  const first_name = text(input.first_name);
  const last_name = text(input.last_name);
  const email = text(input.email).toLowerCase();
  const phone = text(input.phone);
  const proof_checked_at = text(input.proof_checked_at);
  const valid_until = text(input.valid_until);
  const notes = text(input.notes);

  if (!first_name || !last_name) return fail("Bitte Vor- und Nachnamen angeben.");
  if (first_name.length > DISCOUNT_HOLDER_LIMITS.name || last_name.length > DISCOUNT_HOLDER_LIMITS.name) {
    return fail(`Vor- und Nachname dürfen höchstens ${DISCOUNT_HOLDER_LIMITS.name} Zeichen lang sein.`);
  }
  if (!email || email.length > DISCOUNT_HOLDER_LIMITS.email || !EMAIL_RE.test(email)) {
    return fail("Bitte eine gültige E-Mail-Adresse angeben.");
  }
  if (phone.length > DISCOUNT_HOLDER_LIMITS.phone) {
    return fail(`Die Telefonnummer darf höchstens ${DISCOUNT_HOLDER_LIMITS.phone} Zeichen lang sein.`);
  }
  if (!isDiscount(input.discount)) return fail("Bitte eine Ermäßigung auswählen.");
  if (!isCalendarDate(proof_checked_at)) return fail("Bitte angeben, wann der Nachweis geprüft wurde.");
  if (proof_checked_at > today) return fail("Das Prüfdatum darf nicht in der Zukunft liegen.");
  if (valid_until && !isCalendarDate(valid_until)) return fail("Bitte ein gültiges Datum für „gültig bis“ angeben.");
  if (valid_until && valid_until < proof_checked_at) {
    return fail("„Gültig bis“ darf nicht vor dem Prüfdatum liegen.");
  }
  if (notes.length > DISCOUNT_HOLDER_LIMITS.notes) {
    return fail(`Die Notiz darf höchstens ${DISCOUNT_HOLDER_LIMITS.notes} Zeichen lang sein.`);
  }
  // Die Anmeldung zeigt die Ermäßigung anhand von Name + E-Mail an – das
  // verrät Gesundheits- bzw. Sozialdaten und braucht deshalb die Einwilligung.
  if (input.consent !== true) return fail("Bitte die Einwilligung der Person bestätigen.");

  return {
    ok: true,
    data: {
      first_name,
      last_name,
      email,
      phone: phone || null,
      discount: input.discount,
      proof_checked_at,
      valid_until: valid_until || null,
      notes: notes || null,
    },
  };
}

/** Vergleichsform eines Namens: getrimmt, Leerzeichen zusammengefasst, kleingeschrieben. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

/**
 * Die Ermäßigung einer Person aus den Einträgen zu ihrer E-Mail-Adresse –
 * oder null. Die Einträge kommen bereits gefiltert (Einwilligung, gültig)
 * aus getRecognizableDiscounts; hier wird nur der Name verglichen.
 */
export function matchDiscount(
  entries: ReadonlyArray<Pick<DiscountHolder, "first_name" | "last_name" | "discount">>,
  firstName: string,
  lastName: string
): Discount | null {
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);
  if (!first || !last) return null;
  const match = entries.find(
    (entry) => normalizeName(entry.first_name) === first && normalizeName(entry.last_name) === last
  );
  return match ? match.discount : null;
}

/** Abgelaufen, sobald der Tag nach „gültig bis“ begonnen hat (Berliner Zeit). */
export function discountHolderStatus(
  holder: Pick<DiscountHolder, "valid_until">,
  today = berlinToday()
): "valid" | "expired" {
  return holder.valid_until != null && holder.valid_until < today ? "expired" : "valid";
}
