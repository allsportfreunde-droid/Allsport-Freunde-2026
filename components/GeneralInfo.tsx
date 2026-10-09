"use client";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Was muss ich mitbringen?",
    answer:
      "Das hängt vom jeweiligen Event ab. Bei jedem Event findest du eine Angabe zur Kleiderordnung bzw. was du mitbringen solltest. Generell empfehlen wir: Sportkleidung, Trinkflasche und gute Laune! Für Schwimm-Events benötigst du Badebekleidung und ein Handtuch.",
  },
  {
    question: "Kostet die Teilnahme etwas?",
    answer:
      "Viele unserer Events sind komplett kostenlos. Bei einigen Events fällt ein kleiner Unkostenbeitrag an, z.B. für Hallenbad-Eintritt. Die genauen Kosten findest du bei jedem Event. Unser Ziel ist es, Sport für alle zugänglich zu machen. Geld soll kein Hindernis sein. Sprich uns an, wenn du Fragen hast.",
  },
  {
    question: "Für wen sind die Events geeignet?",
    answer:
      "Unsere Events richten sich an alle, unabhängig von Alter, Geschlecht, Herkunft oder sportlicher Erfahrung. Ob Anfänger oder Fortgeschrittene: Bei uns findet jeder das passende Angebot. Kinder sind in Begleitung eines Erwachsenen herzlich willkommen.",
  },
  {
    question: "Wie kann ich den Verein unterstützen?",
    answer:
      "Es gibt viele Möglichkeiten! Du kannst Mitglied werden, bei der Organisation von Events helfen, als Trainer oder Betreuer mitwirken, oder den Verein durch eine Spende unterstützen. Wir freuen uns über jede Form der Unterstützung. Kontaktiere uns einfach!",
  },
  {
    question: "Kann ich jemanden mitbringen?",
    answer:
      "Ja, auf jeden Fall! Bei der Anmeldung kannst du angeben, wie viele Personen du mitbringst. Bitte beachte, dass die Plätze begrenzt sind und auch für deine Begleitung ein Platz reserviert werden muss.",
  },
];

export default function GeneralInfo() {
  return (
    <section id="infos" className="bg-neutral-50 py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
        <div className="lg:col-span-4">
          <h2 className="font-display text-4xl font-bold uppercase leading-none tracking-tight text-navy-700 md:text-5xl lg:sticky lg:top-28">
            Häufige Fragen
          </h2>
        </div>

        <div className="lg:col-span-8">
          <Accordion className="space-y-0 border-t border-neutral-200">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                defaultOpen={index === 0}
                className="rounded-none border-x-0 border-t-0 border-neutral-200"
              >
                <AccordionTrigger className="gap-4 rounded-none px-0 py-5 text-base font-semibold text-navy-700 hover:bg-transparent hover:text-navy-500 md:text-lg">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="max-w-[65ch] px-0 pb-6 text-base leading-relaxed text-neutral-600">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
