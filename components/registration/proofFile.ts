"use client";

import { detectProofType, MAX_PROOF_BYTES } from "@/lib/discount-requests";

/** Fotos werden auf diese Kantenlänge verkleinert – gut lesbar und weit unter der Größengrenze. */
const MAX_IMAGE_EDGE = 1600;
/** Rohdateien über dieser Größe lehnen wir gleich ab, bevor der Browser sie dekodiert. */
const MAX_RAW_IMAGE_BYTES = 25 * 1024 * 1024;

/** Nur Formate, die serverseitig geprüft und sicher angezeigt werden können. SVG bleibt außen vor. */
export const PROOF_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

function isHeic(file: File): boolean {
  return ["image/heic", "image/heif"].includes(file.type.toLowerCase()) || /\.hei[cf]$/i.test(file.name);
}

function isAcceptedImage(file: File): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase()) || isHeic(file);
}

/** Prüft eine ausgewählte Datei, bevor etwas abgeschickt wird. null = in Ordnung. */
export function proofSelectionError(file: File): string | null {
  if (file.type === "application/pdf") {
    return file.size > MAX_PROOF_BYTES ? "Das PDF ist zu groß (höchstens 4 MB). Ein Foto geht auch." : null;
  }
  if (!isAcceptedImage(file)) return "Bitte ein JPEG-, PNG-, WebP- oder HEIC-Foto oder ein PDF auswählen.";
  if (file.size > MAX_RAW_IMAGE_BYTES) return "Das Foto ist zu groß.";
  return null;
}

/**
 * Prüft bei normalen Fotos und PDFs zusätzlich die Dateikennung. Das gibt
 * direkt nach der Auswahl eine brauchbare Rückmeldung, statt erst nach der
 * Anmeldung mit einem 400er vom Server. HEIC wird ausgelassen, weil es vor
 * dem Upload noch lokal in JPEG umgewandelt wird.
 */
export async function proofContentError(file: File): Promise<string | null> {
  if (isHeic(file)) return null;
  try {
    // PDF-Kennungen dürfen laut Server innerhalb der ersten 1024 Bytes liegen.
    const bytes = new Uint8Array(await file.slice(0, 1028).arrayBuffer());
    return detectProofType(bytes)
      ? null
      : "Die ausgewählte Datei ist kein gültiges JPEG-, PNG-, WebP-Foto oder PDF.";
  } catch {
    // Kann ein Gerät die Datei nicht lesen, bleibt der Server das Sicherheitsnetz.
    return null;
  }
}

/** Die vollständige lokale Prüfung, bevor ein Upload versucht wird. */
export async function proofFileError(file: File): Promise<string | null> {
  return proofSelectionError(file) ?? proofContentError(file);
}

/**
 * Verkleinert Fotos im Browser auf höchstens 1600 px als JPEG. HEIC/HEIF
 * wird dabei direkt auf dem Gerät in JPEG umgewandelt. Das spart Datenvolumen,
 * bleibt unter Vercels Grenze von 4,5 MB je Anfrage und entfernt nebenbei
 * Metadaten wie den Aufnahmeort. PDFs bleiben unverändert.
 */
export async function prepareProofFile(file: File): Promise<Blob> {
  const heic = isHeic(file);
  if (!isAcceptedImage(file)) return file;
  if (heic) {
    try {
      // Dynamisch laden: Der HEIC-Konverter läuft ausschließlich im Browser
      // und wird für normale Fotos gar nicht erst heruntergeladen.
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
      return Array.isArray(converted) ? converted[0] : converted;
    } catch {
      return file;
    }
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob ?? file;
  } catch {
    // Kann der Browser das Format nicht lesen, entscheidet der Server.
    return file;
  }
}

/** Lädt einen Nachweis zu einem Antrag hoch. Autorisiert über den status_token. */
export async function uploadProof(statusToken: string, requestId: number, file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // Auch bei Aufrufen außerhalb des Formulars nie erst nach einem Request
    // merken, dass die Auswahl gar nicht zulässig ist.
    const fileError = await proofFileError(file);
    if (fileError) return { ok: false, error: fileError };

    const prepared = await prepareProofFile(file);
    if (isHeic(file) && prepared === file) {
      return { ok: false, error: "Das iPhone-Foto konnte nicht in JPEG umgewandelt werden. Bitte versuche es erneut oder wähle die Datei als PDF." };
    }
    if (prepared.size > MAX_PROOF_BYTES) return { ok: false, error: "Die Datei ist zu groß (höchstens 4 MB)." };
    const form = new FormData();
    form.set("status_token", statusToken);
    form.set("request_id", String(requestId));
    // Bewusst ein neutraler Dateiname – der echte kann Namen oder Aktenzeichen enthalten.
    form.set("file", prepared, "nachweis");
    const res = await fetch("/api/discount-requests/proof", { method: "POST", body: form });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? "Der Nachweis konnte nicht hochgeladen werden." };
  } catch {
    return { ok: false, error: "Verbindungsfehler beim Hochladen." };
  }
}
