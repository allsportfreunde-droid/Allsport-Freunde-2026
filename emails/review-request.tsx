import { Html, Head, Body, Container, Section, Text, Link, Hr } from "@react-email/components";
import * as React from "react";

interface Props {
  firstName: string;
  eventTitle: string;
  eventDate: string;
  reviewUrl: string;
  deadlineDate: string;
  isReminder: boolean;
}

export function ReviewRequestEmail({ firstName, eventTitle, eventDate, reviewUrl, deadlineDate, isReminder }: Props) {
  return (
    <Html lang="de">
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>{isReminder ? "Kurze Erinnerung ⭐" : "Wie war's? ⭐"}</Text>
          <Text style={text}>Assalamu Alaikum {firstName},</Text>
          <Text style={text}>
            danke, dass du am {eventDate} bei <strong>{eventTitle}</strong> dabei warst!
            {isReminder ? " Wir erinnern dich kurz: Bewerte das Event mit einem Klick." : " Bewerte das Event mit einem Klick."}
          </Text>
          <Section style={starRow}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <Link key={rating} href={`${reviewUrl}?rating=${rating}`} style={star} aria-label={`${rating} ${rating === 1 ? "Stern" : "Sterne"}`}>
                ★
              </Link>
            ))}
          </Section>
          <Text style={legend}>1 = gar nicht · 5 = super</Text>
          <Link href={reviewUrl} style={primaryButton}>Bewertung abgeben</Link>
          <Text style={note}>Du kannst bis {deadlineDate} bewerten. Dauert keine Minute.</Text>
          <Text style={text}>Jazakallahu Khairan! 🤍</Text>
          <Hr style={hr} />
          <Text style={footer}>
            Allsport Freunde 2026 e.V. – Gemeinsam sportlich in der Rhein-Main-Region
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ReviewRequestEmail;

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
  color: "#d97706",
  marginBottom: "16px",
};

const text: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#333333",
};

const starRow: React.CSSProperties = { margin: "20px 0 0" };

const star: React.CSSProperties = {
  color: "#f59e0b",
  fontSize: "36px",
  lineHeight: "48px",
  textDecoration: "none",
  display: "inline-block",
  padding: "0 8px",
};

const legend: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  margin: "4px 0 20px",
};

const primaryButton: React.CSSProperties = {
  backgroundColor: "#16a34a",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "bold",
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center",
  margin: "8px 0",
};

const note: React.CSSProperties = { fontSize: "14px", lineHeight: "22px", color: "#6b7280" };

const hr: React.CSSProperties = { borderColor: "#e6ebf1", margin: "32px 0 16px" };

const footer: React.CSSProperties = { fontSize: "12px", color: "#8898aa", lineHeight: "20px" };
