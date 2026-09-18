import type { getSQL } from "./utils";

/** SQL-Aliasse: r = Anmeldung, rp = Person, e = Event. 0 bleibt ein gültiger Preis. */
export function personRevenueSql(sql: ReturnType<typeof getSQL>) {
  return sql`CASE WHEN rp.id IS NULL THEN 0 ELSE COALESCE(
    (r.paid_person_prices ->> rp.id::text)::numeric / 100,
    CASE WHEN rp.is_child THEN COALESCE(e.child_entry_price, e.entry_price, 0)
      ELSE COALESCE(e.entry_price, 0) END
  ) END`;
}
