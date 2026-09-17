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
  /** Namen der jetzt abgemeldeten Personen (leer = ganze Anmeldung) */
  cancelledPersons?: string[];
  /** Personen, die weiterhin angemeldet bleiben (>0 = Teilstornierung) */
  remainingPersons?: number;
  /** Fertig formatierter Erstattungsbetrag, z. B. "8,00 €" (null = keine Erstattung) */
  refundLabel?: string | null;
}

export function RegistrationCancelledEmail({
  firstName,
  eventTitle,
  eventDate,
  eventTime,
  eventLocation,
  statusUrl,
  cancelledPersons,
  remainingPersons = 0,
  refundLabel,
}: Props) {
  // Bleiben Personen angemeldet, ist nur ein Teil storniert. Dann darf die
  // E-Mail nicht "deine Anmeldung wurde storniert" sagen – der Rest der
  // Anmeldung steht weiterhin, und genau das muss unmissverständlich sein.
  const partial = remainingPersons > 0;
  const names = cancelledPersons?.filter(Boolean) ?? [];

  return (
    <Html lang="de">
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>
            {partial ? "Abmeldung bestätigt" : "Anmeldung storniert"}
          </Text>
          <Text style={text}>
            Assalamu Alaikum {firstName},
          </Text>
          {partial ? (
            <Text style={text}>
              {names.length === 1
                ? `${names[0]} wurde von `
                : `${names.join(", ")} wurden von `}
              <strong>{eventTitle}</strong> abgemeldet. Die übrigen{" "}
              {remainingPersons === 1 ? "Person bleibt" : `${remainingPersons} Personen bleiben`}{" "}
              weiterhin angemeldet.
            </Text>
          ) : (
            <Text style={text}>
              deine Anmeldung zu <strong>{eventTitle}</strong> wurde erfolgreich storniert.
            </Text>
          )}
          {refundLabel && (
            <Section style={refundBox}>
              <Text style={refundHeading}>Erstattung: {refundLabel}</Text>
              <Text style={refundText}>
                {partial && names.length > 0
                  ? `Erstattet wird der Anteil für ${
                      names.length === 1 ? names[0] : `${names.length} Personen`
                    }.`
                  : "Erstattet wird der vollständige Betrag deiner Anmeldung."}{" "}
                Das Geld geht auf dem Weg zurück, mit dem du bezahlt hast. Bis es
                auf deinem Konto sichtbar ist, können einige Werktage vergehen.
              </Text>
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
          <Text style={text}>
            {partial
              ? "Deine Anmeldung kannst du hier einsehen:"
              : "Du kannst den Status deiner Stornierung hier einsehen:"}
          </Text>
          <Link href={statusUrl} style={button}>
            Status ansehen
          </Link>
          <Hr style={hr} />
          <Text style={footer}>
            Allsport Freunde 2026 e.V. – Gemeinsam sportlich in der Rhein-Main-Region
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default RegistrationCancelledEmail;

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
  color: "#6b7280",
  marginBottom: "16px",
};

const text: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#333333",
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

const refundBox: React.CSSProperties = {
  backgroundColor: "#ecfdf5",
  border: "1px solid #a7f3d0",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
};

const refundHeading: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: "#065f46",
  margin: "0 0 4px",
};

const refundText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#065f46",
  margin: 0,
};

const button: React.CSSProperties = {
  backgroundColor: "#6b7280",
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
