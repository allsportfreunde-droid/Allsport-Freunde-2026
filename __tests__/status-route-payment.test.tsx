import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StatusPageRoute from "../app/status/[token]/page";
import type { RegistrationStatusInfo } from "../lib/types";

// Der Node-Test führt den echten Seiteneffekt aus; Timer und Netzwerk sind kontrolliert.
const mocks = vi.hoisted(() => ({
  effect: vi.fn(), setters: [] as ReturnType<typeof vi.fn>[],
  search: new URLSearchParams(), fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: mocks.effect,
  useState: (initial: unknown) => {
    const setter = vi.fn();
    mocks.setters.push(setter);
    return [initial, setter];
  },
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "token" }), useSearchParams: () => mocks.search,
}));

let unmount: (() => void) | undefined;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const status = (payment_state: RegistrationStatusInfo["payment_state"]) => ({
  payment_state, paid_at: payment_state === "paid" ? "2026-09-17T10:00:00Z" : null,
});
const lastInfo = () => mocks.setters[0].mock.calls.at(-1)?.[0];
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
function mount() {
  renderToStaticMarkup(<StatusPageRoute />);
  unmount = mocks.effect.mock.calls.at(-1)![0]();
}
function replies(...states: RegistrationStatusInfo["payment_state"][]) {
  for (const state of states) {
    mocks.fetch.mockResolvedValueOnce(response({ synchronized: true }))
      .mockResolvedValueOnce(response(status(state)));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.fetch.mockReset();
  mocks.setters.length = 0;
  mocks.search = new URLSearchParams();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Zahlungsabgleich beim Laden und während der Prüfung", () => {
  it.each([null, "cs_return"])("gleicht auch mit session_id=%s ab und lädt danach ohne Cache", async (sessionId) => {
    if (sessionId) mocks.search.set("session_id", sessionId);
    replies("open");
    mount();
    await flush();
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, "/api/checkout/confirm", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({
      status_token: "token", ...(sessionId ? { session_id: sessionId } : {}),
    });
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, "/api/status/token", expect.objectContaining({ cache: "no-store" }));
    expect(lastInfo().payment_state).toBe("open");
  });

  it.each(["open", "failed", "paid"] as const)("aktualisiert checking und processing bis %s und beendet dann das Polling", async (terminal) => {
    replies("checking", "processing", terminal);
    mount();
    await flush();
    expect(lastInfo().payment_state).toBe("checking");
    await vi.advanceTimersByTimeAsync(5000);
    expect(lastInfo().payment_state).toBe("processing");
    await vi.advanceTimersByTimeAsync(5000);
    expect(lastInfo().payment_state).toBe(terminal);
    await vi.advanceTimersByTimeAsync(60000);
    expect(mocks.fetch).toHaveBeenCalledTimes(6);
  });

  it.each(["network", "503", "429"])("hält einen offenen Datenbankstand bei Abgleichfehler %s gesperrt und versucht es erneut", async (failure) => {
    mocks.search.set("zahlung", "erfolg");
    if (failure === "network") mocks.fetch.mockRejectedValueOnce(new Error("offline"));
    else mocks.fetch.mockResolvedValueOnce(response({}, Number(failure)));
    mocks.fetch.mockResolvedValueOnce(response(status("open")));
    replies("open");
    mount();
    await flush();
    expect(lastInfo().payment_state).toBe("checking");
    expect(lastInfo().paid_at).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(lastInfo().payment_state).toBe("open");
  });

  it.each(["processing", "paid"] as const)("behält den bestätigten Datenbankstand %s trotz Abgleichfehler", async (state) => {
    mocks.fetch.mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response(status(state)));
    mount();
    await flush();
    expect(lastInfo().payment_state).toBe(state);
  });

  it("behält bei einem Statusfehler die bisherige Sperre und setzt die Aktualisierung fort", async () => {
    replies("checking");
    mocks.fetch.mockResolvedValueOnce(response({})).mockRejectedValueOnce(new Error("offline"));
    replies("failed");
    mount();
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(lastInfo().payment_state).toBe("checking");
    expect(mocks.setters[2]).not.toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(lastInfo().payment_state).toBe("failed");
  });

  it.each(["confirm", "status"])("überlappt langsame %s-Requests nicht und bricht sie beim Verlassen ab", async (phase) => {
    replies("checking");
    if (phase === "status") mocks.fetch.mockResolvedValueOnce(response({}));
    let resolve!: (value: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    mount();
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    const count = mocks.fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(mocks.fetch).toHaveBeenCalledTimes(count);
    const signal = mocks.fetch.mock.calls.at(-1)![1].signal as AbortSignal;
    const updates = mocks.setters.map(setter => setter.mock.calls.length);
    unmount!();
    expect(signal.aborted).toBe(true);
    resolve(response(status("paid")));
    await flush();
    expect(mocks.setters.map(setter => setter.mock.calls.length)).toEqual(updates);
    expect(mocks.fetch).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("entfernt beim Verlassen auch einen bereits geplanten Polling-Timer", async () => {
    replies("checking");
    mount();
    await flush();
    unmount!();
    await vi.advanceTimersByTimeAsync(60000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
