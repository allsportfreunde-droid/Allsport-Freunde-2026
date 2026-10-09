import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { SITE_IMAGES } from "@/lib/site";

export default function Hero() {
  return (
    <section id="top" className="bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 pb-12 pt-10 sm:px-6 md:pt-14 lg:grid-cols-12 lg:gap-14 lg:px-8 lg:pb-14 lg:pt-14">
        <div className="lg:col-span-6">
          <h1 className="font-display text-6xl font-bold uppercase leading-[0.92] tracking-tight text-navy-700 motion-safe:animate-rise sm:text-7xl lg:text-8xl">
            Sport <span className="text-green-600">verbindet.</span>
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-600 motion-safe:animate-rise motion-safe:[animation-delay:120ms] md:text-xl">
            Menschen. Kulturen. Generationen. Gemeinsam bewegen wir die{" "}
            <span className="whitespace-nowrap">Rhein-Main-Region.</span>
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3 motion-safe:animate-rise motion-safe:[animation-delay:240ms]">
            <a href="#events" className={buttonVariants({ variant: "accent", size: "lg", className: "h-12 px-7" })}>
              Zu den Events
            </a>
            <a href="#ueber-uns" className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 px-7 text-navy-700" })}>
              Über uns
            </a>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="relative aspect-video overflow-hidden sm:aspect-4/3 lg:aspect-3/2 rounded-2xl bg-navy-100 shadow-[0_24px_60px_-24px_rgb(27_44_84/0.35)]">
            <Image
              src={SITE_IMAGES.hero.src}
              alt={SITE_IMAGES.hero.alt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
              preload
            />
          </div>
        </div>
      </div>
    </section>
  );
}
