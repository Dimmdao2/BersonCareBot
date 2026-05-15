"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVELS = [1, 2, 3, 4, 5] as const;

export type MaterialRatingNativeStarsProps = {
  value: number;
  readOnly: boolean;
  onChange: (v: number) => void;
  className?: string;
  /** Размер звезды в px (интерактивный выбор — 30). */
  starSize?: number;
  /** Уменьшить зазор между звёздами (компактная строка). */
  tight?: boolean;
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
  starSize = 30,
  tight = false,
  "aria-label": ariaLabel = "Оценка материала",
}: MaterialRatingNativeStarsProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("flex", tight ? "gap-0" : "gap-1.5 sm:gap-2", className)}
    >
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
              "rounded transition-opacity",
              tight ? "p-0" : "p-0.5",
              readOnly ? "cursor-default" : "cursor-pointer hover:opacity-90",
            )}
          >
            <Star
              className="shrink-0"
              size={starSize}
              fill={filled ? "#f7965c" : "#fff7ed"}
              stroke={filled ? "#bb5e26" : "#eda76a"}
              strokeWidth={starSize <= 18 ? 1.5 : 2}
            />
          </button>
        );
      })}
    </div>
  );
}
