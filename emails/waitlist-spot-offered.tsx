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
  persons?: Array<{ firstName: string; lastName: string }>;
  /** z. B. "3 × 8,00 € = 24,00 €" – fehlt bei kostenlosen Events */
  priceLabel?: string;
}

export function WaitlistSpotOfferedEmail({
  firstName,
  eventTitle,
  eventDate,
  eventTime,
  eventLocation,
  statusUrl,
  persons,
  priceLabel,
}: Props) {
  return (
    <Html lang="de">
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>Ein Platz ist frei geworden!</Text>
          <Text style={text}>Assalamu Alaikum {firstName},</Text>
          <Text style={text}>
            gute Nachrichten: Für <strong>{eventTitle}</strong> ist ein Platz
            frei geworden, und du bist an der Reihe. Du stehst damit nicht mehr
            auf der Warteliste.
          </Text>
          <Section style={offerBox}>
            <Text style={offerText}>
              {priceLabel ? (
                <>
                  Sichere dir deinen Platz, indem du den Teilnahmebetrag von{" "}
                  <strong>{priceLabel}</strong> bezahlst.
                  {" "}Bei SEPA-Lastschrift bestätigen wir deine Teilnahme und
                  senden den QR-Code, sobald der Einzug gestartet wurde.
                </>
              ) : (
                <>Deine Anmeldung kann jetzt bestätigt werden.</>
              )}
            </Text>
          </Section>
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
            </Section>
          )}
          <Link href={statusUrl} style={button}>
            {priceLabel ? "Jetzt bezahlen" : "Status ansehen"}
          </Link>
          <Text style={hint}>
            Kannst du doch nicht teilnehmen? Dann storniere deine Anmeldung bitte
            über denselben Link – so rückt jemand anderes nach.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            Allsport Freunde 2026 e.V. – Gemeinsam sportlich in der Rhein-Main-Region
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WaitlistSpotOfferedEmail;

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

const offerBox: React.CSSProperties = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
  borderLeft: "4px solid #16a34a",
};

const offerText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#166534",
  margin: "0",
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

const button: React.CSSProperties = {
  backgroundColor: "#16a34a",
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

const hint: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
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
