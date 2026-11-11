import { cn } from "@/lib/utils";
import { DISCOUNTS, type Discount } from "@/lib/discounts";

/**
 * Markiert eine Person mit Ermäßigung nach § 3 ("−50 %").
 *
 * Dieselbe Form wie ChildBadge, damit Namenszeilen überall gleich aussehen.
 * Bewusst nur der Satz – der Grund steht allein im Tooltip.
 */
export default function DiscountBadge({
  discount,
  className,
}: {
  discount: Discount;
  className?: string;
}) {
  const { percent, reason } = DISCOUNTS[discount];
  return (
    <span
      title={`Ermäßigung nach § 3: ${reason}`}
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none",
        discount === "reduced_50" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700",
        className
      )}
    >
      −{percent} %
    </span>
  );
}
