import { Client } from "@neondatabase/serverless";
import WebSocket from "ws";

export type RegistrationSQL = (
  strings: TemplateStringsArray, ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

/**
 * neon().transaction() only supports pre-built HTTP batches. Cancellation needs
 * a decision between reads and writes, so use one interactive Client session.
 * Always acquire the registration row BEFORE reading checkout/person state in a
 * separate statement: READ COMMITTED then sees commits made while we waited.
 * Payment writers take this same lock, including recordCheckoutState.
 */
export async function withRegistrationLock<T>(
  registrationId: number, operation: (sql: RegistrationSQL) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  client.neonConfig.webSocketConstructor = WebSocket;
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query("SELECT id FROM registrations WHERE id = $1 FOR UPDATE", [registrationId]);
    const sql: RegistrationSQL = async (strings, ...values) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "");
      return (await client.query(query, values)).rows;
    };
    const result = await operation(sql);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
