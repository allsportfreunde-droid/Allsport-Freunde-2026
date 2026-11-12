import type Stripe from "stripe";

/**
 * Schließt offene Stripe-Bezahlfenster, so gut es geht. Wer im selben Moment
 * abschließt, zahlt trotzdem – der Webhook verbucht das wie gewohnt. Ein
 * Fehler bei einer Session (gerade abgeschlossen, schon abgelaufen) hält die
 * übrigen nicht auf und wird nur protokolliert.
 */
export async function expireOpenCheckouts(stripe: Stripe, sessionIds: Iterable<string>): Promise<void> {
  for (const sessionId of sessionIds) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status === "open") await stripe.checkout.sessions.expire(sessionId);
    } catch (error) {
      console.warn(`Bezahlfenster ${sessionId} konnte nicht geschlossen werden:`, error);
    }
  }
}
