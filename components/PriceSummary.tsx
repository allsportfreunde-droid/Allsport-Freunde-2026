import { Euro } from "lucide-react";
import DiscountBadge from "@/components/DiscountBadge";
import { formatEuro } from "@/lib/finance";
import type { PersonsPrice } from "@/lib/price-tiers";

/**
 * Kostenübersicht einer Anmeldung.
 *
 * Ohne Ermäßigung die gewohnte eine Zeile ("2 × 7,50 €   15,00 €"). Mit
 * Ermäßigung eine kleine Quittung: je Preisstufe eine Zeile, darunter die
 * Summe samt durchgestrichenem Normalpreis – ein langer "+"-Satz wäre dort
 * kaum noch zu lesen.
 */
export default function PriceSummary({
  pricing,
  note,
}: {
  pricing: PersonsPrice;
  /** Zusatz unter der Summe, etwa "Ermäßigung vorbehaltlich der Prüfung". */
  note?: string;
}) {
  if (!pricing.hasDiscount) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-gray-600">
          <Euro className="w-4 h-4 text-gray-400" />
          {pricing.breakdown}
        </span>
        <span className="text-base font-semibold text-gray-900">
          {formatEuro(pricing.totalCents / 100)}
        </span>
      </div>
    );
  }

  const saved = pricing.undiscountedCents > pricing.totalCents;

  return (
    <div>
      <ul className="space-y-1.5 text-sm text-gray-600">
        {pricing.groups.map(({ tier, count, unitCents, names, discount }) => (
          <li key={tier} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">{count === 1 ? names[0] : names[1]}</span>
              {discount && <DiscountBadge discount={discount} />}
            </span>
            <span className="tabular-nums whitespace-nowrap">
              {count} × {formatEuro(unitCents / 100)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <Euro className="w-4 h-4 text-gray-400" />
          Gesamt
        </span>
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          {saved && (
            <s className="text-sm text-gray-400 tabular-nums">
              <span className="sr-only">regulär </span>
              {formatEuro(pricing.undiscountedCents / 100)}
            </s>
          )}
          <span className="text-base font-semibold text-gray-900 tabular-nums">
            {formatEuro(pricing.totalCents / 100)}
          </span>
        </span>
      </div>
      {note && <p className="mt-1 text-right text-xs text-amber-700">{note}</p>}
    </div>
  );
}
