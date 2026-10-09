import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import Hero from "@/components/Hero";
import AboutUs from "@/components/AboutUs";
import EventGrid from "@/components/EventGrid";
import GeneralInfo from "@/components/GeneralInfo";
import Footer from "@/components/Footer";
import { SITE } from "@/lib/site";

const TITLE = "Allsport Freunde 2026 e.V. | Sportverein in Ingelheim & Rhein-Main";
const DESCRIPTION =
  "Gemeinnütziger Sportverein in der Rhein-Main-Region. Fußball, Fitness, Schwimmen und mehr, für alle, die Bewegung und Gemeinschaft lieben.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: SITE.name,
    type: "website",
    locale: "de_DE",
    images: ["/og-default.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-default.jpg"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SportsClub",
  name: SITE.name,
  url: SITE.url,
  logo: `${SITE.url}/logo_1000_1000.png`,
  image: `${SITE.url}/og-default.jpg`,
  description: DESCRIPTION,
  email: SITE.email,
  telephone: SITE.phoneDisplay.replace(/\s/g, ""),
  address: {
    "@type": "PostalAddress",
    streetAddress: SITE.street,
    postalCode: SITE.postalCode,
    addressLocality: SITE.city,
    addressCountry: "DE",
  },
  areaServed: "Rhein-Main",
  sport: ["Fußball", "Fitness", "Schwimmen"],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <SiteHeader />
      <main>
        <Hero />
        {/* Events come right after the hero: they are what visitors come for. */}
        <EventGrid />
        <AboutUs />
        <GeneralInfo />
      </main>
      <Footer />
    </>
  );
}
