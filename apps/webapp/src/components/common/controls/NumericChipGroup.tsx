"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Дискретная шкала 0–10: зелёный → жёлтый → красный (без inline style — чек-лист DoD). */
const CHIP_ACTIVE: string[] = [
  "bg-emerald-600 border-emerald-600 text-white",
  "bg-emerald-500 border-emerald-500 text-white",
  "bg-lime-600 border-lime-600 text-white",
  "bg-lime-500 border-lime-500 text-white",
  "bg-yellow-500 border-yellow-500 text-white",
  "bg-amber-500 border-amber-500 text-white",
  "bg-orange-500 border-orange-500 text-white",
  "bg-orange-600 border-orange-600 text-white",
  "bg-red-500 border-red-500 text-white",
  "bg-red-600 border-red-600 text-white",
  "bg-red-700 border-red-700 text-white",
];

const CHIP_INACTIVE: string[] = [
  "border-emerald-600 text-emerald-700",
  "border-emerald-500 text-emerald-700",
  "border-lime-600 text-lime-800",
  "border-lime-500 text-lime-800",
  "border-yellow-600 text-yellow-800",
  "border-amber-600 text-amber-800",
  "border-orange-600 text-orange-800",
  "border-orange-700 text-orange-900",
  "border-red-500 text-red-700",
  "border-red-600 text-red-800",
  "border-red-700 text-red-900",
];

type NumericChipGroupProps = {
  min: number;
  max: number;
  value: number | null;
  onChange: (v: number) => void;
  /** @deprecated Цвет задаётся дискретной шкалой; оставлено для совместимости API. */
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
  className,
  chipClassName = "size-9",
}: NumericChipGroupProps) {
  const items: number[] = [];
  for (let i = min; i <= max; i += 1) items.push(i);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((i) => {
        const active = value === i;
        const tone = CHIP_ACTIVE[i] ?? CHIP_ACTIVE[5];
        const toneMuted = CHIP_INACTIVE[i] ?? CHIP_INACTIVE[5];
        return (
          <Button
            key={i}
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "shrink-0 rounded-full border-2 border-solid p-0 text-sm font-medium shadow-none",
              chipClassName,
              active ? tone : cn("bg-transparent", toneMuted, "hover:bg-muted/30"),
            )}
            aria-pressed={active}
            onClick={() => onChange(i)}
          >
            {i}
          </Button>
        );
      })}
    </div>
  );
}
