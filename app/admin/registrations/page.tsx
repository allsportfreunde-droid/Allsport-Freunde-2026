"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import RegistrationTable from "@/components/admin/RegistrationTable";
import { Button } from "@/components/ui/button";
import { History, CalendarClock } from "lucide-react";

function RegistrationsView() {
  // Aus einer Admin-E-Mail kommt man mit ?suche=<E-Mail> hierher. Die
  // Anmeldung, um die es geht, steht dann sofort da. Gesucht wird dabei über
  // alle Events, denn storniert wird auch noch, wenn das Event schon läuft –
  // die Voreinstellung "nur kommende" würde die Anmeldung ausblenden.
  const gesucht = useSearchParams().get("suche")?.trim() ?? "";
  const [alle, setShowAll] = useState(gesucht !== "");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Anmeldungen</h1>
          <p className="text-muted-foreground mt-1">
            {alle
              ? "Alle Anmeldungen über alle Events"
              : "Anmeldungen für kommende Events"}
          </p>
        </div>
        {alle ? (
          <Button variant="outline" size="sm" onClick={() => setShowAll(false)}>
            <CalendarClock className="w-4 h-4 mr-2" />
            Nur kommende Events
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
            <History className="w-4 h-4 mr-2" />
            Alle Anmeldungen ansehen
          </Button>
        )}
      </div>
      <RegistrationTable upcomingOnly={!alle} initialSearch={gesucht} />
    </div>
  );
}

export default function RegistrationsPage() {
  // useSearchParams braucht eine Suspense-Grenze, sonst fällt die ganze Seite
  // beim Bauen ins clientseitige Rendern.
  return (
    <Suspense fallback={null}>
      <RegistrationsView />
    </Suspense>
  );
}
