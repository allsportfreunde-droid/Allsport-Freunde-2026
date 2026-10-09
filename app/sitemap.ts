import type { MetadataRoute } from "next";
import { getEvents } from "@/lib/db";
import { SITE } from "@/lib/site";

// Upcoming events change daily, so build the sitemap per request.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/impressum`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/datenschutz`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/teilnahmebedingungen`, changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    // getEvents() only returns published, upcoming events: the shareable ones.
    const events = await getEvents();
    return [
      ...staticPages,
      ...events.map((event) => ({
        url: `${SITE.url}/events/${event.id}`,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    // A database hiccup must not take the sitemap down.
    console.error("Sitemap: Events konnten nicht geladen werden:", error);
    return staticPages;
  }
}
