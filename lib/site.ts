/** Public facts about the club, shared by header, footer, metadata and JSON-LD. */
export const SITE = {
  name: "Allsport Freunde 2026 e.V.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://allsport-freunde.com",
  email: "info@allsport-freunde.com",
  phoneDisplay: "+49 176 73548538",
  phoneHref: "tel:+4917673548538",
  street: "Wackernheimer Straße 35",
  postalCode: "55218",
  city: "Ingelheim am Rhein",
} as const;

/**
 * Photos for the landing page.
 *
 * TODO(photos): these are Picsum placeholders until the club photos arrive.
 * Drop the real files into public/images/ and switch `src` to e.g.
 * "/images/hero.jpg". Update `alt` to describe what the real photo shows.
 */
export const SITE_IMAGES = {
  hero: {
    src: "https://picsum.photos/seed/allsport-freunde-hero/1600/1200",
    alt: "Vereinsmitglieder beim gemeinsamen Training",
  },
  about: {
    // Shown as a wide band (21:9 on desktop), so a landscape group photo works best.
    src: "https://picsum.photos/seed/allsport-freunde-verein/2100/900",
    alt: "Gruppe der Allsport Freunde nach einem Event",
  },
} as const;
