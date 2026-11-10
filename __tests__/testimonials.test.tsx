import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicTestimonialsResponse } from "../lib/types";

const mocks = vi.hoisted(() => ({
  state: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[], fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = mocks.cursor++;
    if (!(index in mocks.state)) mocks.state[index] = typeof initial === "function" ? initial() : initial;
    return [mocks.state[index], (value: unknown) => {
      mocks.state[index] = typeof value === "function" ? value(mocks.state[index]) : value;
    }];
  },
  useEffect: (effect: () => void | (() => void)) => { mocks.effects.push(effect); },
}));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> },
}));
const { default: Testimonials, TestimonialsView } = await import("../components/Testimonials");

const data: PublicTestimonialsResponse = { average: 4.6, count: 10, items: [{
  id: 11, name: "Ahmet K.", rating: 5, comment: "Ein toller Nachmittag!", event_title: "Fußball", event_category: "fussball", event_date: "2026-10-18",
}] };
const empty: PublicTestimonialsResponse = { average: null, count: 0, items: [] };
let cleanup: (() => void) | undefined;
function render(element: React.ReactElement) {
  mocks.cursor = 0; mocks.effects = [];
  return renderToStaticMarkup(element);
}
function view(value = data) { return render(<TestimonialsView data={value} />); }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => { vi.resetAllMocks(); mocks.state = []; vi.stubGlobal("fetch", mocks.fetch); });
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });

describe("Teilnehmerstimmen-Ansicht", () => {
  it("rendert bei leerer Liste nichts, auch wenn ein Durchschnitt vorhanden ist", () => {
    expect(view({ ...data, items: [] })).toBe("");
  });
  it("zeigt Überschrift, abgekürzten Namen, Sterne und deutschen Durchschnitt", () => {
    const html = view();
    expect(html).toContain('id="stimmen"');
    expect(html).toContain("Das sagen unsere Teilnehmer");
    expect(html).toContain("Ø 4,6 von 5 ★ aus 10 Bewertungen");
    expect(html).toContain("— Ahmet K., Fußball");
    expect(html).toContain('aria-label="5 von 5 Sternen"');
    expect(html).toContain("<blockquote");
    expect(html).toContain("Ein toller Nachmittag!");
    expect(html).toContain("grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3");
  });
  it("lässt bei average=null die Durchschnittszeile weg", () => {
    const html = view({ ...data, average: null });
    expect(html).not.toContain("Ø");
    expect(html).not.toContain("von 5 ★ aus");
    expect(html).toContain("Ahmet K.");
  });
  it("kürzt lange Kommentare auf 280 Zeichen und bietet einen zugänglichen Mehr-Button", () => {
    const html = view({ ...data, items: [{ ...data.items[0], comment: `${"a".repeat(280)}verborgener Rest` }] });
    expect(html).toContain("a".repeat(280));
    expect(html).not.toContain("verborgener Rest");
    expect(html).toContain("… mehr");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="testimonial-comment-11"');
  });
  it("zählt Unicode-Zeichen vollständig und kürzt Kommentare mit genau 280 Zeichen nicht", () => {
    const html = view({ ...data, items: [{ ...data.items[0], comment: "😀".repeat(280) }] });
    expect(html).toContain("😀".repeat(280));
    expect(html).not.toContain("… mehr");
  });
  it("gibt Kommentare nur als Text aus", () => {
    const html = view({ ...data, items: [{ ...data.items[0], comment: "<script>unerwünschter Inhalt</script>" }] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("Laden der Teilnehmerstimmen", () => {
  it("rendert vor dem Laden nichts und ruft im Server-Rendering keine API auf", () => {
    expect(render(<Testimonials />)).toBe("");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([empty, data])("rendert die geladene API-Antwort passend zum Inhalt", async (body) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(body)));
    render(<Testimonials />);
    cleanup = mocks.effects[0]() as () => void;
    await flush();
    const html = render(<Testimonials />);
    expect(mocks.fetch).toHaveBeenCalledWith("/api/testimonials", expect.objectContaining({ cache: "no-store" }));
    if (body.items.length === 0) expect(html).toBe("");
    else expect(html).toContain("Ahmet K.");
  });
  it.each(["Netzwerk", "HTTP", "JSON"])("bleibt bei Fehlern unsichtbar: %s", async (failure) => {
    if (failure === "Netzwerk") mocks.fetch.mockRejectedValue(new Error("Netzwerk nicht erreichbar."));
    else mocks.fetch.mockResolvedValue(failure === "HTTP" ? new Response("", { status: 500 }) : new Response("{"));
    render(<Testimonials />);
    cleanup = mocks.effects[0]() as () => void;
    await flush();
    expect(render(<Testimonials />)).toBe("");
  });
  it("bricht beim Verlassen die Abfrage ab und übernimmt keine verspätete Antwort", async () => {
    let resolve!: (value: Response) => void;
    mocks.fetch.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    render(<Testimonials />);
    cleanup = mocks.effects[0]() as () => void;
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    cleanup();
    resolve(new Response(JSON.stringify(data)));
    await flush();
    expect(signal.aborted).toBe(true);
    expect(render(<Testimonials />)).toBe("");
  });
});
