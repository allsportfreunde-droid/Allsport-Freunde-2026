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
  approved: boolean;
  firstName: string;
  /** Name der Person, für die der Antrag gestellt wurde (kann von der Empfängerin abweichen). */
  personName: string;
  percent: number;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  statusUrl: string;
  note?: string;
}

/**
 * Ergebnis eines Ermäßigungsantrags. Nennt bewusst nur den Satz, nie den
 * Grund (Schwerbehinderung, Sozialleistung) – Mails werden weitergeleitet,
 * am Handy mitgelesen und liegen in fremden Postfächern.
 */
export function DiscountDecisionEmail({
  approved,
  firstName,
  personName,
  percent,
  eventTitle,
  eventDate,
  eventTime,
  eventLocation,
  statusUrl,
  note,
}: Props) {
  return (
    <Html lang="de">
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={{ ...heading, color: approved ? "#16a34a" : "#b45309" }}>
            {approved ? "Ermäßigung bestätigt" : "Ermäßigung nicht bestätigt"}
          </Text>
          <Text style={text}>Assalamu Alaikum {firstName},</Text>
          {approved ? (
            <Text style={text}>
              die beantragte Ermäßigung von <strong>{percent} %</strong> für <strong>{personName}</strong> ist
              bestätigt. Du kannst die Anmeldung jetzt zum ermäßigten Preis bezahlen.
            </Text>
          ) : (
            <Text style={text}>
              die beantragte Ermäßigung von {percent} % für <strong>{personName}</strong> konnten wir leider
              nicht bestätigen. Für diese Person gilt der reguläre Preis. Du kannst die Anmeldung jetzt bezahlen.
            </Text>
          )}
          {note && (
            <Section style={noteBox}>
              <Text style={noteLabel}>Hinweis vom Team:</Text>
              <Text style={noteText}>{note}</Text>
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
          <Link href={statusUrl} style={button}>
            Zur Anmeldung und Zahlung
          </Link>
          <Text style={small}>
            Deinen Nachweis haben wir nach der Prüfung gelöscht.
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

export default DiscountDecisionEmail;

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
  marginBottom: "16px",
};

const text: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#333333",
};

const small: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
};

const noteBox: React.CSSProperties = {
  backgroundColor: "#fffbeb",
  borderLeft: "4px solid #d97706",
  borderRadius: "4px",
  padding: "12px 16px",
  margin: "16px 0",
};

const noteLabel: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#92400e",
  margin: "0 0 4px",
};

const noteText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#333333",
  margin: "0",
};

const infoBox: React.CSSProperties = {
  backgroundColor: "#f6f6f6",
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

const hr: React.CSSProperties = {
  borderColor: "#e6ebf1",
  margin: "32px 0 16px",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#8898aa",
  lineHeight: "20px",
};
