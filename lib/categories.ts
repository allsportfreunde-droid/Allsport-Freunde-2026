import { Dumbbell, Goal, Waves, type LucideIcon } from "lucide-react";
import type { EventWithRegistrations } from "@/lib/types";

type Category = EventWithRegistrations["category"];

/** Display config for the public event categories (filter, card, detail view). */
export const CATEGORY_CONFIG: Record<
  Category,
  {
    label: string;
    variant: "fussball" | "fitness" | "schwimmen";
    barColor: string;
    icon: LucideIcon;
    /** Cover panel for events without a photo. */
    coverClass: string;
  }
> = {
  fussball: { label: "Fußball", variant: "fussball", barColor: "bg-green-500", icon: Goal, coverClass: "bg-green-100 text-green-700" },
  fitness: { label: "Fitness", variant: "fitness", barColor: "bg-orange-500", icon: Dumbbell, coverClass: "bg-orange-100 text-orange-700" },
  schwimmen: { label: "Schwimmen", variant: "schwimmen", barColor: "bg-navy-500", icon: Waves, coverClass: "bg-navy-100 text-navy-500" },
};
