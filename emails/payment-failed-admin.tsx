import { Html, Head, Body, Container, Heading, Text, Link } from "@react-email/components";

export function PaymentFailedAdminEmail(data: {
  eventTitle: string; participantEmail: string; amountLabel: string;
  reason: string; adminUrl: string; stripeUrl: string | null;
}) {
  return <Html lang="de"><Head /><Body style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f9fc" }}>
    <Container style={{ backgroundColor: "#fff", padding: "24px" }}>
      <Heading>SEPA-Einzug fehlgeschlagen</Heading>
      <Text>Event: {data.eventTitle}</Text>
      <Text>Anmeldung: {data.participantEmail}</Text>
      <Text>Offener Einzug: {data.amountLabel}</Text>
      <Text>Grund: {data.reason}</Text>
      <Text>Eine bereits bestätigte Teilnahme und ihr QR-Code bleiben gültig.
        Bitte den offenen Betrag prüfen. Es wurde keine automatische Fehlermeldung an den Teilnehmer verschickt.</Text>
      <Text><Link href={data.adminUrl}>Anmeldung im Adminbereich</Link></Text>
      {data.stripeUrl && <Text><Link href={data.stripeUrl}>Zahlung bei Stripe prüfen</Link></Text>}
    </Container>
  </Body></Html>;
}
