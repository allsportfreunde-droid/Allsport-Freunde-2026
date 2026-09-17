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
  paymentArrivedAfterCancellation?: boolean;
  eventTitle: string;
  eventDate: string;
  /** E-Mail-Adresse der Anmeldung */
  participantEmail: string;
  /** Namen der abgemeldeten Personen */
  personNames: string[];
  /** Fertig formatierter Betrag, z. B. "8,00 €" */
  amountLabel: string;
  /** Personen, die weiterhin angemeldet bleiben */
  remainingPersons: number;
  /** Link zur Zahlung im Stripe-Dashboard (null = keine Stripe-Zahlung) */
  stripeUrl: string | null;
  /** Die Status-Seite des Teilnehmers – zeigt genau das, was er selbst sieht */
  statusUrl: string;
  /** Link zur Anmeldungsliste im Admin-Panel */
  adminUrl: string;
}

export function RefundDueAdminEmail({
  eventTitle,
  eventDate,
  participantEmail,
  personNames,
  amountLabel,
  remainingPersons,
  stripeUrl,
  statusUrl,
  adminUrl,
  paymentArrivedAfterCancellation = false,
}: Props) {
  return (
    <Html lang="de">
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>Erstattung fällig: {amountLabel}</Text>
          <Text style={text}>
            {paymentArrivedAfterCancellation
              ? "Die Zahlung ist nach einer fristgerechten Stornierung eingegangen. Bitte die fällige Erstattung von Hand im Stripe-Dashboard bearbeiten."
              : "Eine bezahlte Anmeldung wurde innerhalb der Frist storniert. Der Teilnehmer hat die Erstattung bereits schriftlich zugesagt bekommen – überwiesen wird sie von Hand im Stripe-Dashboard."}
          </Text>
          <Section style={amountBox}>
            <Text style={amountText}>{amountLabel}</Text>
            <Text style={amountNote}>
              {personNames.length === 1
                ? `für ${personNames[0]}`
                : `für ${personNames.length} Personen: ${personNames.join(", ")}`}
            </Text>
          </Section>
          <Section style={infoBox}>
            <Text style={infoText}>
              <strong>Event:</strong> {eventTitle}
            </Text>
            <Text style={infoText}>
              <strong>Datum:</strong> {eventDate}
            </Text>
            <Text style={infoText}>
              <strong>Anmeldung:</strong> {participantEmail}
            </Text>
            <Text style={infoText}>
              <strong>Bleibt angemeldet:</strong>{" "}
              {remainingPersons === 0
                ? "niemand – die Anmeldung ist vollständig storniert"
                : remainingPersons === 1
                  ? "1 Person"
                  : `${remainingPersons} Personen`}
            </Text>
          </Section>
          {stripeUrl ? (
            <>
              <Link href={stripeUrl} style={button}>
                Zahlung in Stripe öffnen
              </Link>
              <Text style={hint}>
                Dort auf „Refund“ und {amountLabel} als Teilbetrag eintragen.
              </Text>
            </>
          ) : (
            <Text style={text}>
              Zu dieser Anmeldung ist keine Stripe-Zahlung hinterlegt – bitte
              von Hand prüfen, wie bezahlt wurde.
            </Text>
          )}
          <Section style={linkList}>
            <Text style={linkRow}>
              <Link href={adminUrl} style={secondaryLink}>
                Anmeldungen im Admin-Panel
              </Link>
            </Text>
            <Text style={linkRow}>
              <Link href={statusUrl} style={secondaryLink}>
                Status-Seite des Teilnehmers
              </Link>
            </Text>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            Allsport Freunde 2026 – Admin-Benachrichtigung
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default RefundDueAdminEmail;

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
  color: "#b45309",
  marginBottom: "16px",
};

const text: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#333333",
};

const amountBox: React.CSSProperties = {
  backgroundColor: "#fffbeb",
  border: "1px solid #fcd34d",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
};

const amountText: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: "bold",
  color: "#b45309",
  margin: 0,
};

const amountNote: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#92400e",
  margin: "4px 0 0",
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
  backgroundColor: "#635bff",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "bold",
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center" as const,
  margin: "16px 0 8px",
};

const linkList: React.CSSProperties = {
  margin: "8px 0 0",
};

const linkRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  margin: "2px 0",
};

const secondaryLink: React.CSSProperties = {
  color: "#4b5563",
  textDecoration: "underline",
};

const hint: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "0 0 8px",
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
