import { cn } from "@/lib/utils";

interface OccupancyMeterProps {
  percentage: number;
  isFull: boolean;
  /** Bar color for the event category, e.g. "bg-green-500". */
  barColor: string;
  className?: string;
}

/**
 * Public occupancy indicator: a status line plus a thin bar without a
 * background track. Only the percentage reaches the client, never raw counts.
 */
export default function OccupancyMeter({ percentage, isFull, barColor, className }: OccupancyMeterProps) {
  const label = isFull ? "Ausgebucht" : percentage === 0 ? "Plätze frei" : `${percentage}% vergeben`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className={cn("text-sm font-medium", isFull ? "text-danger-600" : "text-neutral-600")}>{label}</p>
      <div
        className={cn("h-1 rounded-full", isFull ? "bg-danger" : barColor)}
        style={{ width: `${Math.max(isFull ? 100 : percentage, 2)}%` }}
        role="presentation"
      />
    </div>
  );
}
