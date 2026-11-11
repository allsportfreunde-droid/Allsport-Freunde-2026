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

/** Speichert (oder ersetzt) den Nachweis eines offenen Antrags. false = nicht mehr offen. */
export async function saveDiscountProof(requestId: number, bytes: Uint8Array, type: ProofType): Promise<boolean> {
  const sql = getSQL();
  // Als Hex-Literal übergeben – so kommt bytea unabhängig vom Treiber unverändert an.
  const hex = `\\x${Buffer.from(bytes).toString("hex")}`;
  const rows = await sql`
    UPDATE discount_requests
    SET proof_data = ${hex}::bytea, proof_type = ${type}, proof_uploaded_at = NOW(), proof_deleted_at = NULL
    WHERE id = ${requestId} AND status = 'pending'
    RETURNING id
  `;
  return rows.length > 0;
}

/** Anträge einer Anmeldung für Status- und Erfolgsansicht – ohne Datei. */
export async function getRegistrationDiscountRequests(registrationId: number): Promise<DiscountRequestInfo[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT id, person_id::text AS person_id, discount, status,
      proof_data IS NOT NULL AS has_proof, decision_note
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
  has_proof: boolean;
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
      dr.proof_data IS NOT NULL AS has_proof, dr.proof_type, dr.proof_deleted_at,
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
  | {
      ok: true;
      /** false, wenn die Anmeldung inzwischen bezahlt war – dann bleibt der Preis, wie er ist. */
      applied: boolean;
      remembered: boolean;
      mail: {
        to: string | null;
        /** Vorname der Hauptperson – sie bekommt die Mail. */
        firstName: string;
        /** Person mit dem Antrag. */
        personName: string;
        statusToken: string;
        eventTitle: string;
        eventDate: string;
        eventTime: string;
        eventLocation: string;
        discount: Discount;
      };
    }
  | { ok: false; reason: "not_found" | "already_decided" | "proof_missing" };

/**
 * Entscheidet einen offenen Antrag – in einer Transaktion:
 * Bestätigt ⇒ Ermäßigung an der Person (nur unbezahlt) und, mit Einwilligung,
 * Eintrag in die Ermäßigungsliste. In beiden Fällen wird der Nachweis gelöscht.
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

  const [locked, applied, remembered, decided] = await sql.transaction([
    sql`SELECT id, status, proof_data IS NOT NULL AS has_proof FROM discount_requests WHERE id = ${requestId} FOR UPDATE`,
    approve
      ? sql`
          UPDATE registration_persons rp SET discount = dr.discount
          FROM discount_requests dr, registrations r
          WHERE dr.id = ${requestId} AND dr.status = 'pending'
            AND dr.proof_data IS NOT NULL
            AND rp.id = dr.person_id AND r.id = rp.registration_id AND r.paid_at IS NULL
          RETURNING rp.id
        `
      : none,
    approve
      ? sql`
          INSERT INTO discount_holders
            (first_name, last_name, email, discount, proof_checked_at, proof_checked_by, consented_at)
          SELECT LEFT(rp.first_name, 50), LEFT(rp.last_name, 50), r.email, dr.discount,
            ${today}::date, ${adminEmail}, NOW()
          FROM discount_requests dr
          JOIN registration_persons rp ON rp.id = dr.person_id
          JOIN registrations r ON r.id = dr.registration_id
          WHERE dr.id = ${requestId} AND dr.status = 'pending' AND dr.proof_data IS NOT NULL
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
    // Zuletzt der Status – eine Bestätigung braucht zwingend einen gespeicherten Nachweis.
    approve
      ? sql`
          UPDATE discount_requests SET
            status = ${decision}, decided_at = NOW(), decided_by = ${adminEmail}, decision_note = ${note},
            proof_deleted_at = NOW(), proof_data = NULL
          WHERE id = ${requestId} AND status = 'pending' AND proof_data IS NOT NULL
          RETURNING id
        `
      : sql`
          UPDATE discount_requests SET
            status = ${decision}, decided_at = NOW(), decided_by = ${adminEmail}, decision_note = ${note},
            proof_deleted_at = CASE WHEN proof_data IS NOT NULL THEN NOW() ELSE proof_deleted_at END,
            proof_data = NULL
          WHERE id = ${requestId} AND status = 'pending'
          RETURNING id
        `,
  ]);

  if (locked.length === 0) return { ok: false, reason: "not_found" };
  if (decided.length === 0) {
    const request = locked[0] as { status: DiscountRequestStatus; has_proof: boolean };
    return { ok: false, reason: request.status === "pending" && !request.has_proof ? "proof_missing" : "already_decided" };
  }

  const rows = await sql`
    SELECT r.email, r.status_token, rp.first_name, rp.last_name, dr.discount,
      COALESCE((SELECT main.first_name FROM registration_persons main
        WHERE main.registration_id = r.id ORDER BY main.created_at LIMIT 1), rp.first_name) AS main_first_name,
      e.title AS event_title, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date, e.time::text AS event_time, e.location AS event_location
    FROM discount_requests dr
    JOIN registration_persons rp ON rp.id = dr.person_id
    JOIN registrations r ON r.id = dr.registration_id
    JOIN events e ON e.id = r.event_id
    WHERE dr.id = ${requestId}
  `;
  const row = rows[0] as {
    email: string | null; status_token: string; first_name: string; last_name: string; discount: Discount;
    main_first_name: string; event_title: string; event_date: string; event_time: string; event_location: string;
  };
  return {
    ok: true,
    applied: applied.length > 0,
    remembered: remembered.length > 0,
    mail: {
      to: row.email,
      firstName: row.main_first_name,
      personName: `${row.first_name} ${row.last_name}`,
      statusToken: row.status_token,
      eventTitle: row.event_title,
      eventDate: row.event_date,
      eventTime: row.event_time,
      eventLocation: row.event_location,
      discount: row.discount,
    },
  };
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
