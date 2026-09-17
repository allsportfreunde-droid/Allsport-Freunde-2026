"use client";

import { useEffect, useState } from "react";

/**
 * Die stille Bot-Prüfung jedes öffentlichen Formulars: ein Feld, das kein
 * Mensch sieht, und der Zeitpunkt, an dem das Formular erschien.
 *
 * Die Falle muss zwei Seiten aushalten. Ein Automat, der das HTML ausliest und
 * alle Felder mitschickt, soll hineintappen. Der Browser eines echten
 * Teilnehmers darf sie dagegen niemals ausfüllen – sonst wird eine völlig
 * normale Anmeldung mit "Ungültige Anfrage" abgewiesen, und der Absender hat
 * keine Möglichkeit, das zu verstehen oder zu umgehen.
 *
 * Genau das ist passiert: Chromes Autofill hat gespeicherte Daten über das
 * Formular verteilt und dabei auch die Falle gefüllt. Dagegen stehen hier
 * jetzt vier Dinge, die sich gegenseitig absichern:
 *
 *   display:none  – nicht dargestellte Felder füllt keine Autofill-Funktion
 *   readOnly      – schreibgeschützte Felder überspringt sie ebenfalls;
 *                   abgeschickt wird das Feld trotzdem, anders als disabled
 *   data-*-ignore – die ausdrückliche Bitte an 1Password, LastPass, Bitwarden
 *                   und Dashlane, dieses Feld in Ruhe zu lassen
 *   autoComplete  – der Standardweg, den Chrome bei Adressfeldern zwar gern
 *                   übergeht, der aber nichts kostet
 *
 * Ein Automat, der das Formular nie darstellt, sieht von alldem nichts und
 * schickt das Feld weiterhin gefüllt mit.
 */
export default function HoneypotFields() {
  const [ts, setTs] = useState("");

  useEffect(() => {
    setTs(Date.now().toString());
  }, []);

  return (
    <div style={{ display: "none" }} aria-hidden="true">
      <input
        type="text"
        name="_hp"
        tabIndex={-1}
        readOnly
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
      />
      <input
        type="hidden"
        name="_ts"
        value={ts}
        tabIndex={-1}
        autoComplete="off"
        readOnly
      />
    </div>
  );
}
