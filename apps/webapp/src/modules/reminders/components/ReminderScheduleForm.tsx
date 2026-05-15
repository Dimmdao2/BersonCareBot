import type { Dispatch, SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PatientDurationHmWheels } from "@/shared/ui/patient/PatientDurationHmWheels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ReminderLinkedObjectType } from "@/modules/reminders/types";
import type { ReminderDayFilter } from "@/modules/reminders/scheduleSlots";
import { DEFAULT_REHAB_DAILY_SLOTS } from "@/modules/reminders/scheduleSlots";
import { DEFAULT_REMINDER_FORM_FIRST_SLOT_TIME } from "@/modules/reminders/reminderFormDefaults";
import {
  REMINDER_INTERVAL_WINDOW_MAX_MINUTES,
  REMINDER_INTERVAL_WINDOW_MIN_MINUTES,
} from "@/modules/reminders/reminderIntervalBounds";
import {
  patientHeroBookingCardChromeClass,
  patientSectionTitleNormalClass,
} from "@/shared/ui/patientVisual";
import type { ReminderScheduleFieldInvalid } from "@/modules/reminders/reminderFormAria";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

/** Панель настроек в модалке: градиент записи на каждом блоке, без общей «коробки вокруг коробок». */
const reminderScheduleSettingPanelClass = cn(
  patientHeroBookingCardChromeClass,
  "flex flex-col gap-3 p-4 md:p-[18px]",
);

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
  /** Подсветка полей после ошибки валидации (см. scheduleInvalidFromError). */
  fieldInvalid?: Partial<ReminderScheduleFieldInvalid>;
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
  fieldInvalid,
}: ReminderScheduleFormProps) {
  const fi: ReminderScheduleFieldInvalid = {
    daysMask: fieldInvalid?.daysMask ?? false,
    quietHours: fieldInvalid?.quietHours ?? false,
    intervalWindow: fieldInvalid?.intervalWindow ?? false,
    slotTimes: fieldInvalid?.slotTimes ?? false,
  };

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
    linkedObjectTypeForDefaults === "rehab_program"
      ? DEFAULT_REHAB_DAILY_SLOTS.timesLocal[0] ?? "09:00"
      : DEFAULT_REMINDER_FORM_FIRST_SLOT_TIME;

  return (
    <div className="flex flex-col gap-3">
      <div className={reminderScheduleSettingPanelClass}>
        <h3 className={patientSectionTitleNormalClass}>Тип расписания</h3>
        <p className="text-xs text-muted-foreground">
          {scheduleMode === "slots_v1"
            ? "Напоминать несколько раз в день в выбранное время."
            : "Напоминать каждые N минут в выбранном окне времени."}
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
            Фиксированные напоминания
          </Button>
        </div>
      </div>

      {scheduleMode === "interval_window" ? (
        <div className={reminderScheduleSettingPanelClass}>
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
                aria-invalid={fi.intervalWindow || undefined}
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
                aria-invalid={fi.intervalWindow || undefined}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Интервал</Label>
            <PatientDurationHmWheels
              value={intervalMinutes}
              onChange={setIntervalMinutes}
              disabled={submitting}
              ariaInvalid={fi.intervalWindow}
            />
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
        <div className={reminderScheduleSettingPanelClass}>
          <h3 className={patientSectionTitleNormalClass}>Напоминания</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => setSlotTimeRows([DEFAULT_REHAB_DAILY_SLOTS.timesLocal[0] ?? "09:00"])}
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
                  DEFAULT_REHAB_DAILY_SLOTS.timesLocal[0] ?? "09:00",
                  DEFAULT_REHAB_DAILY_SLOTS.timesLocal[DEFAULT_REHAB_DAILY_SLOTS.timesLocal.length - 1] ?? "19:00",
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
              onClick={() =>
                setSlotTimeRows([
                  DEFAULT_REHAB_DAILY_SLOTS.timesLocal[0] ?? "09:00",
                  "13:00",
                  DEFAULT_REHAB_DAILY_SLOTS.timesLocal[DEFAULT_REHAB_DAILY_SLOTS.timesLocal.length - 1] ??
                    "19:00",
                ])
              }
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
                  aria-invalid={fi.slotTimes || undefined}
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
      <div className={reminderScheduleSettingPanelClass}>
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
                aria-invalid={fi.daysMask && i === 0 ? true : undefined}
              >
                {label}
              </Button>
            );
          })}
        </div>
        {scheduleMode === "slots_v1" && slotsDayFilter === "weekly_mask" ? (
          <p className="text-xs text-muted-foreground">Выберите дни для фиксированных напоминаний.</p>
        ) : null}
      </div>
      ) : (
        <div className={reminderScheduleSettingPanelClass}>
          <p className="text-xs text-muted-foreground">
            Дни слотов: понедельник–пятница (маска ниже не используется для этого режима).
          </p>
        </div>
      )}

      <div className={reminderScheduleSettingPanelClass}>
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
              aria-invalid={fi.quietHours || undefined}
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
              aria-invalid={fi.quietHours || undefined}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Конец тихих часов: до 23:59 в этом поле; полночь задайте как отдельный интервал при необходимости.
        </p>
      </div>

      {deliveryNote ? (
        <div className={cn(reminderScheduleSettingPanelClass, "gap-2")}>
          <p className="text-sm text-muted-foreground">{deliveryNote}</p>
        </div>
      ) : null}

      <div className={reminderScheduleSettingPanelClass}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Предпросмотр</span>
          <Badge variant="secondary" className="font-normal">
            {previewBadgeLabel}
          </Badge>
        </div>
        <p className="text-sm text-foreground">{previewText}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {syncWarning && !error ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">{syncWarning}</p>
      ) : null}
    </div>
  );
}
