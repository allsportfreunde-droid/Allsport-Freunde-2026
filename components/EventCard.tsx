"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, ChevronRight } from "lucide-react";
import type { EventWithRegistrations } from "@/lib/types";
import { CATEGORY_CONFIG } from "@/lib/categories";
import OccupancyMeter from "./OccupancyMeter";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface EventCardProps {
  event: EventWithRegistrations;
  onRegister: (event: EventWithRegistrations) => void;
  onShowDetails: (event: EventWithRegistrations) => void;
}

export default function EventCard({
  event,
  onRegister,
  onShowDetails,
}: EventCardProps) {
  const config = CATEGORY_CONFIG[event.category];
  const isFull = event.is_full ?? false;
  const percentage = event.occupancy_percentage ?? 0;
  const cover = event.images?.[0];

  // Teaser: first sentence or first 100 chars
  const teaser = event.description
    ? event.description.split(/[.!?]/)[0].trim().slice(0, 100) +
      (event.description.length > 100 ? "…" : ".")
    : "";

  return (
    // Cards fade up as they scroll into view (CSS, see globals.css). The
    // hover lift lives on the inner <article> so the two transforms don't clash.
    <div className="reveal-on-scroll h-full">
      <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgb(27_44_84/0.35)]">
        {cover ? (
          <div className="relative aspect-video overflow-hidden bg-navy-100">
            <Image
              src={cover.url}
              alt={cover.alt_text || event.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
            />
          </div>
        ) : (
          // Same height as a photo so cards in one row line up.
          <div aria-hidden="true" className={`flex aspect-video items-center justify-center ${config.coverClass}`}>
            <config.icon className="h-14 w-14 transition-transform duration-500 motion-safe:group-hover:scale-110" />
          </div>
        )}

        <div className="flex flex-1 flex-col p-6">
          <Badge variant={config.variant} className="self-start">{config.label}</Badge>
          <h3 className="mt-3 text-lg font-bold leading-snug text-navy-700">{event.title}</h3>
          {teaser && <p className="mt-1.5 line-clamp-2 text-sm text-neutral-600">{teaser}</p>}

          <div className="mt-4 space-y-1.5 text-sm text-neutral-600">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
              <span>{formatDate(event.date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
              <span>{event.time} Uhr</span>
            </div>
          </div>

          <OccupancyMeter
            className="mt-5"
            percentage={percentage}
            isFull={isFull}
            barColor={config.barColor}
          />

          <div className="mt-auto flex gap-2 pt-6">
            <Button variant="outline" className="flex-1 text-navy-700" onClick={() => onShowDetails(event)}>
              Mehr Infos
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              className="flex-1"
              onClick={() => onRegister(event)}
              variant={isFull ? "secondary" : "default"}
            >
              {isFull ? "Auf die Warteliste" : "Anmelden"}
            </Button>
          </div>
        </div>
      </article>
    </div>
  );
}
