import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin } from "lucide-react";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Impressum | Allsport Freunde 2026 e.V.",
  description: "Pflichtangaben gemäß § 5 TMG des Allsport Freunde 2026 e.V.",
};

function Placeholder({ children }: { children: string }) {
  return (
    <span className="bg-amber-50 border border-amber-300 text-amber-700 px-1.5 py-0.5 rounded text-sm font-medium">
      {children}
    </span>
  );
}

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

export default function ImpressumPage() {
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
            <h1 className="text-4xl font-bold mb-2">Impressum</h1>
            <p className="text-gray-400 mt-2">
              Pflichtangaben gemäß § 5 Telemediengesetz (TMG)
            </p>
            <div className="w-16 h-1 bg-green-500 rounded-full mt-6" />
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 py-12 text-gray-700">
          <Section title="Angaben gemäß § 5 TMG">
            <div className="space-y-3 text-sm leading-relaxed">
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="font-semibold text-gray-900 w-48 shrink-0">
                  Vereinsname
                </span>
                <span>Allsport Freunde 2026 e.V.</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="font-semibold text-gray-900 w-48 shrink-0">
                  Anschrift
                </span>
                <span className="flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <span>
                    Wackernheimer Straße 35
                    <br />
                    55218 Ingelheim am Rhein
                  </span>
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="font-semibold text-gray-900 w-48 shrink-0">
                  Vertretungsberechtigter Vorstand
                </span>
                <span>
                  Ömer Halit Saygili (1. Vorsitzende/r)
                </span>
              </div>
            </div>
          </Section>

          <Section title="Kontakt">
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-green-600 shrink-0" />
                <span className="font-semibold text-gray-900 w-20">E-Mail:</span>
                info@allsport-freunde.com
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-green-600 shrink-0" />
                <span className="font-semibold text-gray-900 w-20">Telefon:</span>
                +49 176 73548538
              </div>
            </div>
          </Section>

          <Section title="Vereinsregister">
            <div className="space-y-3 text-sm">
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="font-semibold text-gray-900 w-48 shrink-0">
                  Registergericht
                </span>
                Amtsgericht Mainz
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="font-semibold text-gray-900 w-48 shrink-0">
                  Vereinsregisternummer
                </span>
                (Eintragung beantragt)
              </div>
            </div>
          </Section>

          <Section title="Inhaltlich Verantwortlicher gemäß § 18 Abs. 2 MStV">
            <p className="text-sm leading-relaxed">
              Ömer Halit Saygili,{" "}
              Wackernheimer Straße 35, 55218 Ingelheim am Rhein
            </p>
          </Section>

          <Section title="Haftungsausschluss">
            <div className="space-y-4 text-sm leading-relaxed">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  Haftung für Inhalte
                </h3>
                <p>
                  Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene
                  Inhalte auf diesen Seiten nach den allgemeinen Gesetzen
                  verantwortlich. Nach §§ 8 bis 10 TMG sind wir als
                  Diensteanbieter jedoch nicht verpflichtet, übermittelte oder
                  gespeicherte fremde Informationen zu überwachen oder nach
                  Umständen zu forschen, die auf eine rechtswidrige Tätigkeit
                  hinweisen.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  Haftung für Links
                </h3>
                <p>
                  Unser Angebot enthält Links zu externen Websites Dritter, auf
                  deren Inhalte wir keinen Einfluss haben. Deshalb können wir für
                  diese fremden Inhalte auch keine Gewähr übernehmen. Für die
                  Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter
                  oder Betreiber der Seiten verantwortlich.
                </p>
              </div>
            </div>
          </Section>

          <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500">
            <p>
              Weitere Informationen zum Umgang mit Ihren Daten finden Sie in
              unserer{" "}
              <Link
                href="/datenschutz"
                className="text-green-600 hover:text-green-700 font-medium underline underline-offset-2"
              >
                Datenschutzerklärung
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
