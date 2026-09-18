import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Teilnahmebedingungen – Allsport Freunde 2026 e.V.",
  description:
    "Verbindliche Teilnahmebedingungen für Veranstaltungen und Sportangebote des Allsport Freunde 2026 e.V.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function TeilnahmebedingungenPage() {
  return (
    <>
      <main className="min-h-screen bg-white">
        {/* Page header */}
        <div className="bg-gray-900 text-white py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Zurück zur Startseite
            </Link>
            <h1 className="text-4xl font-bold mb-2">Teilnahmebedingungen</h1>
            <p className="text-gray-400 mt-2">
              Verbindliche Bedingungen für die Teilnahme an Veranstaltungen –
              Stand: Mai 2025
            </p>
            <div className="w-16 h-1 bg-green-500 rounded-full mt-6" />
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 py-12 text-gray-700">
          <p className="text-sm leading-relaxed mb-10">
            Mit der Anmeldung zu einer Veranstaltung des Vereins Allsport Freunde
            2026 e.V. erkennen Teilnehmende diese Teilnahmebedingungen
            verbindlich an.
          </p>

          <Section title="1. Geltungsbereich">
            <div className="text-sm leading-relaxed space-y-3">
              <p>
                Diese Teilnahmebedingungen gelten für alle Veranstaltungen und
                Sportangebote des Vereins Allsport Freunde 2026 e.V.,
                einschließlich:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Schwimmen</li>
                <li>Hallensport</li>
                <li>Fußball</li>
                <li>Fitness</li>
              </ul>
            </div>
          </Section>

          <Section title="2. Anmeldung & Teilnahme">
            <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
              <li>
                Die Anmeldung zu einer Veranstaltung erfolgt ausschließlich über
                das Anmeldeformular auf der Vereinswebsite.
              </li>
              <li>
                Bei Veranstaltungen mit Unkostenbeitrag wird die Anmeldung mit
                der Zahlung des Teilnahmebetrags verbindlich. Die Bestätigung
                erfolgt anschließend per E-Mail zusammen mit dem Check-In
                QR-Code.
              </li>
              <li>
                Bei kostenlosen Veranstaltungen wird die Anmeldung durch eine
                Bestätigung des Vereins per E-Mail verbindlich.
              </li>
              <li>
                Ist eine Veranstaltung bereits ausgebucht, erfolgt die Anmeldung
                auf einer Warteliste. Solange kein Platz zugeteilt ist, besteht
                keine Zahlungsmöglichkeit und keine Zahlungspflicht. Wird ein
                Platz frei, werden Wartende per E-Mail benachrichtigt und können
                den Teilnahmebetrag dann zahlen.
              </li>
              <li>
                Spontane Teilnahmen ohne vorherige Anmeldung sind nicht möglich.
              </li>
              <li>
                Das Mindestalter für die Teilnahme wird je nach Veranstaltung in
                der jeweiligen Eventbeschreibung angegeben.
              </li>
              <li>
                Minderjährige dürfen nur mit dem ausdrücklichen Einverständnis
                eines Erziehungsberechtigten teilnehmen. Der Verein behält sich
                vor, dieses Einverständnis nachzufordern.
              </li>
            </ul>
          </Section>

          <Section title="3. Stornierung & Absage durch den Verein">
            <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
              <li>
                Teilnehmende können ihre Anmeldung bis <strong>24 Stunden vor
                Beginn</strong> der Veranstaltung selbst zurückziehen – entweder
                vollständig oder für einzelne angemeldete Personen.
              </li>
              <li>
                Für einzelne Veranstaltungen kann eine abweichende Stornofrist
                gelten. Die jeweils gültige Frist wird auf der Statusseite deiner
                Anmeldung angezeigt.
              </li>
              <li>
                Solange der Teilnahmebetrag noch nicht gezahlt wurde, kann die
                Anmeldung jederzeit zurückgezogen werden – die Stornofrist gilt
                erst ab dem Zeitpunkt der Zahlung.
              </li>
              <li>
                Nach Ablauf dieser Frist ist eine Stornierung über die Website
                nicht mehr möglich. Wende dich in diesem Fall bitte direkt an
                den Verein.
              </li>
              <li>
                Bereits gezahlte Teilnahmebeträge werden bei fristgerechter
                Stornierung erstattet.
              </li>
              <li>
                Der Verein behält sich vor, Veranstaltungen bei zu geringer
                Teilnehmerzahl, unvorhergesehenen Umständen oder höherer Gewalt
                abzusagen oder zu verschieben.
              </li>
              <li>
                Im Falle einer Absage werden alle angemeldeten Teilnehmenden per
                E-Mail informiert. Bereits gezahlte Teilnahmebeträge werden
                vollständig erstattet.
              </li>
            </ul>
          </Section>

          <Section title="4. Nicht-Erscheinen (No-Show)">
            <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
              <li>
                Die Anmeldung zu einer Veranstaltung ist verbindlich. Mit der
                Anmeldung zu einer Veranstaltung mit Unkostenbeitrag entsteht die
                Pflicht, diesen zu entrichten – bei ausgebuchten Veranstaltungen
                erst mit der Zuteilung eines Platzes.
              </li>
              <li>
                Erscheint eine angemeldete Person nicht zur Veranstaltung, ohne
                sich fristgerecht abgemeldet zu haben, bleibt der
                Teilnahmebetrag in voller Höhe fällig und wird entsprechend in
                Rechnung gestellt. Bereits gezahlte Beträge werden in diesem Fall
                nicht erstattet.
              </li>
              <li>
                Bei zweimaligem unentschuldigten Nicht-Erscheinen trotz
                bestehender Anmeldung wird die betroffene Person von der
                Anmeldung zu zukünftigen Veranstaltungen ausgeschlossen, bis die
                Angelegenheit geklärt ist.
              </li>
              <li>
                Eine Beschwerde gegen diesen Ausschluss ist ausschließlich
                schriftlich (per Post oder E-Mail an die Vereinsadresse)
                einzureichen.
              </li>
              <li>
                Über eingereichte Beschwerden und Ausnahmen entscheidet die
                Mitgliederversammlung. Deren Beschluss ist bindend.
              </li>
            </ul>
          </Section>

          <Section title="5. Haftungsausschluss & Verletzungsrisiko">
            <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
              <li>Die Teilnahme an sportlichen Aktivitäten erfolgt auf eigene Gefahr.</li>
              <li>
                Sportliche Betätigung ist mit einem inhärenten Verletzungsrisiko
                verbunden, das durch Aufwärmen, Anweisungen der Übungsleiter und
                eigenverantwortliches Verhalten minimiert werden kann.
              </li>
              <li>
                Der Verein haftet nicht für Schäden, die durch Eigenverschulden,
                Nichtbeachtung von Anweisungen oder unsportliches Verhalten
                entstehen.
              </li>
              <li>
                Teilnehmenden mit bekannten gesundheitlichen Einschränkungen
                wird empfohlen, vor der Teilnahme Rücksprache mit einem Arzt zu
                halten.
              </li>
              <li>
                Für mitgebrachte Wertgegenstände übernimmt der Verein keine
                Haftung.
              </li>
            </ul>
          </Section>

          <Section title="6. Verhaltensregeln & Hausordnung">
            <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
              <li>
                Ein respektvoller und fairer Umgang mit allen Teilnehmenden,
                Übungsleitern und Vereinspersonal ist selbstverständlich und
                wird erwartet.
              </li>
              <li>
                Anweisungen der Übungsleiter und des Vereinspersonals sind zu
                befolgen.
              </li>
              <li>
                Der Konsum von Alkohol und anderen berauschenden Mitteln vor und
                während der Veranstaltungen ist nicht gestattet.
              </li>
              <li>
                Sachschäden an Vereins- oder Fremdgeräten sind unverzüglich dem
                Vereinspersonal zu melden.
              </li>
              <li>
                Sportartspezifische Regelungen – z.B. Hygienevorschriften beim
                Schwimmen (Duschpflicht, Badekappe) oder Hallenregeln beim
                Hallensport/Fußball (geeignetes Schuhwerk) – gelten ergänzend
                und werden vor Ort kommuniziert.
              </li>
              <li>
                Bei wiederholtem oder schwerwiegendem Fehlverhalten behält sich
                der Verein den Ausschluss von der Veranstaltung sowie von
                zukünftigen Angeboten vor.
              </li>
            </ul>
          </Section>

          <Section title="7. Foto- & Videoaufnahmen">
            <ul className="text-sm leading-relaxed list-disc pl-6 space-y-2">
              <li>
                Der Verein kann im Rahmen von Veranstaltungen Foto- und
                Videoaufnahmen zu Zwecken der Dokumentation und
                Öffentlichkeitsarbeit anfertigen.
              </li>
              <li>
                Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f
                DSGVO (berechtigtes Interesse) oder auf Basis einer zuvor
                eingeholten Einwilligung gemäß Art. 6 Abs. 1 lit. a DSGVO.
              </li>
              <li>
                Teilnehmende, die nicht fotografiert oder gefilmt werden
                möchten, können dies vor Veranstaltungsbeginn beim
                Vereinspersonal mitteilen. Der Wunsch wird ohne Angabe von
                Gründen berücksichtigt.
              </li>
              <li>
                Eigene Bild- oder Videoaufnahmen anderer Teilnehmender sind ohne
                deren ausdrückliche Einwilligung nicht gestattet.
              </li>
              <li>
                Bei Minderjährigen ist die Einwilligung eines
                Erziehungsberechtigten erforderlich.
              </li>
            </ul>
          </Section>

          <Section title="8. Datenschutz">
            <p className="text-sm leading-relaxed">
              Die im Rahmen der Anmeldung erhobenen personenbezogenen Daten
              werden ausschließlich zur Organisation und Durchführung der
              jeweiligen Veranstaltung verarbeitet. Weitere Informationen
              entnehmen Sie bitte unserer{" "}
              <Link
                href="/datenschutz"
                className="text-green-600 hover:text-green-700 font-medium underline underline-offset-2"
              >
                Datenschutzerklärung
              </Link>
              .
            </p>
          </Section>

          <Section title="9. Änderungen der Teilnahmebedingungen">
            <p className="text-sm leading-relaxed">
              Der Verein behält sich vor, diese Teilnahmebedingungen jederzeit
              anzupassen. Die jeweils aktuelle Fassung ist auf der
              Vereinswebsite unter{" "}
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs">
                /teilnahmebedingungen
              </code>{" "}
              einsehbar. Maßgeblich ist die zum Zeitpunkt der Anmeldung gültige
              Version.
            </p>
          </Section>

          <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500 space-y-2">
            <p>Stand: Mai 2025</p>
            <p>
              Fragen? Wende dich an uns über das{" "}
              <Link
                href="/#kontakt"
                className="text-green-600 hover:text-green-700 font-medium underline underline-offset-2"
              >
                Kontaktformular
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
