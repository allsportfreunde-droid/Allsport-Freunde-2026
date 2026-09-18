"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import EventDetailModal from "@/components/EventDetailModal";
import RegistrationModal from "@/components/RegistrationModal";
import ContactFormModal from "@/components/ContactFormModal";
import type { EventWithRegistrations } from "@/lib/types";

/**
 * Geteilte Event-Seite: zeigt dasselbe Detail-Fenster wie die Startseite,
 * hier aber dauerhaft geöffnet. Schließen führt zurück zur Event-Übersicht.
 */
export default function EventSharePage({ event }: { event: EventWithRegistrations }) {
  const router = useRouter();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Das Detail-Fenster ruft onClose() unmittelbar vor onRegister()/onContact()
  // auf. Ein Schließen ist deshalb nur dann wirklich ein Verlassen der Seite,
  // wenn im selben Tick kein Folge-Fenster geöffnet wird.
  const handleClose = () => {
    leaveTimer.current = setTimeout(() => router.push("/#events"), 0);
  };

  const stayOnPage = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <EventDetailModal
        event={event}
        open={!registerOpen && !contactOpen}
        onClose={handleClose}
        onRegister={() => {
          stayOnPage();
          setRegisterOpen(true);
        }}
        onContact={() => {
          stayOnPage();
          setContactOpen(true);
        }}
      />

      <RegistrationModal
        event={event}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onSuccess={() => router.refresh()}
      />

      <ContactFormModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        eventId={event.id}
        events={[event]}
      />
    </main>
  );
}
