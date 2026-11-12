import { getSQL } from "./utils";
import type { Discount } from "../discounts";
import type { DiscountRequestInfo, DiscountRequestStatus, ProofType } from "../discount-requests";
import { PROOF_RETENTION_DAYS } from "../discount-requests";

/**
 * Ermäßigungsanträge aus der Anmeldung. Der Nachweis (`proof_data`) wird nur
 * in getDiscountProof gelesen – keine andere Abfrage selektiert ihn, damit er
 * nicht versehentlich in Listen, Logs oder Antworten landet.
 */

/** Ziel eines Uploads – nur, wenn Token und Antrag zusammengehören. */
export async function getProofUploadTarget(
  statusToken: string,
  requestId: number
): Promise<{ id: number; status: DiscountRequestStatus } | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT dr.id, dr.status
    FROM discount_requests dr
    JOIN registrations r ON r.id = dr.registration_id
    WHERE dr.id = ${requestId} AND r.status_token = ${statusToken}
  `;
  return (rows[0] as { id: number; status: DiscountRequestStatus }) ?? null;
}

/**
 * Speichert (oder ersetzt) den Nachweis eines offenen Antrags. false = nicht mehr offen.
 *
 * Auf Vertrauen: Mit dem Nachweis gilt die Ermäßigung sofort und die Person
 * kann ermäßigt bezahlen. Das Team sieht sich den Antrag danach noch an
 * (decideDiscountRequest). Eine bereits bezahlte Anmeldung bleibt beim Preis.
 */
export async function saveDiscountProof(requestId: number, bytes: Uint8Array, type: ProofType): Promise<boolean> {
  const sql = getSQL();
  // Als Hex-Literal übergeben – so kommt bytea unabhängig vom Treiber unverändert an.
  const hex = `\\x${Buffer.from(bytes).toString("hex")}`;
  const [saved] = await sql.transaction([
    sql`
      UPDATE discount_requests
      SET proof_data = ${hex}::bytea, proof_type = ${type}, proof_uploaded_at = NOW(), proof_deleted_at = NULL
      WHERE id = ${requestId} AND status = 'pending'
      RETURNING id
    `,
    sql`
      UPDATE registration_persons rp SET discount = dr.discount
      FROM discount_requests dr, registrations r
      WHERE dr.id = ${requestId} AND dr.status = 'pending' AND dr.proof_uploaded_at IS NOT NULL
        AND rp.id = dr.person_id AND r.id = rp.registration_id AND r.paid_at IS NULL
    `,
  ]);
  return saved.length > 0;
}

/**
 * Anträge einer Anmeldung für Status- und Erfolgsansicht – ohne Datei und
 * ohne das Ergebnis der Prüfung, das klärt das Team persönlich.
 * `has_proof` heißt hier „eingereicht“ – auch wenn die Datei schon gelöscht ist.
 */
export async function getRegistrationDiscountRequests(registrationId: number): Promise<DiscountRequestInfo[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT id, person_id::text AS person_id, discount, status,
      proof_uploaded_at IS NOT NULL AS has_proof
    FROM discount_requests
    WHERE registration_id = ${registrationId}
    ORDER BY id
  `;
  return rows as DiscountRequestInfo[];
}

export interface AdminDiscountRequest {
  id: number;
  discount: Discount;
  status: DiscountRequestStatus;
  remember: boolean;
  /** Die Datei liegt noch vor und lässt sich ansehen. */
  has_proof: boolean;
  /** Ein Nachweis wurde eingereicht – auch wenn er inzwischen gelöscht ist. */
  proof_uploaded: boolean;
  proof_type: ProofType | null;
  proof_deleted_at: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  first_name: string;
  last_name: string;
  is_child: boolean;
  person_cancelled: boolean;
  registration_id: number;
  email: string | null;
  registration_status: string;
  paid: boolean;
  event_title: string;
  event_date: string;
}

/** Anträge für den Admin – offene zuerst, ohne Datei. */
export async function getDiscountRequestsForAdmin(): Promise<AdminDiscountRequest[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT
      dr.id, dr.discount, dr.status, dr.remember,
      dr.proof_data IS NOT NULL AS has_proof, dr.proof_uploaded_at IS NOT NULL AS proof_uploaded,
      dr.proof_type, dr.proof_deleted_at,
      dr.created_at, dr.decided_at, dr.decided_by, dr.decision_note,
      rp.first_name, rp.last_name, rp.is_child, rp.cancelled_at IS NOT NULL AS person_cancelled,
      r.id AS registration_id, r.email, r.status AS registration_status, r.paid_at IS NOT NULL AS paid,
      e.title AS event_title, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date
    FROM discount_requests dr
    JOIN registration_persons rp ON rp.id = dr.person_id
    JOIN registrations r ON r.id = dr.registration_id
    JOIN events e ON e.id = r.event_id
    ORDER BY (dr.status = 'pending') DESC, dr.created_at DESC
    LIMIT 300
  `;
  return rows as AdminDiscountRequest[];
}

/** Die einzige Stelle, die den Nachweis liest – nur für die Admin-Ansicht. */
export async function getDiscountProof(requestId: number): Promise<{ type: ProofType; data: Buffer } | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT proof_type, encode(proof_data, 'base64') AS data
    FROM discount_requests
    WHERE id = ${requestId} AND proof_data IS NOT NULL
  `;
  const row = rows[0] as { proof_type: ProofType; data: string } | undefined;
  return row ? { type: row.proof_type, data: Buffer.from(row.data, "base64") } : null;
}

export type DiscountDecisionResult =
  | { ok: true; remembered: boolean }
  | { ok: false; reason: "not_found" | "already_decided" | "proof_missing" };

/**
 * Vermerkt die Prüfung eines offenen Antrags – in einer Transaktion. Am Preis
 * ändert sich nichts: Die Ermäßigung gilt schon seit dem Upload (saveDiscountProof).
 *
 * Bestätigt ⇒ mit Einwilligung Eintrag in die Ermäßigungsliste. Abgelehnt ⇒
 * nur der Vermerk, das Team klärt es persönlich. In beiden Fällen wird der
 * Nachweis gelöscht. Bestätigen setzt voraus, dass einer eingereicht wurde –
 * er darf aber schon gelöscht sein (Frist abgelaufen).
 */
export async function decideDiscountRequest(
  requestId: number,
  decision: "approved" | "rejected",
  note: string | null,
  adminEmail: string,
  today: string
): Promise<DiscountDecisionResult> {
  const sql = getSQL();
  const approve = decision === "approved";
  const none = sql`SELECT NULL WHERE FALSE`;

  const [locked, remembered, decided] = await sql.transaction([
    sql`SELECT id, status, proof_uploaded_at IS NOT NULL AS proof_uploaded FROM discount_requests WHERE id = ${requestId} FOR UPDATE`,
    approve
      ? sql`
          INSERT INTO discount_holders
            (first_name, last_name, email, discount, proof_checked_at, proof_checked_by, consented_at)
          SELECT LEFT(rp.first_name, 50), LEFT(rp.last_name, 50), r.email, dr.discount,
            ${today}::date, ${adminEmail}, NOW()
          FROM discount_requests dr
          JOIN registration_persons rp ON rp.id = dr.person_id
          JOIN registrations r ON r.id = dr.registration_id
          WHERE dr.id = ${requestId} AND dr.status = 'pending' AND dr.proof_uploaded_at IS NOT NULL
            AND dr.remember AND r.email IS NOT NULL
          ON CONFLICT (email, LOWER(first_name), LOWER(last_name)) DO UPDATE SET
            discount = EXCLUDED.discount,
            proof_checked_at = EXCLUDED.proof_checked_at,
            proof_checked_by = EXCLUDED.proof_checked_by,
            consented_at = COALESCE(discount_holders.consented_at, NOW()),
            updated_at = NOW()
          RETURNING id
        `
      : none,
    // Zuletzt der Status – eine Bestätigung braucht einen eingereichten Nachweis.
    sql`
      UPDATE discount_requests SET
        status = ${decision}, decided_at = NOW(), decided_by = ${adminEmail}, decision_note = ${note},
        proof_deleted_at = CASE WHEN proof_data IS NOT NULL THEN NOW() ELSE proof_deleted_at END,
        proof_data = NULL
      WHERE id = ${requestId} AND status = 'pending'
        AND (${!approve}::boolean OR proof_uploaded_at IS NOT NULL)
      RETURNING id
    `,
  ]);

  if (locked.length === 0) return { ok: false, reason: "not_found" };
  if (decided.length === 0) {
    const request = locked[0] as { status: DiscountRequestStatus; proof_uploaded: boolean };
    return { ok: false, reason: request.status === "pending" && !request.proof_uploaded ? "proof_missing" : "already_decided" };
  }
  return { ok: true, remembered: remembered.length > 0 };
}

/**
 * Löscht Nachweise, die nicht mehr gebraucht werden: älter als die Frist,
 * Person storniert oder Anmeldung storniert/abgelehnt. Gibt die Anzahl zurück.
 */
export async function purgeDiscountProofs(): Promise<number> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE discount_requests dr SET proof_data = NULL, proof_deleted_at = NOW()
    FROM registration_persons rp, registrations r
    WHERE rp.id = dr.person_id AND r.id = dr.registration_id
      AND dr.proof_data IS NOT NULL
      AND (
        dr.created_at < NOW() - make_interval(days => ${PROOF_RETENTION_DAYS}::int)
        OR rp.cancelled_at IS NOT NULL
        OR r.status IN ('cancelled', 'rejected')
      )
    RETURNING dr.id
  `;
  return rows.length;
}
