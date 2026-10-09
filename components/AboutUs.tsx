import Image from "next/image";
import { Users, Activity, Heart } from "lucide-react";
import { SITE_IMAGES } from "@/lib/site";

const values = [
  {
    icon: Users,
    title: "Gemeinschaft",
    description:
      "Wir bringen Menschen zusammen, unabhängig von Herkunft, Alter oder sportlicher Erfahrung.",
  },
  {
    icon: Activity,
    title: "Bewegung",
    description:
      "Von Schwimmen über Fußball bis Fitness: Wir bieten ein breites Spektrum an Sportmöglichkeiten.",
  },
  {
    icon: Heart,
    title: "Inklusion",
    description:
      "Jeder ist willkommen. Wir schaffen einen Ort, der offen, modern und zugänglich für alle ist.",
  },
];

export default function AboutUs() {
  return (
    <section id="ueber-uns" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <h2 className="font-display text-4xl font-bold uppercase leading-none tracking-tight text-navy-700 md:text-5xl">
              Über uns
            </h2>

            <div className="mt-6 max-w-[62ch] space-y-4 text-base leading-relaxed text-neutral-600 md:text-lg">
              <p>
                Die Idee hinter diesem Verein ist einfach: <strong className="font-semibold text-navy-700">Sport verbindet.</strong>{" "}
                Er verbindet Menschen unterschiedlichster Herkunft, jeden Alters und mit ganz
                verschiedenen Interessen. Genau das leben und gestalten wir hier in der Region Rhein-Main.
              </p>
              <p>
                Bei „Allsport Freunde 2026“ ist jeder willkommen, ob jung oder alt, Anfänger oder
                erfahrener Sportler. Unser Ziel: für jeden die passende Sportart und die passende
                Gemeinschaft finden.
              </p>
            </div>
          </div>

          <ul className="space-y-6 border-t border-neutral-200 pt-8 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-2">
            {values.map((value) => (
              <li key={value.title} className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                  <value.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold text-navy-700">{value.title}</h3>
                  <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-neutral-600 md:text-base">
                    {value.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Wide photo band closes the section: a different rhythm from the split hero above. */}
        <div className="relative mt-14 aspect-4/3 overflow-hidden rounded-2xl bg-navy-100 sm:aspect-video lg:mt-20 lg:aspect-21/9">
          <Image
            src={SITE_IMAGES.about.src}
            alt={SITE_IMAGES.about.alt}
            fill
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
