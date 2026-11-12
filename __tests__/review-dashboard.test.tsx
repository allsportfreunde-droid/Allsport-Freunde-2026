import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventReviewDashboard } from "../lib/types";

type ReviewTabProps = { eventId: number; onChanged?: (data: EventReviewDashboard) => void };
const mocks = vi.hoisted(() => ({
  state: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as (() => void | (() => void))[],
  stateCursor: 0, refCursor: 0, search: new URLSearchParams(), fetch: vi.fn(),
  tabProps: null as ReviewTabProps | null,
}));
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
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "7" }), useSearchParams: () => mocks.search, useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/admin/ReviewTab", () => ({ default: (props: ReviewTabProps) => { mocks.tabProps = props; return <div>Review-Inhalt</div>; } }));

const { default: DashboardPage } = await import("../app/admin/events/[id]/dashboard/page");
const reviewData = {
  event: { id: 7 }, requested: 3, pending_initial: 2,
} as EventReviewDashboard;
const checkinData = {
  total: 0, checked_in: 0, missing: 0, total_registrations: 0, total_guests: 0,
  walk_in_registrations: 0, walk_in_guests: 0, participants: [], waitlist: [], waitlist_registrations: 0, waitlist_persons: 0,
};
const cleanups: (() => void)[] = [];

function render() {
  mocks.stateCursor = 0; mocks.refCursor = 0; mocks.effects = []; mocks.tabProps = null;
  return renderToStaticMarkup(<DashboardPage />);
}
async function mount() {
  render();
  for (const effect of mocks.effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  await vi.advanceTimersByTimeAsync(0);
  return render();
}
function tabButton(html: string, label: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0])
    .find((value) => value.includes(`class="hidden sm:inline">${label}</span>`));
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  mocks.state = []; mocks.refs = []; mocks.search = new URLSearchParams();
  mocks.fetch.mockImplementation(async (url: string) => new Response(JSON.stringify(
    url.endsWith("/review") ? reviewData : url.includes("/api/checkin/status/") ? checkinData : {}
  ), { status: 200 }));
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("Review-Tab im Check-in-Dashboard", () => {
  it("öffnet den Review-Tab per Deep Link und erhält die horizontal scrollende Leiste", async () => {
    mocks.search.set("tab", "review");
    const html = await mount();
    expect(mocks.tabProps?.eventId).toBe(7);
    expect(html).toContain("Review-Inhalt");
    expect(html).toContain("overflow-x-auto scrollbar-hide snap-x snap-mandatory");
    const button = tabButton(html, "Review");
    expect(button).toContain("flex-none snap-start");
    expect(button).toContain("bg-white text-gray-900 shadow-sm");
    expect(button).toContain('class="sm:hidden">Review</span>');
  });
  it.each([
    ["anmeldungen", "Anmeldungen"], ["warteliste", "Warteliste"], ["finanzen", "Finanzen"], ["spenden", "Spenden"], ["unbekannt", "Anmeldungen"],
  ])("akzeptiert tab=%s und zeigt %s", async (key, label) => {
    mocks.search.set("tab", key);
    const html = await mount();
    expect(tabButton(html, label)).toContain("bg-white text-gray-900 shadow-sm");
    expect(mocks.tabProps).toBeNull();
  });
  it("aktualisiert den Badge nach Änderungen aus dem Review-Tab", async () => {
    mocks.search.set("tab", "review");
    let html = await mount();
    expect(tabButton(html, "Review")).toContain("bg-amber-500");
    expect(tabButton(html, "Review")).toMatch(/leading-none">2<\/span>/);
    mocks.tabProps!.onChanged!({ ...reviewData, pending_initial: 0 });
    html = render();
    expect(tabButton(html, "Review")).toContain("bg-green-600");
    expect(tabButton(html, "Review")).toContain("✓");
    mocks.tabProps!.onChanged!({ ...reviewData, requested: 0 });
    html = render();
    expect(tabButton(html, "Review")).not.toContain("leading-none");
  });
  it("lädt den Badge einmal und belässt die bestehende Zehn-Sekunden-Abfrage bei Status und Finanzen", async () => {
    await mount();
    await vi.advanceTimersByTimeAsync(20000);
    expect(mocks.fetch.mock.calls.filter(([url]) => url.endsWith("/review"))).toHaveLength(1);
    expect(mocks.fetch.mock.calls.filter(([url]) => url.includes("/api/checkin/status/"))).toHaveLength(3);
    expect(mocks.fetch.mock.calls.filter(([url]) => url.endsWith("/finances"))).toHaveLength(3);
  });
});
