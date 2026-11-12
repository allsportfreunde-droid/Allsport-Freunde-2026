/**
 * Gleicht alle kommenden Events einmal mit Stripe ab – etwa nach der Umstellung
 * auf ein Produkt je Preisstufe. Ohne dieses Skript geschieht dasselbe beim
 * nächsten Speichern des jeweiligen Events.
 *
 *   npm run stripe:sync-catalog            abgleichen
 *   npm run stripe:sync-catalog -- --plan  nur auflisten, nichts ändern
 *
 * Braucht POSTGRES_URL (oder DATABASE_URL) und STRIPE_SECRET_KEY. Der Abgleich
 * ist idempotent: Ein zweiter Lauf legt nichts Neues an.
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { syncStoredEventCatalog, type StripeSyncSummary } from "../lib/stripe-catalog";

async function main() {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  const planOnly = process.argv.includes("--plan");
  if (!planOnly && !process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY ist nicht gesetzt.");

  const sql = neon(dbUrl);
  // Abgesagte Events werden nicht mehr bezahlt – sie bleiben außen vor.
  const events = await sql`
    SELECT id, title, TO_CHAR(date, 'YYYY-MM-DD') AS date
    FROM events
    WHERE date >= CURRENT_DATE AND status <> 'cancelled'
    ORDER BY date, id
  ` as Array<{ id: number; title: string; date: string }>;

  const mode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "LIVE" : "Test";
  console.log(`${events.length} kommende Events${planOnly ? " (nur Plan, keine Änderung)" : ` – Stripe-Modus: ${mode}`}\n`);
  if (planOnly) {
    for (const event of events) console.log(`  ${event.date}  #${event.id}  ${event.title}`);
    return;
  }

  const counts: Record<StripeSyncSummary["status"], number> = { synced: 0, archived: 0, skipped: 0, failed: 0 };
  for (const event of events) {
    const result = await syncStoredEventCatalog(event.id);
    counts[result.status]++;
    console.log(`  ${event.date}  #${event.id}  ${event.title}: ${result.status}${result.error ? ` – ${result.error}` : ""}`);
  }

  console.log(
    `\nabgeglichen: ${counts.synced} · ohne Preis (archiviert): ${counts.archived} · ` +
    `übersprungen: ${counts.skipped} · fehlgeschlagen: ${counts.failed}`
  );
  if (counts.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Stripe-Abgleich abgebrochen:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
