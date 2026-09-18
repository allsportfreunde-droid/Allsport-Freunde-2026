"use client";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Calendar, Clock, ChevronRight } from "lucide-react";
import type { EventWithRegistrations } from "@/lib/types";
import { motion } from "framer-motion";

const categoryConfig = {
  fussball: {
    label: "Fußball ⚽",
    variant: "fussball" as const,
    progressColor: "bg-green-500",
  },
  fitness: {
    label: "Fitness 💪",
    variant: "fitness" as const,
    progressColor: "bg-orange-500",
  },
  schwimmen: {
    label: "Schwimmen 🏊",
    variant: "schwimmen" as const,
    progressColor: "bg-blue-500",
  },
};

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
  index: number;
  onRegister: (event: EventWithRegistrations) => void;
  onShowDetails: (event: EventWithRegistrations) => void;
}

export default function EventCard({
  event,
  index,
  onRegister,
  onShowDetails,
}: EventCardProps) {
  const config = categoryConfig[event.category];
  const isFull = event.is_full ?? false;
  const percentage = event.occupancy_percentage ?? 0;
  const bookedPercentage = percentage;

  // Teaser: first sentence or first 100 chars
  const teaser = event.description
    ? event.description.split(/[.!?]/)[0].trim().slice(0, 100) +
      (event.description.length > 100 ? "…" : ".")
    : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: 0.05 * index }}
    >
      <Card className="h-full flex flex-col hover:shadow-lg transition-shadow duration-300 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mt-2 leading-snug">
            {event.title}
          </h3>
          {teaser && (
            <p className="text-sm text-gray-500 line-clamp-2">{teaser}</p>
          )}
        </CardHeader>

        <CardContent className="flex-1 space-y-3">
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4 shrink-0 text-gray-400" />
              <span>{formatDate(event.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 shrink-0 text-gray-400" />
              <span>{event.time} Uhr</span>
            </div>
          </div>

          {/* Availability */}
          <div className="pt-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Plätze</span>
              <span
                className={`font-medium ${
                  isFull ? "text-red-600" : "text-gray-600"
                }`}
              >
                {isFull
                  ? "Ausgebucht"
                  : `${bookedPercentage}% vergeben`}
              </span>
            </div>
            <Progress
              value={percentage}
              indicatorClassName={isFull ? "bg-red-500" : config.progressColor}
            />
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onShowDetails(event)}
          >
            Mehr Infos
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
          <Button
            className="flex-1"
            onClick={() => onRegister(event)}
            variant={isFull ? "secondary" : "default"}
          >
            {isFull ? "Auf die Warteliste" : "Anmelden"}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
