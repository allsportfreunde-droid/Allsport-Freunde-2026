"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Zeigt den Strich statt des Hakens – für "einige ausgewählt". */
  indeterminate?: boolean;
  /** Vorlesetext, wenn kein sichtbares Label danebensteht. */
  label?: string;
}

/**
 * Auswahl-Checkbox mit großzügiger Klickfläche.
 *
 * Das native <input> bleibt erhalten (Tastatur, Formulare, Screenreader), ist
 * aber transparent – gezeichnet wird die Box daneben. Das umschließende Label
 * ist 40px hoch/breit, damit die Auswahl auch am Handy gut zu treffen ist.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate = false, label, disabled, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    const checked = props.checked ?? false;
    const active = checked || indeterminate;

    return (
      <label
        className={cn(
          "group inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={innerRef}
          type="checkbox"
          className="peer sr-only"
          disabled={disabled}
          aria-label={label}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-[5px] border-2 transition-colors",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
            active
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-400 bg-white group-hover:border-blue-500"
          )}
        >
          {indeterminate ? (
            <Minus className="h-3.5 w-3.5" strokeWidth={3} />
          ) : checked ? (
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          ) : null}
        </span>
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
