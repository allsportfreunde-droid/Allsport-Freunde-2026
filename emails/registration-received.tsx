import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface Props {
  firstName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  statusUrl: string;
  /** z. B. "3 × 8,00 € = 24,00 €" – fehlt bei kostenlosen Events */
  priceLabel?: string;
  /** z. B. "15.09.2026 um 12:00 Uhr" */
  cancellationLabel?: string;
  persons?: Array<{ firstName: string; lastName: string }>;
}

export function RegistrationReceivedEmail({
  firstName,
  eventTitle,
  eventDate,
  eventTime,
  eventLocation,
  statusUrl,
  persons,
  priceLabel,
  cancellationLabel,
}: Props) {
  return (
    <Html lang="de">
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>Anmeldung eingegangen</Text>
          <Text style={text}>
            Assalamu Alaikum {firstName},
          </Text>
          <Text style={text}>
            vielen Dank für deine Anmeldung zu <strong>{eventTitle}</strong>!
            Dein Platz ist reserviert.
          </Text>
          <Text style={text}>
            {priceLabel
              ? "Damit deine Anmeldung verbindlich wird, fehlt nur noch der Teilnahmebetrag."
              : "Deine Anmeldung ist bei uns eingegangen und wird nun geprüft."}
          </Text>
          {priceLabel && (
            <Section style={payBox}>
              <Text style={payHeading}>Offener Teilnahmebetrag</Text>
              <Text style={payAmount}>{priceLabel}</Text>
              <Text style={payText}>
                Nach erfolgreicher Zahlung erhältst du deine Bestätigung mit
                Check-In QR-Code per E-Mail. Bei SEPA-Lastschrift bestätigen wir
                deine Teilnahme bereits, sobald der Einzug gestartet wurde.
                {cancellationLabel
                  ? ` Nach der Zahlung oder dem Start des SEPA-Einzugs kannst du bis ${cancellationLabel} stornieren.`
                  : ""}
              </Text>
              <Link href={statusUrl} style={payButton}>
                Jetzt bezahlen
              </Link>
            </Section>
          )}
          <Section style={infoBox}>
            <Text style={infoText}>
              <strong>Event:</strong> {eventTitle}
            </Text>
            <Text style={infoText}>
              <strong>Datum:</strong> {eventDate} um {eventTime} Uhr
            </Text>
            <Text style={infoText}>
              <strong>Ort:</strong> {eventLocation}
            </Text>
          </Section>
          {persons && persons.length > 0 && (
            <Section style={personsBox}>
              <Text style={personsHeading}>
                Angemeldete Personen ({persons.length}):
              </Text>
              {persons.map((p, i) => (
                <Text key={i} style={personItem}>
                  • {p.firstName} {p.lastName}
                </Text>
              ))}
              {persons.length > 1 && (
                <Text style={personsNote}>
                  Alle Personen werden beim Check-In mit einem QR-Code abgehakt.
                </Text>
              )}
            </Section>
          )}
          <Text style={text}>
            Du kannst den Status deiner Anmeldung jederzeit hier einsehen:
          </Text>
          <Link href={statusUrl} style={button}>
            Status prüfen
          </Link>
          <Section style={cancelBox}>
            <Text style={cancelHeading}>Kannst du doch nicht teilnehmen?</Text>
            <Text style={cancelText}>
              Bitte sag rechtzeitig ab, damit wir den Platz weitergeben können.
              Einzelne Personen können ebenfalls aus der Anmeldung entfernt werden.
            </Text>
            <Link href={statusUrl} style={cancelButton}>
              Anmeldung stornieren / Personen entfernen
            </Link>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            Allsport Freunde 2026 e.V. – Gemeinsam sportlich in der Rhein-Main-Region
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default RegistrationReceivedEmail;

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
  borderRadius: "8px",
};

const heading: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#1a1a1a",
  marginBottom: "16px",
};

const text: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#333333",
};

const infoBox: React.CSSProperties = {
  backgroundColor: "#f0f7ff",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
};

const infoText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#333333",
  margin: "4px 0",
};

const button: React.CSSProperties = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "bold",
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center" as const,
  margin: "16px 0",
};

const cancelBox: React.CSSProperties = {
  backgroundColor: "#fff7ed",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "24px 0 8px",
  borderLeft: "4px solid #f97316",
};

const cancelHeading: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#9a3412",
  margin: "0 0 6px 0",
};

const cancelText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#7c3a1e",
  margin: "0 0 12px 0",
};

const cancelButton: React.CSSProperties = {
  backgroundColor: "#dc2626",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "bold",
  padding: "10px 20px",
  textDecoration: "none",
  textAlign: "center" as const,
};

const payBox: React.CSSProperties = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "24px 0 8px",
  borderLeft: "4px solid #16a34a",
};

const payHeading: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#166534",
  margin: "0 0 4px 0",
};

const payAmount: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "bold",
  color: "#14532d",
  margin: "0 0 6px 0",
};

const payText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#166534",
  margin: "0 0 12px 0",
};

const payButton: React.CSSProperties = {
  backgroundColor: "#16a34a",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "bold",
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center" as const,
};

const hr: React.CSSProperties = {
  borderColor: "#e6ebf1",
  margin: "32px 0 16px",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#8898aa",
  lineHeight: "20px",
};

const personsBox: React.CSSProperties = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  padding: "12px 20px",
  margin: "16px 0",
};

const personsHeading: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#166534",
  margin: "0 0 8px 0",
};

const personItem: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#333333",
  margin: "2px 0",
};

const personsNote: React.CSSProperties = {
  fontSize: "12px",
  color: "#4b7c5f",
  marginTop: "8px",
  fontStyle: "italic",
};
