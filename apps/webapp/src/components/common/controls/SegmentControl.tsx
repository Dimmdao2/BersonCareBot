"use client";

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
          <button
            key={opt.value}
            type="button"
            className={cn(
              "rounded-sm px-3 py-1.5 text-xs font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.98]",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
