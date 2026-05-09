import type { Dispatch, SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PatientDurationHmWheels } from "@/shared/ui/patient/PatientDurationHmWheels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ReminderLinkedObjectType } from "@/modules/reminders/types";
import type { ReminderDayFilter } from "@/modules/reminders/scheduleSlots";
import { DEFAULT_REHAB_WEEKDAY_SLOTS } from "@/modules/reminders/scheduleSlots";
import {
  REMINDER_INTERVAL_WINDOW_MAX_MINUTES,
  REMINDER_INTERVAL_WINDOW_MIN_MINUTES,
} from "@/modules/reminders/reminderIntervalBounds";
import { patientSectionSurfaceClass, patientSectionTitleNormalClass } from "@/shared/ui/patientVisual";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

export function toggleDayMaskReminder(mask: string, index: number): string {
  const chars = mask.padEnd(7, "0").slice(0, 7).split("");
  chars[index] = chars[index] === "1" ? "0" : "1";
  return chars.join("");
}

export type ReminderScheduleFormProps = {
  formId: string;
  submitting: boolean;
  /** Режим создания (без existingRule): для rehab_program слоты по умолчанию из реабилитации. */
  linkedObjectTypeForDefaults: ReminderLinkedObjectType;
  scheduleMode: "interval_window" | "slots_v1";
  setScheduleMode: (m: "interval_window" | "slots_v1") => void;
  intervalMinutes: number;
  setIntervalMinutes: (n: number) => void;
  startTime: string;
  setStartTime: (s: string) => void;
  endTime: string;
  setEndTime: (s: string) => void;
  daysMask: string;
  setDaysMask: Dispatch<SetStateAction<string>>;
  slotTimeRows: string[];
  setSlotTimeRows: Dispatch<SetStateAction<string[]>>;
  slotsDayFilter: ReminderDayFilter;
  setSlotsDayFilter: (f: ReminderDayFilter) => void;
  quietStart: string;
  setQuietStart: (s: string) => void;
  quietEnd: string;
  setQuietEnd: (s: string) => void;
  deliveryNote?: string;
  previewBadgeLabel: string;
  previewText: string;
  error: string | null;
  syncWarning: string | null;
};

export function ReminderScheduleForm({
  formId,
  submitting,
  linkedObjectTypeForDefaults,
  scheduleMode,
  setScheduleMode,
  intervalMinutes,
  setIntervalMinutes,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  daysMask,
  setDaysMask,
  slotTimeRows,
  setSlotTimeRows,
  slotsDayFilter,
  setSlotsDayFilter,
  quietStart,
  setQuietStart,
  quietEnd,
  setQuietEnd,
  deliveryNote,
  previewBadgeLabel,
  previewText,
  error,
  syncWarning,
}: ReminderScheduleFormProps) {
  const hideWeekdayMaskRow = scheduleMode === "slots_v1" && slotsDayFilter === "weekdays";

  const applyWeekdayPreset = (preset: "all" | "weekdays" | "clear") => {
    if (preset === "all") setDaysMask("1111111");
    else if (preset === "weekdays") setDaysMask("1111100");
    else setDaysMask("0000000");
  };

  const applyQuietPresetNight = () => {
    setQuietStart("22:00");
    setQuietEnd("08:00");
  };

  const clearQuiet = () => {
    setQuietStart("");
    setQuietEnd("");
  };

  const defaultSlotForNewRow =
    linkedObjectTypeForDefaults === "rehab_program" ? DEFAULT_REHAB_WEEKDAY_SLOTS.timesLocal[0] ?? "09:00" : "09:00";

  return (
    <div className="flex flex-col gap-4 px-1 pb-1">
      <div className={cn(patientSectionSurfaceClass, "!gap-3")}>
        <h3 className={patientSectionTitleNormalClass}>Тип расписания</h3>
        <p className="text-xs text-muted-foreground">
          {scheduleMode === "slots_v1"
            ? "Несколько_push в выбранные часы."
            : "Напоминания каждые N минут в окне от и до."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={scheduleMode === "interval_window" ? "default" : "outline"}
            size="sm"
            onClick={() => setScheduleMode("interval_window")}
            disabled={submitting}
          >
            Интервал в окне
          </Button>
          <Button
            type="button"
            variant={scheduleMode === "slots_v1" ? "default" : "outline"}
            size="sm"
            onClick={() => setScheduleMode("slots_v1")}
            disabled={submitting}
          >
            Фиксированные времена
          </Button>
        </div>
      </div>

      {scheduleMode === "interval_window" ? (
        <div className={cn(patientSectionSurfaceClass, "!gap-3")}>
          <h3 className={patientSectionTitleNormalClass}>Окно и интервал</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-start`}>Начало окна</Label>
              <Input
                id={`${formId}-start`}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-end`}>Конец окна</Label>
              <Input
                id={`${formId}-end`}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Интервал</Label>
            <PatientDurationHmWheels value={intervalMinutes} onChange={setIntervalMinutes} disabled={submitting} />
            <div className="flex flex-wrap gap-2">
              {[60, 120, 180].map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={submitting || m < REMINDER_INTERVAL_WINDOW_MIN_MINUTES || m > REMINDER_INTERVAL_WINDOW_MAX_MINUTES}
                  onClick={() => setIntervalMinutes(m)}
                >
                  {m === 60 ? "1 ч" : `${m / 60} ч`}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className={cn(patientSectionSurfaceClass, "!gap-3")}>
          <h3 className={patientSectionTitleNormalClass}>Времена</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => setSlotTimeRows([DEFAULT_REHAB_WEEKDAY_SLOTS.timesLocal[0] ?? "09:00"])}
            >
              Утро
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() =>
                setSlotTimeRows([
                  DEFAULT_REHAB_WEEKDAY_SLOTS.timesLocal[0] ?? "09:00",
                  DEFAULT_REHAB_WEEKDAY_SLOTS.timesLocal[DEFAULT_REHAB_WEEKDAY_SLOTS.timesLocal.length - 1] ?? "18:00",
                ])
              }
            >
              Утро и вечер
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => setSlotTimeRows(["09:00", "13:00", "18:00"])}
            >
              3 раза
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {slotTimeRows.map((row, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <Input
                  type="time"
                  value={row}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSlotTimeRows((rows) => rows.map((r, i) => (i === idx ? v : r)));
                  }}
                  disabled={submitting}
                  className="min-w-[8rem] flex-1"
                  aria-label={`Время ${idx + 1}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting || slotTimeRows.length <= 1}
                  onClick={() => setSlotTimeRows((rows) => rows.filter((_, i) => i !== idx))}
                >
                  Удалить
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-fit"
              disabled={submitting}
              onClick={() => setSlotTimeRows((rows) => [...rows, defaultSlotForNewRow])}
            >
              Добавить время
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Дни слотов</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={slotsDayFilter === "weekdays" ? "default" : "outline"}
                size="sm"
                onClick={() => setSlotsDayFilter("weekdays")}
                disabled={submitting}
              >
                Пн–Пт
              </Button>
              <Button
                type="button"
                variant={slotsDayFilter === "weekly_mask" ? "default" : "outline"}
                size="sm"
                onClick={() => setSlotsDayFilter("weekly_mask")}
                disabled={submitting}
              >
                Свои дни (маска)
              </Button>
            </div>
          </div>
        </div>
      )}

      {!hideWeekdayMaskRow ? (
      <div className={cn(patientSectionSurfaceClass, "!gap-3")}>
        <Label>Дни недели</Label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={submitting} onClick={() => applyWeekdayPreset("weekdays")}>
            Будни
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={submitting} onClick={() => applyWeekdayPreset("all")}>
            Все дни
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={submitting} onClick={() => applyWeekdayPreset("clear")}>
            Снять все
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, i) => {
            const on = daysMask[i] === "1";
            return (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                className={cn("min-w-11", !on && "text-muted-foreground")}
                onClick={() => setDaysMask((m) => toggleDayMaskReminder(m, i))}
                disabled={submitting}
              >
                {label}
              </Button>
            );
          })}
        </div>
        {scheduleMode === "slots_v1" && slotsDayFilter === "weekly_mask" ? (
          <p className="text-xs text-muted-foreground">Выберите дни для фиксированных времён.</p>
        ) : null}
      </div>
      ) : (
        <p className="text-xs text-muted-foreground px-1">
          Дни слотов: понедельник–пятница (маска ниже не используется для этого режима).
        </p>
      )}

      <div className={cn(patientSectionSurfaceClass, "!gap-3")}>
        <Label className="text-sm">Тихие часы (необязательно)</Label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={applyQuietPresetNight}>
            Ночь 22:00–08:00
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={submitting} onClick={clearQuiet}>
            Очистить
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-quiet-s`}>С</Label>
            <Input
              id={`${formId}-quiet-s`}
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-quiet-e`}>До</Label>
            <Input
              id={`${formId}-quiet-e`}
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Конец тихих часов: до 23:59 в этом поле; полночь задайте как отдельный интервал при необходимости.
        </p>
      </div>

      {deliveryNote ? (
        <div className={cn(patientSectionSurfaceClass, "!gap-2")}>
          <p className="text-sm text-muted-foreground">{deliveryNote}</p>
        </div>
      ) : null}

      <Card className="border-dashed">
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Предпросмотр</span>
            <Badge variant="secondary" className="font-normal">
              {previewBadgeLabel}
            </Badge>
          </div>
          <p className="text-sm text-foreground">{previewText}</p>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {syncWarning && !error ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">{syncWarning}</p>
      ) : null}
    </div>
  );
}
