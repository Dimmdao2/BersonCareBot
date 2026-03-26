"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/common/controls/SegmentControl";

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
      <SegmentControl
        options={PERIOD_LABELS.map(([value, label]) => ({ value, label }))}
        value={period}
        onChange={(v) => onPeriodChange(v as DiaryStatsPeriod)}
        aria-label="Период статистики"
      />
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
