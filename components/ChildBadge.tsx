import { cn } from "@/lib/utils";

/**
 * Markiert eine Person als Kind (U18).
 *
 * Bewusst dieselbe Form wie die "Walk-in"-Markierung, damit Namenszeilen
 * überall gleich aussehen – die Markierung steht an sieben Stellen und wäre
 * als Kopie schnell auseinandergelaufen.
 */
export default function ChildBadge({
  count,
  dark = false,
  className,
}: {
  /**
   * Anzahl der Kinder – für Listen, die eine ganze Anmeldung in einer Zeile
   * zeigen ("2 Kinder"). Ohne count steht die Markierung an einer einzelnen
   * Person und heißt schlicht "Kind".
   */
  count?: number;
  /** Für den dunklen Scanner-Screen, wo Hell-auf-Hell untergehen würde. */
  dark?: boolean;
  className?: string;
}) {
  const label =
    count === undefined ? "Kind" : count === 1 ? "1 Kind" : `${count} Kinder`;

  return (
    <span
      title="Kind (unter 18 Jahren)"
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none",
        dark ? "bg-purple-900/40 text-purple-300" : "bg-purple-100 text-purple-700",
        className
      )}
    >
      {label}
    </span>
  );
}
