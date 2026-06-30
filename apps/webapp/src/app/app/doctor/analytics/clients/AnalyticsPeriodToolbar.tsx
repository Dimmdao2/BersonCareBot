"use client";

import { Button } from "@/shared/ui/doctor/primitives/button";
import { DoctorDatePicker } from "@/shared/ui/doctor/DoctorDatePicker";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";
import type { AnalyticsPeriodValue } from "./analyticsPeriodUi";

type Props = {
  period: AnalyticsPeriodValue;
  periodLabel: string | null;
  periodError: string | null;
  onPresetChange: (preset: AdminStatsTimePreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onApplyCustom: () => void;
};

export function AnalyticsPeriodToolbar({
  period,
  periodLabel,
  periodError,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
  onApplyCustom,
}: Props) {
  return (
    <div
      id="doctor-analytics-period-toolbar"
      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={period.preset === "day" ? "default" : "outline"}
          onClick={() => onPresetChange("day")}
        >
          Сутки
        </Button>
        <Button
          type="button"
          size="sm"
          variant={period.preset === "week" ? "default" : "outline"}
          onClick={() => onPresetChange("week")}
        >
          7 дней
        </Button>
        <Button
          type="button"
          size="sm"
          variant={period.preset === "month" ? "default" : "outline"}
          onClick={() => onPresetChange("month")}
        >
          30 дней
        </Button>
        <Button
          type="button"
          size="sm"
          variant={period.preset === "custom" ? "default" : "outline"}
          onClick={() => onPresetChange("custom")}
        >
          Период
        </Button>
      </div>

      {period.preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">С</span>
            <DoctorDatePicker value={period.customFrom} onChange={onCustomFromChange} testId="custom-from" />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">По</span>
            <DoctorDatePicker value={period.customTo} onChange={onCustomToChange} testId="custom-to" />
          </div>
          <Button type="button" size="sm" onClick={onApplyCustom}>
            Показать
          </Button>
        </div>
      ) : null}

      {periodLabel ? (
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">Выбрано: </span>
          {periodLabel}
        </p>
      ) : null}

      {periodError ? (
        <p className="text-destructive text-sm" role="alert">
          {periodError}
        </p>
      ) : null}
    </div>
  );
}
