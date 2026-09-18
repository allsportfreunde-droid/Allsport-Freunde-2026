// In-Memory Rate Limiting pro Serverless-Instanz.
// Hinweis: Diese Lösung funktioniert pro Serverless-Instanz (kein geteilter State).
// Für produktiven Einsatz mit hohem Traffic später durch Upstash Redis ersetzen.

const store = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export function checkRateLimit(ip: string, options: { limit: number; windowMs: number }): boolean {
  const now = Date.now();
  const key = `${ip}:${options.limit}:${options.windowMs}`;
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return true;
  }

  if (entry.count >= options.limit) return false;

  entry.count++;
  return true;
}

export function getClientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

export const RATE_LIMITS = {
  registration: { limit: 5, windowMs: 10 * 60 * 1000 },
  contact: { limit: 3, windowMs: 10 * 60 * 1000 },
  // Jeder Aufruf erzeugt eine Stripe Session – das soll niemand in Schleife tun.
  checkout: { limit: 10, windowMs: 10 * 60 * 1000 },
  checkoutStatus: { limit: 120, windowMs: 60 * 1000 },
} as const;
