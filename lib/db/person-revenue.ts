import type { getSQL } from "./utils";

/**
 * SQL-Aliasse: r = Anmeldung, rp = Person, e = Event. 0 bleibt ein gültiger Preis.
 * Ohne gespeicherten Zahlungsanteil: Grundpreis in Cent, Ermäßigung wie
 * discountedCents (kaufmännisch auf Cent gerundet), zurück in Euro.
 * Die Faktoren (100 − Ermäßigung) müssen zu DISCOUNTS in lib/discounts.ts
 * passen – ein Test prüft das.
 */
export function personRevenueSql(sql: ReturnType<typeof getSQL>) {
  return sql`CASE WHEN rp.id IS NULL THEN 0 ELSE COALESCE(
    (r.paid_person_prices ->> rp.id::text)::numeric / 100,
    ROUND(
      ROUND(CASE WHEN rp.is_child THEN COALESCE(e.child_entry_price, e.entry_price, 0)
        ELSE COALESCE(e.entry_price, 0) END * 100)
      * CASE rp.discount WHEN 'reduced_30' THEN 70 WHEN 'reduced_50' THEN 50 ELSE 100 END
      / 100
    ) / 100
  ) END`;
}
