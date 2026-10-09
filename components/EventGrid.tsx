"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import EventCard from "./EventCard";

// The modals (and framer-motion with them) are only needed after a click.
// Loading them after hydration keeps them off the critical rendering path.
const RegistrationModal = dynamic(() => import("./RegistrationModal"), { ssr: false });
const EventDetailModal = dynamic(() => import("./EventDetailModal"), { ssr: false });
const ContactFormModal = dynamic(() => import("./ContactFormModal"), { ssr: false });
import type { EventWithRegistrations } from "@/lib/types";
import { CATEGORY_CONFIG } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { CalendarPlus, MessageSquare } from "lucide-react";

const categories = [
  { key: "alle", label: "Alle" },
  ...Object.entries(CATEGORY_CONFIG).map(([key, c]) => ({ key, label: c.label })),
];

/** Placeholder shaped like an EventCard, shown while the list loads. */
function EventCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-6 motion-safe:animate-pulse">
      <div className="h-5 w-20 rounded-full bg-neutral-100" />
      <div className="mt-4 h-5 w-3/4 rounded bg-neutral-200" />
      <div className="mt-2 h-4 w-full rounded bg-neutral-100" />
      <div className="mt-6 h-4 w-1/2 rounded bg-neutral-100" />
      <div className="mt-2 h-4 w-1/3 rounded bg-neutral-100" />
      <div className="mt-6 h-1 w-2/5 rounded-full bg-neutral-200" />
      <div className="mt-8 flex gap-2">
        <div className="h-10 flex-1 rounded-lg bg-neutral-100" />
        <div className="h-10 flex-1 rounded-lg bg-neutral-200" />
      </div>
    </div>
  );
}

export default function EventGrid() {
  const [events, setEvents] = useState<EventWithRegistrations[]>([]);
  const [filter, setFilter] = useState("alle");

  // Registration modal state
  const [selectedEvent, setSelectedEvent] = useState<EventWithRegistrations | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Detail modal state
  const [detailEvent, setDetailEvent] = useState<EventWithRegistrations | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Contact modal state
  const [contactOpen, setContactOpen] = useState(false);
  const [contactEventId, setContactEventId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setEvents(data);
      setError(null);
    } catch {
      setError("Events konnten nicht geladen werden. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const filteredEvents =
    filter === "alle"
      ? events
      : events.filter((e) => e.category === filter);

  const handleRegister = (event: EventWithRegistrations) => {
    setSelectedEvent(event);
    setModalOpen(true);
  };

  const handleShowDetails = (event: EventWithRegistrations) => {
    setDetailEvent(event);
    setDetailOpen(true);
  };

  const handleRegistrationSuccess = () => {
    fetchEvents();
  };

  const handleContact = (eventId?: number) => {
    setContactEventId(eventId ?? null);
    setContactOpen(true);
  };

  const noEventsAtAll = !loading && !error && events.length === 0;

  return (
    <section id="events" className="bg-neutral-50 pb-16 pt-12 md:pb-24 md:pt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-display text-4xl font-bold uppercase leading-none tracking-tight text-navy-700 md:text-5xl">
          Kommende Events
        </h2>
        <p className="mt-4 max-w-[80ch] text-base text-neutral-600 md:text-lg">
          Melde dich für unsere nächsten Veranstaltungen an. Die Plätze sind begrenzt!
        </p>

        {!noEventsAtAll && (
          <div role="group" aria-label="Nach Sportart filtern" className="mt-6 flex flex-wrap gap-2">
            {categories.map((cat) => {
              const active = filter === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(cat.key)}
                  className={cn(
                    "h-10 cursor-pointer rounded-full border px-5 text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    active
                      ? "border-navy-700 bg-navy-700 text-white"
                      : "border-neutral-300 bg-white text-neutral-700 hover:border-navy-400 hover:text-navy-700"
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          {loading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              <span className="sr-only">Events werden geladen</span>
              {[0, 1, 2].map((i) => (
                <EventCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-danger-100 bg-white px-6 py-12 text-center">
              <p className="mb-4 text-danger-600">{error}</p>
              <Button onClick={fetchEvents} variant="outline" className="text-navy-700">
                Erneut versuchen
              </Button>
            </div>
          ) : noEventsAtAll ? (
            <div className="flex flex-col items-start gap-5 rounded-2xl border border-neutral-200 bg-white p-8 sm:flex-row sm:items-center md:p-10">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                <CalendarPlus className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-navy-700">Gerade keine Events geplant</h3>
                <p className="mt-1 max-w-[56ch] text-neutral-600">
                  Neue Termine erscheinen hier. Du hast eine Frage oder eine Idee für ein Event? Schreib uns.
                </p>
              </div>
              <Button onClick={() => handleContact()} className="h-11 px-6">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Kontakt aufnehmen
              </Button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-12 text-center">
              <p className="text-neutral-600">Keine Events in dieser Kategorie gefunden.</p>
              <Button variant="outline" className="mt-4 text-navy-700" onClick={() => setFilter("alle")}>
                Alle Events anzeigen
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onRegister={handleRegister}
                  onShowDetails={handleShowDetails}
                />
              ))}
            </div>
          )}
        </div>

        {/* Contact row. Hidden while the empty state already offers it. */}
        {!noEventsAtAll && !loading && (
          <div className="mt-12 flex flex-col gap-4 border-t border-neutral-200 pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-neutral-600">Fragen oder Anmerkungen? Wir helfen gern weiter.</p>
            <Button type="button" variant="outline" className="h-11 px-6 text-navy-700" onClick={() => handleContact()}>
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Kontakt aufnehmen
            </Button>
          </div>
        )}

        <RegistrationModal
          event={selectedEvent}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onSuccess={handleRegistrationSuccess}
        />

        <EventDetailModal
          event={detailEvent}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onRegister={handleRegister}
          onContact={handleContact}
        />

        <ContactFormModal
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          eventId={contactEventId}
          events={events}
        />
      </div>
    </section>
  );
}
