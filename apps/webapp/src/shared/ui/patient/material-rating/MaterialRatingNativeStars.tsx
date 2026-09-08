'use client';

import { Star } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/shared/ui/patient/primitives/button';
import { cn } from '@/lib/utils';

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
  'aria-label'?: string;
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
  'aria-label': ariaLabel = 'Оценка материала',
}: MaterialRatingNativeStarsProps) {
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = LEVELS.findIndex((level) => level === value);
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const moveSelection = (nextIndex: number) => {
    if (readOnly) return;
    const normalizedIndex = (nextIndex + LEVELS.length) % LEVELS.length;
    const nextLevel = LEVELS[normalizedIndex];
    if (nextLevel === undefined) return;
    radioRefs.current[normalizedIndex]?.focus();
    onChange(nextLevel);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('flex', tight ? 'gap-0' : 'gap-1.5 sm:gap-2', className)}
    >
      {LEVELS.map((n) => {
        const filled = value >= 1 && n <= value;
        return (
          <Button
            ref={(node) => {
              radioRefs.current[n - 1] = node;
            }}
            key={n}
            type="button"
            variant="ghost"
            role="radio"
            aria-checked={value === n}
            disabled={readOnly}
            tabIndex={readOnly || n - 1 !== tabbableIndex ? -1 : 0}
            onKeyDown={(event) => {
              const currentIndex = n - 1;
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                moveSelection(currentIndex + 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                moveSelection(currentIndex - 1);
              } else if (event.key === 'Home') {
                event.preventDefault();
                moveSelection(0);
              } else if (event.key === 'End') {
                event.preventDefault();
                moveSelection(LEVELS.length - 1);
              }
            }}
            onClick={() => {
              if (readOnly) return;
              onChange(value === n ? 0 : n);
            }}
            className={cn(
              'h-auto min-h-0 w-auto rounded bg-transparent transition-opacity hover:bg-transparent',
              tight ? 'p-0' : 'p-0.5',
              readOnly ? 'cursor-default' : 'cursor-pointer hover:opacity-90',
            )}
          >
            <Star
              className="shrink-0"
              size={starSize}
              fill={
                filled ? 'var(--patient-rating-fill-on)' : 'var(--patient-rating-fill-off)'
              }
              stroke={
                filled ? 'var(--patient-rating-stroke-on)' : 'var(--patient-rating-stroke-off)'
              }
              strokeWidth={starSize <= 18 ? 1.5 : 2}
            />
          </Button>
        );
      })}
    </div>
  );
}
