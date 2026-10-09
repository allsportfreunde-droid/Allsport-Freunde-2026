import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { SITE } from "@/lib/site";

// The events link is the CTA on the right, so it is not repeated here.
const links = [
  { href: "#ueber-uns", label: "Über uns" },
  { href: "#infos", label: "Infos" },
  { href: "#kontakt", label: "Kontakt" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Image
            src="/logo_1000_1000.png"
            alt={`${SITE.name} Logo`}
            width={44}
            height={44}
            className="h-11 w-11"
          />
          <span className="hidden font-display text-xl font-bold uppercase leading-none tracking-wide text-navy-700 sm:block">
            Allsport Freunde
          </span>
        </a>

        <nav aria-label="Hauptnavigation" className="flex items-center gap-1 sm:gap-2">
          <ul className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-navy-700"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <a href="#events" className={buttonVariants({ variant: "accent", className: "ml-2" })}>
            Zu den Events
          </a>
        </nav>
      </div>
    </header>
  );
}
