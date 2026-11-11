"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BadgePercent } from "lucide-react";
import { DISCOUNTS, type Discount } from "@/lib/discounts";
import { formatEuro } from "@/lib/finance";

/**
 * Hinweis unter einer Person im Anmeldeformular, sobald für sie eine
 * Ermäßigung erkannt wurde: "Ermäßigung −50 % · 6,00 € statt 12,00 €".
 * Blendet mit einer kleinen Federbewegung ein; bei reduzierter Bewegung nur Überblenden.
 */
export default function DiscountNotice({
  discount,
  fullCents,
  reducedCents,
  pending = false,
}: {
  discount: Discount | null;
  fullCents: number | null;
  reducedCents: number | null;
  /** Beantragt statt erkannt: gilt erst nach der Prüfung. */
  pending?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const percent = discount ? DISCOUNTS[discount].percent : null;

  return (
    <div aria-live="polite">
      <AnimatePresence initial={false}>
        {discount && percent != null && (
          <motion.div
            key={`${discount}-${pending}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              pending ? "border-amber-200 bg-amber-50 text-amber-800" : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            <motion.span
              aria-hidden="true"
              className="shrink-0"
              initial={reduceMotion ? false : { rotate: -25, scale: 0.5 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 500, damping: 16 }}
            >
              <BadgePercent className="w-4 h-4" />
            </motion.span>
            <span>
              <span className="font-semibold">Ermäßigung −{percent} %{pending && " beantragt"}</span>
              {fullCents != null && reducedCents != null && (
                <> · {formatEuro(reducedCents / 100)} statt {formatEuro(fullCents / 100)}</>
              )}
              {pending && <span className="block text-xs">Wird vor der Zahlung geprüft.</span>}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
