import { generateCheckinToken, generateQRCode } from "@/lib/checkin";
import { saveQRCode, saveCheckoutQRCode } from "@/lib/db";

/**
 * Generates a check-in QR code for an approved registration, persists it on
 * the registration, and returns the base64 data URL.
 *
 * Used by both the single-approval and bulk-approval admin routes so the
 * status page and approval email always receive a QR code, regardless of how
 * the registration was approved. Returns undefined (non-fatal) if generation
 * fails, so approval can continue.
 */
export async function generateAndSaveCheckinQR(
  registrationId: number,
  event: { id: number; date: string; time: string },
  preserveExisting = false
): Promise<string | undefined> {
  try {
    const token = generateCheckinToken(
      { eventId: event.id, participantId: registrationId, registrationId },
      event.date,
      event.time
    );
    const qrCode = await generateQRCode(token);
    if (preserveExisting) return await saveCheckoutQRCode(registrationId, qrCode, token);
    await saveQRCode(registrationId, qrCode, token);
    return qrCode;
  } catch (err) {
    console.error("Fehler bei QR-Code-Generierung:", err);
    return undefined;
  }
}
