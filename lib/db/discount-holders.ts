import { getSQL } from "./utils";
import type { DiscountHolder, DiscountHolderInput } from "../types";
import { DuplicateDiscountHolderError } from "../discount-holders";

type SQL = ReturnType<typeof getSQL>;

/** Datumsfelder als "YYYY-MM-DD" – unabhängig von der Zeitzone des Servers. */
function holderColumns(sql: SQL) {
  return sql`
    id, first_name, last_name, email, phone, discount,
    TO_CHAR(proof_checked_at, 'YYYY-MM-DD') AS proof_checked_at, proof_checked_by,
    TO_CHAR(valid_until, 'YYYY-MM-DD') AS valid_until, notes, consented_at, created_at, updated_at
  `;
}

/** Verletzung des eindeutigen Index (Vorname + Nachname + E-Mail). */
function rethrowDuplicate(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new DuplicateDiscountHolderError();
  }
  throw error;
}

export async function getDiscountHolders(): Promise<DiscountHolder[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT ${holderColumns(sql)}
    FROM discount_holders
    ORDER BY LOWER(last_name), LOWER(first_name), id
  `;
  return rows as DiscountHolder[];
}

export async function createDiscountHolder(input: DiscountHolderInput, adminEmail: string): Promise<DiscountHolder> {
  const sql = getSQL();
  try {
    const rows = await sql`
      INSERT INTO discount_holders
        (first_name, last_name, email, phone, discount, proof_checked_at, proof_checked_by, valid_until, notes, consented_at)
      VALUES (
        ${input.first_name}, ${input.last_name}, ${input.email}, ${input.phone}, ${input.discount},
        ${input.proof_checked_at}::date, ${adminEmail}, ${input.valid_until}::date, ${input.notes}, NOW()
      )
      RETURNING ${holderColumns(sql)}
    `;
    return rows[0] as DiscountHolder;
  } catch (error) {
    rethrowDuplicate(error);
  }
}

/**
 * Wer geprüft hat, ändert sich nur, wenn der Nachweis neu geprüft wurde –
 * also bei neuem Prüfdatum oder anderer Ermäßigung. Eine Korrektur der
 * Telefonnummer lässt die ursprüngliche Prüfung stehen.
 */
export async function updateDiscountHolder(
  id: number,
  input: DiscountHolderInput,
  adminEmail: string
): Promise<DiscountHolder | null> {
  const sql = getSQL();
  try {
    const rows = await sql`
      UPDATE discount_holders SET
        first_name = ${input.first_name},
        last_name = ${input.last_name},
        email = ${input.email},
        phone = ${input.phone},
        proof_checked_by = CASE
          WHEN proof_checked_at IS DISTINCT FROM ${input.proof_checked_at}::date
            OR discount IS DISTINCT FROM ${input.discount}
          THEN ${adminEmail} ELSE proof_checked_by END,
        discount = ${input.discount},
        proof_checked_at = ${input.proof_checked_at}::date,
        valid_until = ${input.valid_until}::date,
        notes = ${input.notes},
        -- Die Validierung verlangt die Einwilligung; der erste Zeitpunkt bleibt stehen.
        consented_at = COALESCE(consented_at, NOW()),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING ${holderColumns(sql)}
    `;
    return (rows[0] as DiscountHolder) ?? null;
  } catch (error) {
    rethrowDuplicate(error);
  }
}

/**
 * Alle Einträge zu einer E-Mail-Adresse, die bei der Anmeldung erkannt werden
 * dürfen: mit Einwilligung und am Tag `today` ("YYYY-MM-DD") noch gültig.
 * Eine Familie teilt sich oft eine Adresse – den Namen gleicht matchDiscount ab.
 */
export async function getRecognizableDiscounts(
  email: string,
  today: string
): Promise<Array<Pick<DiscountHolder, "first_name" | "last_name" | "discount">>> {
  const sql = getSQL();
  const rows = await sql`
    SELECT first_name, last_name, discount
    FROM discount_holders
    WHERE email = ${email.trim().toLowerCase()}
      AND consented_at IS NOT NULL
      AND (valid_until IS NULL OR valid_until >= ${today}::date)
  `;
  return rows as Array<Pick<DiscountHolder, "first_name" | "last_name" | "discount">>;
}

/** Endgültig löschen – es bleibt nichts zurück (Datensparsamkeit). */
export async function deleteDiscountHolder(id: number): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`DELETE FROM discount_holders WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
