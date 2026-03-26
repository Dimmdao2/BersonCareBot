"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SegmentOption = { value: string; label: string };

type SegmentControlProps = {
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  "aria-label"?: string;
};

export function SegmentControl({
  options,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: SegmentControlProps) {
  return (
    <div
      className={cn("inline-flex rounded-md border border-border bg-muted/60 p-0.5", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Button
            key={opt.value}
            type="button"
            variant={active ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-auto min-h-0 rounded-sm px-3 py-1.5 text-xs font-medium shadow-none active:scale-[0.98]",
              !active && "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              active && "shadow-sm",
            )}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
