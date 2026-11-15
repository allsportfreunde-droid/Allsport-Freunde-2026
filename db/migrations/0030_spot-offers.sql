-- Das Team bietet einer offenen Anmeldung gezielt einen Platz an. Sie darf
-- dann bezahlen, auch wenn das Event ausgebucht ist (gewollte Überbuchung).
-- NULL = kein Angebot. Das Angebot läuft nicht ab und lässt sich zurückziehen,
-- solange keine Zahlung läuft (lib/db/waitlist.ts).
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS spot_offered_at TIMESTAMPTZ;
