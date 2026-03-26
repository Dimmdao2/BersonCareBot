"use client";

import { cn } from "@/lib/utils";

type NumericChipGroupProps = {
  min: number;
  max: number;
  value: number | null;
  onChange: (v: number) => void;
  colorFn?: (v: number) => string;
  className?: string;
  /** Класс размера чипа, по умолчанию `size-9`. */
  chipClassName?: string;
};

export function NumericChipGroup({
  min,
  max,
  value,
  onChange,
  colorFn,
  className,
  chipClassName = "size-9",
}: NumericChipGroupProps) {
  const items: number[] = [];
  for (let i = min; i <= max; i += 1) items.push(i);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((i) => {
        const color = colorFn?.(i) ?? "var(--primary)";
        const active = value === i;
        return (
          <button
            key={i}
            type="button"
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors",
              chipClassName,
              active ? "border-transparent text-white" : "border-solid bg-transparent",
            )}
            style={
              active
                ? { backgroundColor: color, borderColor: color }
                : { borderColor: color, color }
            }
            aria-pressed={active}
            onClick={() => onChange(i)}
          >
            {i}
          </button>
        );
      })}
    </div>
  );
}
