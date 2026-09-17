/**
 * Zwei stille Prüfungen gegen Formular-Bots: ein unsichtbares Feld, das nur
 * ein Automat ausfüllt, und die Zeit, die das Ausfüllen gedauert hat.
 *
 * Beide können einen echten Menschen aussperren, und das merkt niemand – die
 * Antwort ist bewusst nichtssagend. Deshalb nennt `honeypotFailure` den Grund
 * beim Namen: die aufrufende Route schreibt ihn ins Log, sonst steht man vor
 * einem "Ungültige Anfrage" ohne jeden Anhaltspunkt.
 */

const MIN_FILL_TIME_MS = 2500;

type HoneypotInput = FormData | { _hp?: string; _ts?: string | number | null };

/** Woran eine Anfrage gescheitert ist. null = in Ordnung. */
export type HoneypotFailure =
  | "honeypot_filled"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "too_fast";

function read(input: HoneypotInput, key: "_hp" | "_ts"): string | null {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    const v = input.get(key);
    return typeof v === "string" ? v : null;
  }
  const v = (input as { _hp?: unknown; _ts?: unknown })[key];
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Prüft die Anfrage und benennt den Grund einer Ablehnung.
 *
 * Der Zeitstempel kommt aus dem Browser, verglichen wird mit der Uhr des
 * Servers. Gehen die beiden Uhren auseinander – in einem Container nach einem
 * Standby keine Seltenheit –, liegt der Zeitstempel scheinbar in der Zukunft.
 * Das darf niemanden aussperren: eine "zu schnelle" Anfrage ist nur die, die
 * nachweislich zu kurz gedauert hat. Ein Bot gewinnt dadurch nichts, denn er
 * könnte den Zeitstempel ohnehin beliebig weit zurückdatieren.
 */
export function honeypotFailure(input: HoneypotInput): HoneypotFailure | null {
  const hp = read(input, "_hp");
  if (hp && hp.trim() !== "") return "honeypot_filled";

  const tsRaw = read(input, "_ts");
  if (!tsRaw) return "missing_timestamp";
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || ts <= 0) return "invalid_timestamp";

  const elapsed = Date.now() - ts;
  if (elapsed >= 0 && elapsed < MIN_FILL_TIME_MS) return "too_fast";

  return null;
}

export function validateHoneypot(input: HoneypotInput): boolean {
  return honeypotFailure(input) === null;
}
