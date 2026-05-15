"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVELS = [1, 2, 3, 4, 5] as const;

export type MaterialRatingNativeStarsProps = {
  value: number;
  readOnly: boolean;
  onChange: (v: number) => void;
  className?: string;
  "aria-label"?: string;
};

/**
 * Доступный fallback без `@smastrom/react-rating` (ошибка рендера библиотеки, ограничения окружения).
 */
export function MaterialRatingNativeStars({
  value,
  readOnly,
  onChange,
  className,
  "aria-label": ariaLabel = "Оценка материала",
}: MaterialRatingNativeStarsProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex gap-0.5 sm:gap-1", className)}>
      {LEVELS.map((n) => {
        const filled = value >= 1 && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            disabled={readOnly}
            tabIndex={readOnly ? -1 : 0}
            onClick={() => {
              if (readOnly) return;
              onChange(value === n ? 0 : n);
            }}
            className={cn(
              "rounded p-0.5 transition-opacity",
              readOnly ? "cursor-default" : "cursor-pointer hover:opacity-90",
              filled ? "text-amber-500" : "text-muted-foreground/45",
            )}
          >
            <Star className="h-7 w-7 sm:h-8 sm:w-8" fill={filled ? "currentColor" : "none"} strokeWidth={filled ? 0 : 1.8} />
          </button>
        );
      })}
    </div>
  );
}
