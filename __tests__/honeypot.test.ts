/**
 * Tests für lib/honeypot.ts – die stille Bot-Prüfung der Formulare.
 */

import { describe, it, expect } from "vitest";
import { honeypotFailure, validateHoneypot } from "../lib/honeypot";

const vorSekunden = (s: number) => String(Date.now() - s * 1000);

describe("honeypotFailure", () => {
  it("lässt ein normal ausgefülltes Formular durch", () => {
    expect(honeypotFailure({ _hp: "", _ts: vorSekunden(30) })).toBeNull();
    expect(validateHoneypot({ _hp: "", _ts: vorSekunden(30) })).toBe(true);
  });

  it("weist ein ausgefülltes Fallenfeld ab", () => {
    expect(honeypotFailure({ _hp: "http://spam", _ts: vorSekunden(30) })).toBe(
      "honeypot_filled"
    );
  });

  it("weist ein sofort abgeschicktes Formular ab", () => {
    expect(honeypotFailure({ _hp: "", _ts: String(Date.now()) })).toBe("too_fast");
  });

  it("verlangt einen Zeitstempel", () => {
    expect(honeypotFailure({ _hp: "" })).toBe("missing_timestamp");
    expect(honeypotFailure({ _hp: "", _ts: "" })).toBe("missing_timestamp");
    expect(honeypotFailure({ _hp: "", _ts: "gestern" })).toBe("invalid_timestamp");
  });

  it("sperrt niemanden aus, dessen Uhr vorgeht", () => {
    // Browser-Uhr eine Minute vor der Server-Uhr: der Zeitstempel liegt
    // scheinbar in der Zukunft. Das ist kein Bot, sondern eine Uhr.
    const zukunft = String(Date.now() + 60_000);
    expect(honeypotFailure({ _hp: "", _ts: zukunft })).toBeNull();
  });
});
