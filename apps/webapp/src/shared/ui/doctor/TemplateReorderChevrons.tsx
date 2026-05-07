"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TemplateReorderChevronsProps = {
  disabled?: boolean;
  disableUp?: boolean;
  disableDown?: boolean;
  ariaLabelUp: string;
  ariaLabelDown: string;
  onUp: () => void | Promise<void>;
  onDown: () => void | Promise<void>;
  className?: string;
  /** Узкие кнопки (в строке с компактным тулбаром этапа/группы). */
  compact?: boolean;
};

/**
 * Пара «вверх / вниз» для порядка этапов, групп и элементов шаблона программы лечения.
 * Кнопки стоят вплотную (`gap-0`), компактнее двух разнесённых `size="icon"`.
 */
export function TemplateReorderChevrons({
  disabled = false,
  disableUp = false,
  disableDown = false,
  ariaLabelUp,
  ariaLabelDown,
  onUp,
  onDown,
  className,
  compact = false,
}: TemplateReorderChevronsProps) {
  const sz = compact ? "size-6" : "size-7";
  const iconSz = compact ? "size-3.5" : "size-4";
  return (
    <div
      className={cn("inline-flex shrink-0 items-center gap-0", className)}
      role="group"
      aria-label="Изменить порядок"
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(sz, "rounded-r-none")}
        disabled={disabled || disableUp}
        aria-label={ariaLabelUp}
        onClick={() => void onUp()}
      >
        <ChevronUp className={iconSz} />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(sz, "rounded-l-none border-l border-border/50")}
        disabled={disabled || disableDown}
        aria-label={ariaLabelDown}
        onClick={() => void onDown()}
      >
        <ChevronDown className={iconSz} />
      </Button>
    </div>
  );
}
