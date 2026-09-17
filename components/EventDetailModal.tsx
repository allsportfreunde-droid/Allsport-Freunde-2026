"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Car,
  Euro,
  Shirt,
  Users,
  Copy,
  Check,
  MessageSquare,
  Share2,
} from "lucide-react";
import type { EventWithRegistrations } from "@/lib/types";
import ImageCarousel from "./ImageCarousel";
import { formatEventPrice } from "@/lib/price";

// Leaflet must only run client-side (no SSR)
const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

const categoryConfig = {
  fussball: { label: "Fußball ⚽", variant: "fussball" as const },
  fitness: { label: "Fitness 💪", variant: "fitness" as const },
  schwimmen: { label: "Schwimmen 🏊", variant: "schwimmen" as const },
};

const progressColors: Record<string, string> = {
  fussball: "bg-green-500",
  fitness: "bg-orange-500",
  schwimmen: "bg-blue-500",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface EventDetailModalProps {
  event: EventWithRegistrations | null;
  open: boolean;
  onClose: () => void;
  onRegister: (event: EventWithRegistrations) => void;
  onContact?: (eventId: number) => void;
}

export default function EventDetailModal({
  event,
  open,
  onClose,
  onRegister,
  onContact,
}: EventDetailModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedLocation, setCopiedLocation] = useState(false);
  const [copiedParking, setCopiedParking] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Copy to clipboard function
  const copyToClipboard = (text: string, setter: (value: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  // Scroll to top on open
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [open, event]);

  if (!event) return null;

  const config = categoryConfig[event.category];
  const isFull = event.is_full ?? false;
  const percentage = event.occupancy_percentage ?? 0;
  const bookedPercentage = percentage;
  const hasImages = (event.images?.length ?? 0) > 0;

  // Teilen: auf dem Handy die System-Auswahl (WhatsApp, Signal, …),
  // am Desktop fällt es auf "Link kopieren" zurück.
  const handleShare = async () => {
    const url = `${window.location.origin}/events/${event.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: `${event.title} – ${formatDate(event.date)}, ${event.time} Uhr`,
          url,
        });
      } catch {
        // Abbruch durch den Nutzer – nichts weiter tun.
      }
      return;
    }
    copyToClipboard(url, setCopiedShare);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          >
            <div
              ref={scrollRef}
              className="relative w-full max-w-3xl max-h-[95dvh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl"
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm shadow-md hover:bg-gray-100 transition-colors"
                aria-label="Schließen"
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>

              {/* Image gallery */}
              {hasImages && (
                <ImageCarousel
                  images={event.images ?? []}
                  title={event.title}
                  className="h-56 sm:h-72 shrink-0 rounded-t-2xl sm:rounded-t-2xl"
                />
              )}

              {/* Content */}
              <div className="p-5 sm:p-8 space-y-6">
                {/* Header */}
                <div className="space-y-2">
                  <Badge variant={config.variant}>{config.label}</Badge>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                    {event.title}
                  </h2>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600 mt-1">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {formatDate(event.date)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-gray-400" />
                      {event.time} Uhr
                    </span>
                  </div>
                </div>

                {/* Description */}
                {event.description && (
                  <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
                    <p>{event.description}</p>
                  </div>
                )}

                {/* Maps section */}
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-gray-900">
                    Lageplan
                  </h3>
                  <div
                    className={`grid gap-4 ${
                      event.parking_location
                        ? "grid-cols-1 md:grid-cols-2"
                        : "grid-cols-1"
                    }`}
                  >
                    {/* Venue map */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <MapPin className="w-4 h-4 text-green-600" />
                        <span>Veranstaltungsort</span>
                      </div>
                      <div className="h-52 rounded-lg overflow-hidden border border-gray-200">
                        <LeafletMap
                          address={event.location}
                          label={event.location}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">{event.location}</p>
                        <button
                          onClick={() =>
                            copyToClipboard(event.location, setCopiedLocation)
                          }
                          className="ml-2 p-1 rounded hover:bg-gray-100 transition-colors"
                          title="In Zwischenablage kopieren"
                        >
                          {copiedLocation ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Parking map */}
                    {event.parking_location && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                          <Car className="w-4 h-4 text-blue-600" />
                          <span>Parkplatz</span>
                        </div>
                        <div className="h-52 rounded-lg overflow-hidden border border-gray-200">
                          <LeafletMap
                            address={event.parking_location}
                            label={event.parking_location}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500">
                            {event.parking_location}
                          </p>
                          <button
                            onClick={() =>
                              copyToClipboard(
                                event.parking_location || "",
                                setCopiedParking
                              )
                            }
                            className="ml-2 p-1 rounded hover:bg-gray-100 transition-colors"
                            title="In Zwischenablage kopieren"
                          >
                            {copiedParking ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info blocks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoBlock
                    icon={<Euro className="w-4 h-4 text-amber-600" />}
                    label="Kosten"
                    value={formatEventPrice(event)}
                  />
                  {event.dress_code && (
                    <InfoBlock
                      icon={<Shirt className="w-4 h-4 text-purple-600" />}
                      label="Ausrüstung / Kleidung"
                      value={event.dress_code}
                    />
                  )}
                </div>

                {/* Availability */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      Verfügbarkeit
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500">Belegung</span>
                    <span
                      className={`font-medium ${
                        isFull ? "text-red-600" : "text-gray-700"
                      }`}
                    >
                      {isFull ? "Ausgebucht" : `${bookedPercentage}% vergeben`}
                    </span>
                  </div>
                  <Progress
                    value={percentage}
                    indicatorClassName={
                      isFull
                        ? "bg-red-500"
                        : progressColors[event.category]
                    }
                  />
                  {!isFull ? (
                    <p className="text-xs text-green-700 font-medium">
                      Es sind noch Plätze verfügbar
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700 font-medium">
                      Dieses Event ist ausgebucht. Trage dich in die Warteliste
                      ein – wir benachrichtigen dich, sobald ein Platz frei wird.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    className="flex-1 h-12 text-base"
                    variant={isFull ? "secondary" : "default"}
                    onClick={() => {
                      onClose();
                      onRegister(event);
                    }}
                  >
                    {isFull ? "In die Warteliste einschreiben" : "Jetzt anmelden"}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12"
                    onClick={handleShare}
                  >
                    {copiedShare ? (
                      <Check className="w-4 h-4 mr-2 text-green-600" />
                    ) : (
                      <Share2 className="w-4 h-4 mr-2" />
                    )}
                    {copiedShare ? "Link kopiert" : "Teilen"}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12"
                    onClick={onClose}
                  >
                    Schließen
                  </Button>
                </div>

                {/* Contact button */}
                {onContact && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 border-green-200 text-green-700 hover:bg-green-50 hover:border-green-400 hover:text-green-800 transition-colors"
                    onClick={() => {
                      onClose();
                      onContact(event.id);
                    }}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Noch Fragen? Schreib uns an! 🎯
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoBlock({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-gray-50 border border-gray-100 p-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">
          {label}
        </p>
        <p className="text-sm text-gray-800">{value}</p>
      </div>
    </div>
  );
}
