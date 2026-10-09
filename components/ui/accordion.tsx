"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

function Accordion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-2", className)}>{children}</div>;
}

function AccordionItem({
  children,
  className,
  defaultOpen = false,
}: {
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className={cn("border border-border rounded-lg", className)}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ open?: boolean; onToggle?: () => void }>, {
            open,
            onToggle: () => setOpen(!open),
          });
        }
        return child;
      })}
    </div>
  );
}

function AccordionTrigger({
  children,
  className,
  open,
  onToggle,
}: {
  children: React.ReactNode;
  className?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center justify-between px-4 py-4 text-left font-medium transition-all hover:bg-muted/50 rounded-lg cursor-pointer",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
          open && "rotate-180"
        )}
      />
    </button>
  );
}

function AccordionContent({
  children,
  className,
  open,
}: {
  children: React.ReactNode;
  className?: string;
  open?: boolean;
}) {
  if (!open) return null;

  return (
    <div className={cn("px-4 pb-4 text-sm text-muted-foreground", className)}>
      {children}
    </div>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
