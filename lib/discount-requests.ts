/**
 * Ermäßigungsanträge aus der Anmeldung – reine Regeln ohne Datenbank, damit
 * Formular, API und Tests dieselben Grenzen und Texte verwenden.
 *
 * Der Nachweis ist ein Gesundheits- (Schwerbehinderung) bzw. Sozialdatum. Er
 * wird nur mit ausdrücklicher Einwilligung gespeichert, nur von Admins
 * angesehen und nach der Entscheidung, spätestens nach PROOF_RETENTION_DAYS,
 * gelöscht.
 */

import { DISCOUNTS, type Discount } from "./discounts";

/** Vercel nimmt höchstens 4,5 MB je Anfrage an – mit etwas Luft für das Formular drumherum. */
export const MAX_PROOF_BYTES = 4 * 1024 * 1024;

/** Spätestens dann wird ein Nachweis gelöscht, auch ohne Entscheidung. */
export const PROOF_RETENTION_DAYS = 30;

export type ProofType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export type DiscountRequestStatus = "pending" | "approved" | "rejected";

/** Was je Person aus dem Formular kommt. */
export interface DiscountRequestInput {
  discount: Discount;
  /** Einwilligung: nach Bestätigung in die Ermäßigungsliste aufnehmen. */
  remember: boolean;
}

/** Was Statusseite und Erfolgsansicht über einen Antrag erfahren – nie die Datei. */
export interface DiscountRequestInfo {
  id: number;
  person_id: string;
  discount: Discount;
  status: DiscountRequestStatus;
  has_proof: boolean;
  decision_note: string | null;
}

export const DISCOUNT_REQUEST_CONSENT_TEXT =
  "Ich willige ausdrücklich ein, dass die hochgeladenen Nachweise zur Prüfung meiner Ermäßigung gespeichert und " +
  `nach der Entscheidung, spätestens nach ${PROOF_RETENTION_DAYS} Tagen, gelöscht werden. ` +
  "Ein Schwerbehindertenausweis enthält Gesundheitsdaten (Art. 9 DSGVO). Die Einwilligung kann ich jederzeit widerrufen.";

export const REMEMBER_TEXT =
  "Meine bestätigte Ermäßigung für künftige Anmeldungen speichern: Das Anmeldeformular erkennt sie dann " +
  "anhand von Name und E-Mail automatisch.";

/**
 * Der tatsächliche Dateityp anhand der ersten Bytes – nicht anhand der Endung
 * oder der Angabe des Browsers, die beide frei wählbar sind. null = nicht erlaubt.
 */
export function detectProofType(bytes: Uint8Array): ProofType | null {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // RIFF....WEBP
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  // Manche PDF-Erzeuger stellen der PDF-Kennung ein paar Bytes voran. Acrobat
  // akzeptiert den Header innerhalb der ersten 1024 Bytes ebenfalls.
  const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  const lastPdfHeaderStart = Math.min(bytes.length - pdfHeader.length, 1023);
  for (let offset = 0; offset <= lastPdfHeaderStart; offset++) {
    if (pdfHeader.every((byte, index) => bytes[offset + index] === byte)) return "application/pdf";
  }
  return null;
}

/** Prüft den Antrag einer Person aus dem Formular. null = kein (gültiger) Antrag. */
export function parseDiscountRequest(value: unknown): DiscountRequestInput | null {
  if (typeof value !== "object" || value === null) return null;
  const { discount, remember } = value as Record<string, unknown>;
  if (typeof discount !== "string" || !Object.hasOwn(DISCOUNTS, discount)) return null;
  return { discount: discount as Discount, remember: remember === true };
}

/** Kurzer Statustext je Antrag für Statusseite und Erfolgsansicht. */
export function discountRequestLabel(request: Pick<DiscountRequestInfo, "discount" | "status" | "has_proof">): string {
  const percent = DISCOUNTS[request.discount].percent;
  if (request.status === "approved") return `Ermäßigung −${percent} % bestätigt`;
  if (request.status === "rejected") return `Ermäßigung −${percent} % nicht bestätigt – es gilt der reguläre Preis`;
  return request.has_proof
    ? `Ermäßigung −${percent} % beantragt – wird geprüft`
    : `Ermäßigung −${percent} % beantragt – Nachweis fehlt noch`;
}
