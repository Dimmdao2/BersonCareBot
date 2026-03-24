"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export type DiaryStatsPeriod = "week" | "month" | "all";

const PERIOD_LABELS: readonly [DiaryStatsPeriod, string][] = [
  ["week", "Неделя"],
  ["month", "Месяц"],
  ["all", "Всё"],
];

const MAX_OFFSET = 520;

/**
 * Общие кнопки периода и смещения для SymptomChart / LfkStatsTable (lazy recharts отдельно).
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
      <div className="flex flex-wrap gap-1">
        {PERIOD_LABELS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`button text-xs ${period === k ? "" : "button-outline"}`}
            onClick={() => onPeriodChange(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className="button button-outline p-1"
          aria-label="Предыдущий период"
          disabled={offset >= MAX_OFFSET}
          onClick={() => onOffsetChange(Math.min(MAX_OFFSET, offset + 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="button button-outline p-1"
          aria-label="Следующий период"
          disabled={offset <= 0}
          onClick={() => onOffsetChange(Math.max(0, offset - 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
