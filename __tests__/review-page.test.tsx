import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import type ReviewForm from "../components/review/ReviewForm";

type FormProps = ComponentProps<typeof ReviewForm>;
const mocks = vi.hoisted(() => ({
  state: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as (() => void | (() => void))[],
  stateCursor: 0, refCursor: 0, search: new URLSearchParams(), fetch: vi.fn(), replaceState: vi.fn(),
  formProps: null as FormProps | null,
}));

// Wie bei den Statusseiten-Tests: Effekte und Netzwerk ohne DOM kontrollieren.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = mocks.stateCursor++;
    if (!(index in mocks.state)) mocks.state[index] = typeof initial === "function" ? initial() : initial;
    return [mocks.state[index], (value: unknown) => {
      mocks.state[index] = typeof value === "function" ? value(mocks.state[index]) : value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = mocks.refCursor++;
    mocks.refs[index] ??= { current: initial };
    return mocks.refs[index];
  },
  useEffect: (effect: () => void | (() => void)) => { mocks.effects.push(effect); },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "token" }), useSearchParams: () => mocks.search }));
vi.mock("lucide-react", () => ({ Loader2: () => null }));
vi.mock("@/components/review/ReviewForm", () => ({ default: (props: FormProps) => { mocks.formProps = props; return null; } }));

const { default: ReviewPageRoute } = await import("../app/review/[token]/page");
const answer = { rating: 4, would_return: "ja", comment: "Bisheriger Kommentar", publish_consent: true };
const info = {
  first_name: "Ahmet", event_title: "Fußball", event_date: "2026-10-18", deadline: "2026-11-01T12:00:00Z",
  is_open: true, review: answer,
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
let cleanup: (() => void) | undefined;

function render() {
  mocks.stateCursor = 0;
  mocks.refCursor = 0;
  mocks.effects = [];
  mocks.formProps = null;
  return renderToStaticMarkup(<ReviewPageRoute />);
}
function mount() {
  const html = render();
  cleanup = mocks.effects[0]() as () => void;
  return html;
}
function posts() { return mocks.fetch.mock.calls.filter(([, options]) => options?.method === "POST"); }

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state = [];
  mocks.refs = [];
  mocks.search = new URLSearchParams();
  mocks.fetch.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "POST"
    ? response({ review: { ...answer, rating: JSON.parse(options.body as string).rating } }) : response(info));
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("window", {
    location: { href: "http://localhost/review/token?rating=4&quelle=mail#formular" },
    history: { state: { navigation: true }, replaceState: mocks.replaceState },
  });
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });

describe("Öffentliche Review-Seite", () => {
  it("lädt erst im Browser und zeigt bis dahin einen Ladezustand", () => {
    expect(render()).toContain("Deine Bewertung wird geladen…");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("speichert einen gültigen E-Mail-Stern einmal und entfernt nur rating aus der URL", async () => {
    mocks.search.set("rating", "4");
    mount();
    await flush();
    render();
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0][1].body)).toEqual({ rating: 4 });
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(mocks.replaceState).toHaveBeenCalledExactlyOnceWith({ navigation: true }, "", "/review/token?quelle=mail#formular");
    expect(mocks.formProps).toMatchObject({ saved: true, value: answer });
  });

  it("verdoppelt einen laufenden POST bei StrictMode-Effektwiederholung nicht", async () => {
    mocks.search.set("rating", "4");
    let finish!: (value: Response) => void;
    mocks.fetch.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "POST"
      ? new Promise<Response>((resolve) => { finish = resolve; }) : response(info));
    mount();
    await flush();
    expect(posts()).toHaveLength(1);
    cleanup?.();
    cleanup = mocks.effects[0]() as () => void;
    await flush();
    expect(posts()).toHaveLength(1);
    finish(response({ review: answer }));
    await flush();
    render();
    expect(mocks.formProps?.info.review).toEqual(answer);
    expect(mocks.replaceState).toHaveBeenCalledTimes(1);
  });

  it.each(["0", "6", "2.5", "04", "4abc", ""])("speichert den ungültigen URL-Wert %s nicht", async (rating) => {
    mocks.search.set("rating", rating);
    mount(); await flush(); render();
    expect(posts()).toHaveLength(0);
    expect(mocks.formProps?.info).toEqual(info);
  });

  it("speichert bei einem geschlossenen Fenster auch einen gültigen Stern nicht", async () => {
    mocks.search.set("rating", "4");
    mocks.fetch.mockResolvedValue(response({ ...info, is_open: false }));
    mount(); await flush(); render();
    expect(posts()).toHaveLength(0);
    expect(mocks.formProps?.info.is_open).toBe(false);
  });

  it("zeigt unbekannte Links und Netzwerkfehler sichtbar an", async () => {
    mocks.fetch.mockResolvedValue(response({ error: "Dieser Link ist ungültig." }, 404));
    mount(); await flush();
    const html = render();
    expect(html).toContain("Dieser Link ist ungültig.");
    expect(html).toContain('role="alert"');
    expect(mocks.formProps).toBeNull();
  });

  it("zeigt einen Fehler des automatischen Speicherns an und reagiert auf Fristablauf", async () => {
    mocks.search.set("rating", "4");
    mocks.fetch.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "POST"
      ? response({ error: "Die Bewertungsfrist für dieses Event ist abgelaufen." }, 410) : response(info));
    mount(); await flush(); render();
    expect(mocks.formProps).toMatchObject({ info: { is_open: false }, error: "Die Bewertungsfrist für dieses Event ist abgelaufen." });
  });

  it("erhält ungesendete optionale Antworten beim Ändern der Sterne", async () => {
    mount(); await flush(); render();
    mocks.formProps!.onChange!({ comment: "Noch nicht gesendet", would_return: "nein" });
    render();
    mocks.formProps!.onRatingChange!(3);
    mocks.formProps!.onRatingChange!(5);
    await flush(); render();
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0][1].body)).toEqual({ rating: 3 });
    expect(mocks.formProps?.value).toMatchObject({ rating: 3, comment: "Noch nicht gesendet", would_return: "nein" });
  });

  it("setzt beim Leeren des Kommentars die Einwilligung zurück und zeigt nach Absenden die Bestätigung", async () => {
    mount(); await flush(); render();
    mocks.formProps!.onChange!({ comment: "" });
    render();
    expect(mocks.formProps?.value?.publish_consent).toBe(false);
    mocks.formProps!.onSubmit!();
    await flush(); render();
    expect(JSON.parse(posts()[0][1].body)).toEqual({ rating: 4, would_return: "ja", comment: "", publish_consent: false });
    expect(mocks.formProps?.submitted).toBe(true);
    mocks.formProps!.onEdit!(); render();
    expect(mocks.formProps?.submitted).toBe(false);
  });
});
