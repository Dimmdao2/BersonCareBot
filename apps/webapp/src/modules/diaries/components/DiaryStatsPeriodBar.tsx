"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DiaryStatsPeriod = "week" | "month" | "all";

const PERIOD_LABELS: readonly [DiaryStatsPeriod, string][] = [
  ["week", "Неделя"],
  ["month", "Месяц"],
  ["all", "Всё"],
];

const MAX_OFFSET = 520;

/**
 * Переключатель периода (I.8): явный активный сегмент + стрелки смещения окна.
 */
export function DiaryStatsPeriodBar({
  period,
  offset,
  onPeriodChange,
  onOffsetChange,
}: {
  period: DiaryStatsPeriod;
  offset: number;
  onPeriodChange: (p: DiaryStatsPeriod) => void;
  onOffsetChange: (next: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex rounded-md border border-border bg-muted/60 p-0.5"
        role="group"
        aria-label="Период статистики"
      >
        {PERIOD_LABELS.map(([k, label]) => {
          const active = period === k;
          return (
            <button
              key={k}
              type="button"
              className={cn(
                "rounded-sm px-3 py-1.5 text-xs font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.98]",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
              aria-pressed={active}
              onClick={() => onPeriodChange(k)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="p-1"
          aria-label="Предыдущий период"
          disabled={offset >= MAX_OFFSET}
          onClick={() => onOffsetChange(Math.min(MAX_OFFSET, offset + 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="p-1"
          aria-label="Следующий период"
          disabled={offset <= 0}
          onClick={() => onOffsetChange(Math.max(0, offset - 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
