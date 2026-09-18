import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { generateCheckinToken, generateQRCode } from "../lib/checkin";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

/**
 * Backfill: erzeugt Check-In QR-Codes für bereits bestätigte Anmeldungen,
 * die noch keinen haben (z. B. per "Alle bestätigen" bestätigte Anmeldungen,
 * bevor die Bulk-Route QR-Codes generiert hat).
 *
 * WICHTIG: Muss mit denselben Umgebungsvariablen wie die Produktion laufen
 * (CHECKIN_SECRET, NEXT_PUBLIC_APP_URL), sonst sind die erzeugten QR-Tokens
 * beim Einlass nicht gültig.
 */
async function backfill() {
  console.log("Backfill für fehlende Check-In QR-Codes...\n");

  if (!process.env.CHECKIN_SECRET) {
    console.warn(
      "  ⚠ CHECKIN_SECRET ist nicht gesetzt – es wird das Dev-Fallback-Secret\n" +
      "    verwendet. Die erzeugten QR-Codes sind dann in der Produktion NICHT\n" +
      "    gültig. Abbruch, wenn das nicht gewünscht ist (Strg+C).\n"
    );
  }

  const rows = (await sql`
    SELECT
      r.id,
      r.event_id,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.time::text AS event_time
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.status = 'approved'
      AND (r.qr_code IS NULL OR r.qr_code = '')
  `) as { id: number; event_id: number; event_date: string; event_time: string }[];

  if (rows.length === 0) {
    console.log("  ✓ Keine bestätigten Anmeldungen ohne QR-Code gefunden.");
    console.log("\nBackfill abgeschlossen!");
    return;
  }

  console.log(`  ${rows.length} bestätigte Anmeldung(en) ohne QR-Code gefunden.\n`);

  let updated = 0;
  let failed = 0;

  for (const reg of rows) {
    try {
      const token = generateCheckinToken(
        { eventId: reg.event_id, participantId: reg.id, registrationId: reg.id },
        reg.event_date,
        reg.event_time
      );
      const qrCode = await generateQRCode(token);
      await sql`
        UPDATE registrations
        SET qr_code = ${qrCode}, qr_token = ${token}
        WHERE id = ${reg.id}
      `;
      updated++;
    } catch (err) {
      failed++;
      console.error(`  ✗ Anmeldung ${reg.id}: QR-Code konnte nicht erzeugt werden:`, err);
    }
  }

  console.log(`\n  ✓ ${updated} QR-Code(s) erzeugt und gespeichert.`);
  if (failed > 0) {
    console.log(`  ✗ ${failed} fehlgeschlagen (siehe oben).`);
  }
  console.log("\nBackfill abgeschlossen!");
}

backfill().catch((err) => {
  console.error("Fehler beim Backfill:", err);
  process.exit(1);
});
