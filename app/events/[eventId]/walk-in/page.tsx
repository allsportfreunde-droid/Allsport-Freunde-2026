import { getEvent } from "@/lib/db";
import { verifyWalkInToken } from "@/lib/checkin";
import { WalkInForm } from "./WalkInForm";
import { AlertTriangle, Clock } from "lucide-react";

function formatEventDate(dateStr: string, timeStr: string): string {
  const date = new Date(`${dateStr}T${timeStr}`);
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }) + ` um ${timeStr} Uhr`;
}

function ErrorScreen({
  title,
  message,
  expired,
}: {
  title: string;
  message: string;
  expired?: boolean;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
          {expired ? (
            <Clock className="w-7 h-7 text-red-500" />
          ) : (
            <AlertTriangle className="w-7 h-7 text-red-500" />
          )}
        </div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
        {expired && (
          <p className="text-xs text-gray-400">
            Bitte wende dich an den Organisator für einen neuen QR-Code.
          </p>
        )}
      </div>
    </div>
  );
}

export default async function WalkInPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { eventId: eventIdStr } = await params;
  const { token } = await searchParams;

  const eventId = Number(eventIdStr);
  if (isNaN(eventId)) {
    return (
      <ErrorScreen
        title="Ungültiger Link"
        message="Dieser Link ist ungültig. Bitte wende dich an den Organisator."
      />
    );
  }

  // Validate token
  if (!token) {
    return (
      <ErrorScreen
        title="Ungültiger Link"
        message="Dieser Link enthält keinen gültigen Token. Bitte scanne den QR-Code erneut."
      />
    );
  }

  const tokenPayload = verifyWalkInToken(token);
  if (!tokenPayload) {
    return (
      <ErrorScreen
        title="QR-Code abgelaufen"
        message="Dieser QR-Code ist abgelaufen oder ungültig."
        expired
      />
    );
  }

  if (tokenPayload.eventId !== eventId) {
    return (
      <ErrorScreen
        title="Ungültiger QR-Code"
        message="Dieser QR-Code gehört nicht zu diesem Event."
      />
    );
  }

  // Fetch event info
  const event = await getEvent(eventId);
  if (!event || event.status !== "published") {
    return (
      <ErrorScreen
        title="Event nicht verfügbar"
        message="Dieses Event ist nicht mehr zur Anmeldung freigegeben."
      />
    );
  }

  const formattedDate = formatEventDate(event.date, event.time);

  return (
    <WalkInForm
      eventId={eventId}
      token={token}
      eventTitle={event.title}
      eventDate={formattedDate}
      eventLocation={event.location}
      maxPersons={event.max_per_email ?? 5}
      priceText={event.price}
      entryPrice={event.entry_price}
      childEntryPrice={event.child_entry_price}
      childPriceText={event.child_price}
    />
  );
}
