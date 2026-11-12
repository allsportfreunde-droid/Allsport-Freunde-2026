"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicTestimonial, PublicTestimonialsResponse } from "@/lib/types";

function TestimonialCard({ item }: { item: PublicTestimonial }) {
  const [expanded, setExpanded] = useState(false);
  const characters = Array.from(item.comment);
  const long = characters.length > 280;
  const comment = long && !expanded ? characters.slice(0, 280).join("").trimEnd() : item.comment;
  const commentId = `testimonial-comment-${item.id}`;
  return <Card className="h-full border-0 bg-green-50/50 transition-shadow hover:shadow-md">
    <CardContent className="flex h-full flex-col p-6">
      <div className="mb-4 flex gap-1 text-amber-500" role="img" aria-label={`${item.rating} von 5 Sternen`}>
        {[1, 2, 3, 4, 5].map((rating) => <Star key={rating} aria-hidden="true" className="h-5 w-5" fill={rating <= item.rating ? "currentColor" : "none"} />)}
      </div>
      <blockquote className="min-w-0 flex-1 text-gray-700">
        <p id={commentId} className="whitespace-pre-wrap break-words leading-relaxed">„{comment}“</p>
        {long && <button type="button" aria-expanded={expanded} aria-controls={commentId}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex min-h-11 items-center rounded text-sm font-medium text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
          {expanded ? "Weniger anzeigen" : "… mehr"}
        </button>}
        <footer className="mt-5 break-words text-sm font-medium text-gray-600">— {item.name}, {item.event_title}</footer>
      </blockquote>
    </CardContent>
  </Card>;
}

/** Öffentliche Ansicht: ausschließlich die bereits freigegebenen API-Daten zeigen. */
export function TestimonialsView({ data }: { data: PublicTestimonialsResponse }) {
  if (data.items.length === 0) return null;
  return <section id="stimmen" aria-labelledby="stimmen-title" className="bg-white px-4 py-20">
    <div className="mx-auto max-w-6xl">
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="mb-12 text-center">
        <h2 id="stimmen-title" className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Das sagen unsere Teilnehmer</h2>
        <div className="mx-auto mb-6 h-1 w-16 rounded-full bg-green-500" />
        {data.average !== null && <p className="text-gray-600">
          Ø {data.average.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} von 5 ★ aus {data.count} Bewertungen
        </p>}
      </motion.div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data.items.map((item, index) => <motion.div key={item.id} className="min-w-0"
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.1 * (index + 1) }}>
          <TestimonialCard item={item} />
        </motion.div>)}
      </div>
    </div>
  </section>;
}

export default function Testimonials() {
  const [data, setData] = useState<PublicTestimonialsResponse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/testimonials", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json();
        if (!controller.signal.aborted && Array.isArray(body.items)) setData(body);
      } catch {
        // Ohne Teilnehmerstimmen bleibt die Startseite vollständig nutzbar.
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return data === null ? null : <TestimonialsView data={data} />;
}
