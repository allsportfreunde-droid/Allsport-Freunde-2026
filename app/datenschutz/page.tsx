"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Footer from "@/components/Footer";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

function Placeholder({ children }: { children: string }) {
  return (
    <span className="bg-amber-50 border border-amber-300 text-amber-700 px-1.5 py-0.5 rounded text-sm font-medium">
      {children}
    </span>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ExtLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 underline underline-offset-2"
    >
      {children}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

const betroffenenrechte = [
  {
    title: "Auskunft (Art. 15 DSGVO)",
    content:
      "Sie haben das Recht, eine Bestätigung darüber zu verlangen, ob betreffende Daten verarbeitet werden, und auf Auskunft über diese Daten sowie auf weitere Informationen und Kopie der Daten entsprechend den gesetzlichen Vorgaben.",
  },
  {
    title: "Berichtigung (Art. 16 DSGVO)",
    content:
      "Sie haben das Recht, die Vervollständigung der Sie betreffenden Daten oder die Berichtigung der Sie betreffenden unrichtigen Daten zu verlangen.",
  },
  {
    title: "Löschung (Art. 17 DSGVO)",
    content:
      "Sie haben das Recht, die Löschung der Sie betreffenden Daten zu verlangen, sofern kein vorrangiges berechtigtes Interesse an deren Verarbeitung oder eine rechtliche Pflicht zur Aufbewahrung besteht.",
  },
  {
    title: "Einschränkung der Verarbeitung (Art. 18 DSGVO)",
    content:
      "Sie haben das Recht zu verlangen, dass die Verarbeitung der Sie betreffenden Daten eingeschränkt wird, soweit die Voraussetzungen der gesetzlichen Vorgaben erfüllt sind.",
  },
  {
    title: "Widerspruch (Art. 21 DSGVO)",
    content:
      "Sie haben das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit der Verarbeitung der Sie betreffenden Daten zu widersprechen, soweit diese auf der Rechtsgrundlage des berechtigten Interesses (Art. 6 Abs. 1 lit. f DSGVO) erfolgt.",
  },
  {
    title: "Datenübertragbarkeit (Art. 20 DSGVO)",
    content:
      "Sie haben das Recht, die Sie betreffenden Daten, die Sie uns bereitgestellt haben, in einem strukturierten, gängigen und maschinenlesbaren Format zu erhalten oder die Übermittlung an einen anderen Verantwortlichen zu fordern, sofern dies technisch machbar ist.",
  },
  {
    title: "Widerruf von Einwilligungen (Art. 7 Abs. 3 DSGVO)",
    content:
      "Sie haben das Recht, erteilte Einwilligungen jederzeit mit Wirkung für die Zukunft zu widerrufen. Der Widerruf berührt nicht die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung.",
  },
];

const dienste = [
  {
    title: "Vercel (Hosting & Infrastruktur)",
    content: (
      <div className="space-y-2 text-sm text-gray-600">
        <p>
          Diese Website wird auf der Plattform von Vercel Inc., 440 N Barranca
          Ave #4133, Covina, CA 91723, USA, gehostet. Bei jedem Seitenaufruf
          werden technische Zugriffsdaten (IP-Adresse, Browser-Informationen,
          Zeitstempel) in Server-Logs verarbeitet.
        </p>
        <p>
          Für die Übermittlung von Daten in die USA stützen wir uns auf
          EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO). Mit Vercel
          besteht ein Auftragsverarbeitungsvertrag (DPA).
        </p>
        <p>
          Datenschutzerklärung:{" "}
          <ExtLink href="https://vercel.com/legal/privacy-policy">
            vercel.com/legal/privacy-policy
          </ExtLink>
        </p>
      </div>
    ),
  },
  {
    title: "Neon PostgreSQL (Datenbankhosting)",
    content: (
      <div className="space-y-2 text-sm text-gray-600">
        <p>
          Wir verwenden Neon (Neon Inc.) als Datenbankdienstleister. Die
          Datenbank wird in der EU-Region betrieben. Gespeichert werden
          Registrierungsdaten, Veranstaltungsdaten und Kontaktanfragen. Mit Neon
          besteht ein Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO.
        </p>
        <p>
          Datenschutzerklärung:{" "}
          <ExtLink href="https://neon.tech/privacy-policy">
            neon.tech/privacy-policy
          </ExtLink>
        </p>
      </div>
    ),
  },
  {
    title: "Resend (Transaktions-E-Mails)",
    content: (
      <div className="space-y-2 text-sm text-gray-600">
        <p>
          Für den Versand von Bestätigungs- und Statusbenachrichtigungen per
          E-Mail nutzen wir den Dienst Resend (Resend Inc.). Dabei werden Name
          und E-Mail-Adresse des Empfängers an Resend übermittelt.
        </p>
        <p>
          Mit Resend besteht ein Auftragsverarbeitungsvertrag. E-Mails werden
          ausschließlich transaktional (auf direkte Nutzerinteraktion hin)
          versendet, kein Newsletter-Versand.
        </p>
        <p>
          Datenschutzerklärung:{" "}
          <ExtLink href="https://resend.com/privacy">
            resend.com/privacy
          </ExtLink>
        </p>
      </div>
    ),
  },
  {
    title: "OpenStreetMap / Nominatim (Kartenansicht)",
    content: (
      <div className="space-y-2 text-sm text-gray-600">
        <p>
          Für Kartenansichten nutzen wir OpenStreetMap (Betreiber: OpenStreetMap
          Foundation, UK) und den Nominatim-Geocodierungsdienst. Die
          Kartenansicht ist in die App eingebettet, ohne Cookies zu setzen und
          ohne dass personenbezogene Daten der Nutzer an OpenStreetMap
          übermittelt werden.
        </p>
        <p>
          Datenschutz OpenStreetMap:{" "}
          <ExtLink href="https://wiki.osmfoundation.org/wiki/Privacy_Policy">
            wiki.osmfoundation.org/wiki/Privacy_Policy
          </ExtLink>
        </p>
      </div>
    ),
  },
];

export default function DatenschutzPage() {
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
            <h1 className="text-4xl font-bold mb-2">Datenschutzerklärung</h1>
            <p className="text-gray-400 mt-2">
              Gemäß DSGVO und BDSG, Stand: April 2026
            </p>
            <div className="w-16 h-1 bg-green-500 rounded-full mt-6" />
          </div>
        </div>

        {/* Table of contents */}
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Inhalt
            </p>
            <nav className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-green-700">
              {[
                ["#verantwortlicher", "Verantwortlicher"],
                ["#daten", "Verarbeitete Daten"],
                ["#rechtsgrundlagen", "Rechtsgrundlagen"],
                ["#dienste", "Eingesetzte Dienste"],
                ["#speicherdauer", "Speicherdauer"],
                ["#rechte", "Ihre Rechte"],
                ["#aufsicht", "Aufsichtsbehörde"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="hover:underline">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        {/* Main content */}
        <div className="max-w-4xl mx-auto px-4 py-12 text-gray-700">
          {/* 1. Verantwortlicher */}
          <Section id="verantwortlicher" title="1. Verantwortlicher">
            <div className="text-sm leading-relaxed space-y-2">
              <p>
                Verantwortlich für die Datenverarbeitung auf dieser Website im
                Sinne der DSGVO ist:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-1">
                <p className="font-semibold text-gray-900">
                  Allsport Freunde 2026 e.V.
                </p>
                <p>
                  Wackernheimer Straße 35
                  <br />
                  55218 Ingelheim am Rhein
                </p>
                <p>
                  E-Mail:{" "}
                  info@allsport-freunde.com
                </p>
                <p>
                  Telefon:{" "}
                  +49 176 73548538
                </p>
              </div>
              <p>
                Unser{" "}
                <Link
                  href="/impressum"
                  className="text-green-600 hover:text-green-700 underline underline-offset-2"
                >
                  Impressum
                </Link>{" "}
                enthält weitere Pflichtangaben gemäß § 5 TMG.
              </p>
            </div>
          </Section>

          {/* 2. Verarbeitete Daten */}
          <Section id="daten" title="2. Verarbeitete Daten und Zwecke">
            <div className="space-y-6 text-sm leading-relaxed">
              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="font-semibold text-gray-900 mb-1">
                  2.1 Veranstaltungsregistrierungen
                </h3>
                <p>
                  Wenn Sie sich für eine Veranstaltung anmelden, erheben wir:
                  Vorname, Nachname, E-Mail-Adresse, Telefonnummer (optional),
                  Anzahl der Begleitpersonen sowie interne Notizen.
                </p>
                <p className="mt-1 text-gray-500">
                  Zweck: Durchführung der Veranstaltung, Platzreservierung,
                  Versand von Bestätigungs- und Statusnachrichten.
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
                  (Vertragserfüllung).
                </p>
              </div>

              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="font-semibold text-gray-900 mb-1">
                  2.2 Kontaktformular und Anfragen
                </h3>
                <p>
                  Bei Nutzung des Kontaktformulars erheben wir: Vorname,
                  Nachname, E-Mail-Adresse, WhatsApp-Nummer (optional),
                  Nachrichteninhalt sowie eine optionale Zuordnung zur
                  Veranstaltung.
                </p>
                <p className="mt-1 text-gray-500">
                  Zweck: Bearbeitung Ihrer Anfrage und Kommunikation per
                  E-Mail/Konversationsthread. Rechtsgrundlage: Art. 6 Abs. 1
                  lit. f DSGVO (berechtigtes Interesse) bzw. Art. 6 Abs. 1 lit.
                  a DSGVO (Einwilligung zur längeren Speicherung).
                </p>
              </div>

              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="font-semibold text-gray-900 mb-1">
                  2.3 QR-Code Check-in
                </h3>
                <p>
                  Für das Einlass-Management bei Veranstaltungen wird ein
                  QR-Code auf Basis eines JWT-Tokens generiert und an
                  angemeldete Teilnehmer versendet. Der Token enthält eine
                  verschlüsselte Registrierungs-ID. Es findet kein
                  Orts-Tracking oder sonstiges Tracking statt.
                </p>
                <p className="mt-1 text-gray-500">
                  Zweck: Einlasskontrolle und Anwesenheitserfassung.
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
                  (Vertragserfüllung).
                </p>
              </div>

              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="font-semibold text-gray-900 mb-1">
                  2.4 Walk-in-Registrierung
                </h3>
                <p>
                  Bei spontaner Teilnahme (Walk-in) an Veranstaltungen werden
                  Vorname, Nachname und E-Mail-Adresse durch das Vereinspersonal
                  erfasst. Die Verarbeitung erfolgt ausschließlich für die
                  Anwesenheitsdokumentation.
                </p>
                <p className="mt-1 text-gray-500">
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
                  (Vertragserfüllung).
                </p>
              </div>

              <div className="border-l-4 border-gray-300 pl-4">
                <h3 className="font-semibold text-gray-900 mb-1">
                  2.5 Server-Logs (technisch notwendig)
                </h3>
                <p>
                  Beim Aufruf dieser Website werden automatisch technische
                  Zugriffsdaten erfasst (IP-Adresse, Browser, Betriebssystem,
                  Zeitstempel, aufgerufene URL). Diese Daten werden nicht mit
                  anderen Daten zusammengeführt und dienen ausschließlich der
                  technischen Betriebssicherheit.
                </p>
                <p className="mt-1 text-gray-500">
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
                  Interesse an einem sicheren Betrieb). Speicherdauer: max. 30
                  Tage.
                </p>
              </div>
            </div>
          </Section>

          {/* 3. Rechtsgrundlagen */}
          <Section id="rechtsgrundlagen" title="3. Rechtsgrundlagen der Verarbeitung">
            <div className="text-sm leading-relaxed space-y-3">
              <p>
                Die Verarbeitung personenbezogener Daten auf dieser Website
                erfolgt auf folgenden Rechtsgrundlagen gemäß Art. 6 DSGVO:
              </p>
              <ul className="space-y-2">
                <li className="flex gap-3">
                  <span className="shrink-0 bg-green-100 text-green-800 text-xs font-mono px-2 py-0.5 rounded h-fit mt-0.5">
                    lit. a
                  </span>
                  <span>
                    <strong>Einwilligung</strong>: z. B. bei der Zustimmung zur
                    längeren Speicherung von Kontaktanfragen über 90 Tage hinaus.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 bg-green-100 text-green-800 text-xs font-mono px-2 py-0.5 rounded h-fit mt-0.5">
                    lit. b
                  </span>
                  <span>
                    <strong>Vertragserfüllung</strong>: Verarbeitung im Rahmen
                    von Veranstaltungsanmeldungen und der Nutzung der
                    vereinseigenen Dienste.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 bg-green-100 text-green-800 text-xs font-mono px-2 py-0.5 rounded h-fit mt-0.5">
                    lit. f
                  </span>
                  <span>
                    <strong>Berechtigtes Interesse</strong>: z. B. für den
                    sicheren Betrieb der Website (Server-Logs), die Bearbeitung
                    von Kontaktanfragen und das Einlass-Management.
                  </span>
                </li>
              </ul>
            </div>
          </Section>

          {/* 4. Eingesetzte Dienste */}
          <Section id="dienste" title="4. Eingesetzte Dienste und Auftragsverarbeiter">
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Wir setzen folgende externe Dienste ein. Mit allen Anbietern
              bestehen Auftragsverarbeitungsverträge (AVV) gemäß Art. 28 DSGVO.
              Eine Weitergabe an Dritte außer den nachfolgend genannten
              Auftragsverarbeitern findet nicht statt.
            </p>
            <Accordion>
              {dienste.map((d, i) => (
                <AccordionItem key={i}>
                  <AccordionTrigger>{d.title}</AccordionTrigger>
                  <AccordionContent>{d.content}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Section>

          {/* 5. Speicherdauer */}
          <Section id="speicherdauer" title="5. Speicherdauer">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-3 border border-gray-200 font-semibold text-gray-900">
                      Datenkategorie
                    </th>
                    <th className="text-left px-4 py-3 border border-gray-200 font-semibold text-gray-900">
                      Speicherdauer
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    [
                      "Veranstaltungsregistrierungen",
                      "Bis zur Löschung durch den Administrator, spätestens nach Ablauf der steuerrechtlichen Aufbewahrungsfrist (i.d.R. 10 Jahre)",
                    ],
                    [
                      "Kontaktanfragen (ohne Einwilligung)",
                      "90 Tage nach Erstellung, automatische Löschung",
                    ],
                    [
                      "Kontaktanfragen (mit Einwilligung)",
                      "Bis zu 100 Jahre (langfristige Vereinsdokumentation), auf ausdrücklichen Wunsch des Nutzers",
                    ],
                    ["QR-Code-Token", "Bis zum Ende der Veranstaltung"],
                    ["Server-Logs (Vercel)", "Max. 30 Tage"],
                    [
                      "Finanzdaten (Spenden, Kosten)",
                      "10 Jahre gemäß § 147 AO (steuerliche Aufbewahrungspflicht)",
                    ],
                  ].map(([category, duration]) => (
                    <tr key={category} className="hover:bg-gray-50">
                      <td className="px-4 py-3 border border-gray-200 text-gray-700">
                        {category}
                      </td>
                      <td className="px-4 py-3 border border-gray-200 text-gray-600">
                        {duration}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* 6. Betroffenenrechte */}
          <Section id="rechte" title="6. Ihre Rechte als betroffene Person">
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Sie haben gegenüber uns folgende Rechte hinsichtlich der Sie
              betreffenden personenbezogenen Daten. Zur Ausübung Ihrer Rechte
              wenden Sie sich bitte an:{" "}
              info@allsport-freunde.com
            </p>
            <Accordion>
              {betroffenenrechte.map((r, i) => (
                <AccordionItem key={i}>
                  <AccordionTrigger>{r.title}</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {r.content}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Section>

          {/* 7. Aufsichtsbehörde */}
          <Section id="aufsicht" title="7. Beschwerderecht bei der Aufsichtsbehörde">
            <div className="text-sm leading-relaxed space-y-3">
              <p>
                Unbeschadet eines anderweitigen verwaltungsrechtlichen oder
                gerichtlichen Rechtsbehelfs steht Ihnen das Recht auf Beschwerde
                bei einer Aufsichtsbehörde zu, wenn Sie der Ansicht sind, dass
                die Verarbeitung der Sie betreffenden personenbezogenen Daten
                gegen die DSGVO verstößt.
              </p>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="font-semibold text-gray-900 mb-1">
                  Zuständige Aufsichtsbehörde (Rheinland-Pfalz):
                </p>
                <p className="text-gray-700">
                  Der Landesbeauftragte für den Datenschutz und die
                  Informationsfreiheit Rheinland-Pfalz (LfDI RLP)
                </p>
                <p className="mt-2">
                  Website:{" "}
                  <ExtLink href="https://www.datenschutz.rlp.de">
                    www.datenschutz.rlp.de
                  </ExtLink>
                </p>
              </div>
            </div>
          </Section>

          {/* 8. Keine Weitergabe */}
          <Section title="8. Keine Weitergabe an Dritte">
            <p className="text-sm leading-relaxed">
              Eine Weitergabe Ihrer personenbezogenen Daten an Dritte erfolgt
              nicht, es sei denn, dies ist zur Vertragserfüllung erforderlich
              oder Sie haben eingewilligt. Die in Abschnitt 4 genannten
              Auftragsverarbeiter (Vercel, Neon, Resend) erhalten ausschließlich
              die für den jeweiligen Dienst erforderlichen Daten und sind
              vertraglich zur Einhaltung des Datenschutzes verpflichtet.
            </p>
          </Section>

          {/* 9. Keine automatisierte Entscheidungsfindung */}
          <Section title="9. Keine automatisierte Entscheidungsfindung / kein Profiling">
            <p className="text-sm leading-relaxed">
              Wir treffen keine auf automatisierter Verarbeitung beruhenden
              Entscheidungen, die Ihnen gegenüber rechtliche Wirkung entfalten
              oder Sie in ähnlicher Weise erheblich beeinträchtigen. Ein
              Profiling findet nicht statt.
            </p>
          </Section>

          {/* 10. Änderungen */}
          <Section title="10. Änderungen dieser Datenschutzerklärung">
            <p className="text-sm leading-relaxed">
              Wir behalten uns vor, diese Datenschutzerklärung zu aktualisieren,
              um sie an geänderte Rechtslagen oder bei Änderungen des Dienstes
              sowie der Datenverarbeitung anzupassen. Die jeweils aktuelle
              Version ist auf dieser Seite abrufbar. Bitte prüfen Sie die Seite
              regelmäßig auf Aktualisierungen.
            </p>
          </Section>

          <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500">
            <p>
              Weitere rechtliche Angaben finden Sie in unserem{" "}
              <Link
                href="/impressum"
                className="text-green-600 hover:text-green-700 font-medium underline underline-offset-2"
              >
                Impressum
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
