import { cn } from "@/lib/utils";

/**
 * Markiert eine Anmeldung als bezahlt.
 *
 * Am Eingang ist das die Frage, die man an der Zeile sofort beantwortet haben
 * will: Walk-ins und QR-Selbstanmeldungen stehen in der Liste, bevor das Geld
 * da ist – anders als eine Anmeldung von zu Hause, die erst mit der Zahlung
 * bestätigt wird.
 *
 * Bewusst dieselbe Form wie [[ChildBadge]] und die "Walk-in"-Markierung, damit
 * Namenszeilen überall gleich aussehen.
 */
export default function PaidBadge({
  paid,
  dark = false,
  className,
}: {
  /** false zeigt "Offen" – nur dort verwenden, wo ein Betrag fällig ist. */
  paid: boolean;
  /** Für den dunklen Scanner-Screen, wo Hell-auf-Hell untergehen würde. */
  dark?: boolean;
  className?: string;
}) {
  return (
    <span
      title={paid ? "Teilnahmebetrag ist bezahlt" : "Teilnahmebetrag ist offen"}
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none",
        paid
          ? dark
            ? "bg-green-900/40 text-green-300"
            : "bg-green-100 text-green-700"
          : dark
            ? "bg-amber-900/40 text-amber-300"
            : "bg-amber-100 text-amber-700",
        className
      )}
    >
      {paid ? "Bezahlt" : "Offen"}
    </span>
  );
}
