import Link from "next/link";
import Image from "next/image";
import { Mail, Phone, MapPin } from "lucide-react";
import { SITE } from "@/lib/site";

// Absolute paths so the links also work from the legal pages.
const sectionLinks = [
  { href: "/#ueber-uns", label: "Über uns" },
  { href: "/#events", label: "Events" },
  { href: "/#infos", label: "Infos" },
];

export default function Footer() {
  return (
    <footer id="kontakt" className="bg-navy-800 text-neutral-300">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 md:grid-cols-12 lg:px-8">
        {/* Verein */}
        <div className="md:col-span-5">
          <div className="flex items-center gap-3">
            <Image
              src="/logo_1000_1000.png"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-full bg-white"
            />
            <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-wide text-white">
              {SITE.name}
            </h3>
          </div>
          <p className="mt-5 max-w-[42ch] text-sm leading-relaxed">
            Gemeinnütziger Sportverein in der Rhein-Main-Region. Sport verbindet, und wir bringen
            Menschen zusammen.
          </p>
        </div>

        {/* Kontakt */}
        <div className="md:col-span-4">
          <h3 className="text-base font-semibold text-white">Kontakt</h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Mail className="h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />
              <a href={`mailto:${SITE.email}`} className="transition-colors hover:text-white">
                {SITE.email}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />
              <a href={SITE.phoneHref} className="transition-colors hover:text-white">
                {SITE.phoneDisplay}
              </a>
            </li>
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />
              <span>
                {SITE.street}
                <br />
                {SITE.postalCode} {SITE.city}
              </span>
            </li>
          </ul>
        </div>

        {/* Seite */}
        <nav aria-label="Seitenbereiche" className="md:col-span-3">
          <h3 className="text-base font-semibold text-white">Verein</h3>
          <ul className="mt-4 space-y-3 text-sm">
            {sectionLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-neutral-400 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p className="flex flex-col sm:flex-row sm:gap-3">
            <span>&copy; 2026 {SITE.name}</span>
            <span>Gemeinnütziger Verein</span>
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/impressum" className="transition-colors hover:text-white">
              Impressum
            </Link>
            <Link href="/datenschutz" className="transition-colors hover:text-white">
              Datenschutz
            </Link>
            <Link href="/teilnahmebedingungen" className="transition-colors hover:text-white">
              Teilnahmebedingungen
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
