"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { reminderRuleToPatientJson } from "@/app/api/patient/reminders/reminderPatientJson";
import type { PatientReminderRuleJson } from "@/app/api/patient/reminders/reminderPatientJson";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { UpdateRuleData } from "@/modules/reminders/service";
import type { ReminderRule } from "@/modules/reminders/types";
import { scheduleInvalidFromError } from "@/modules/reminders/reminderFormAria";
import type { ReminderDayFilter, SlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";
import { DEFAULT_REHAB_WEEKDAY_SLOTS, normalizeSlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";
import { validateQuietHoursPair } from "@/modules/reminders/quietHours";
import {
  REMINDER_INTERVAL_WINDOW_MAX_MINUTES,
  REMINDER_INTERVAL_WINDOW_MIN_MINUTES,
  clampIntervalMinutes,
} from "@/modules/reminders/reminderIntervalBounds";
import {
  minutesToTimeInput,
  timeInputToMinutes,
  parseQuietStartMinute,
  parseQuietEndMinute,
} from "@/modules/reminders/reminderTimeInputs";
import { ReminderScheduleForm } from "@/modules/reminders/components/ReminderScheduleForm";
import { patchPatientReminderScheduleBundle } from "@/app/app/patient/reminders/actions";
import { cn } from "@/lib/utils";
import { patientPortalModalSurfaceClass } from "@/shared/ui/patientVisual";

function subscribeMobileViewport(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMobileViewportSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
}

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const DEFAULT_INTERVAL = 60;
const DEFAULT_START = 9 * 60;
const DEFAULT_END = 21 * 60;
const DEFAULT_MASK = "1111111";

const DELIVERY_NOTE =
  "Уведомления приходят в доступный канал бота (Telegram или MAX), если он подключён.";

function dedupeSortTimes(times: string[]): string[] {
  const set = new Set(times.map((t) => t.trim()).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, "en"));
}

export function LegacyReminderScheduleDialog({
  rule,
  categoryLabel,
  open,
  onOpenChange,
  onSaved,
}: {
  rule: ReminderRule;
  categoryLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);

  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_INTERVAL);
  const [startTime, setStartTime] = useState(minutesToTimeInput(DEFAULT_START));
  const [endTime, setEndTime] = useState(minutesToTimeInput(DEFAULT_END));
  const [daysMask, setDaysMask] = useState(DEFAULT_MASK);
  const [scheduleMode, setScheduleMode] = useState<"interval_window" | "slots_v1">("interval_window");
  const [slotTimeRows, setSlotTimeRows] = useState<string[]>(() => [...DEFAULT_REHAB_WEEKDAY_SLOTS.timesLocal]);
  const [slotsDayFilter, setSlotsDayFilter] = useState<ReminderDayFilter>("weekdays");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const errorAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSyncWarning(null);
    const json: PatientReminderRuleJson = reminderRuleToPatientJson(rule);
    const isSlots = json.scheduleType === "slots_v1";
    setScheduleMode(isSlots ? "slots_v1" : "interval_window");
    setIntervalMinutes(clampIntervalMinutes(json.intervalMinutes ?? DEFAULT_INTERVAL));
    setStartTime(minutesToTimeInput(json.windowStartMinute));
    setEndTime(minutesToTimeInput(json.windowEndMinute));
    setDaysMask(/^[01]{7}$/.test(json.daysMask) ? json.daysMask : DEFAULT_MASK);
    if (isSlots && json.scheduleData?.timesLocal?.length) {
      setSlotTimeRows(dedupeSortTimes([...json.scheduleData.timesLocal]));
      setSlotsDayFilter(json.scheduleData.dayFilter ?? "weekdays");
    } else {
      setSlotTimeRows([...DEFAULT_REHAB_WEEKDAY_SLOTS.timesLocal]);
      setSlotsDayFilter("weekdays");
    }
    if (json.quietHoursStartMinute != null && json.quietHoursEndMinute != null) {
      setQuietStart(minutesToTimeInput(json.quietHoursStartMinute));
      setQuietEnd(minutesToTimeInput(json.quietHoursEndMinute));
    } else {
      setQuietStart("");
      setQuietEnd("");
    }
  }, [open, rule]);

  const previewText = useMemo(() => {
    const daysOn = daysMask
      .split("")
      .map((c, i) => (c === "1" ? WEEKDAY_LABELS[i] : null))
      .filter(Boolean)
      .join(", ");
    const quietBit =
      quietStart.trim() && quietEnd.trim() ? ` Тихие часы: ${quietStart}–${quietEnd}.` : "";
    if (scheduleMode === "slots_v1") {
      const lines = dedupeSortTimes(slotTimeRows.map((s) => s.trim()).filter(Boolean));
      if (slotsDayFilter === "weekdays") {
        return `Времена: ${lines.join(", ") || "—"}. Дни: Пн–Пт.${quietBit}`;
      }
      return `Времена: ${lines.join(", ") || "—"}. Дни: ${daysOn || "не выбраны"}.${quietBit}`;
    }
    const ws = timeInputToMinutes(startTime);
    const we = timeInputToMinutes(endTime);
    if (ws == null || we == null) return "Проверьте время.";
    return `${startTime}–${endTime}, каждые ${intervalMinutes} мин. Дни: ${daysOn || "не выбраны"}.${quietBit}`;
  }, [scheduleMode, slotTimeRows, slotsDayFilter, startTime, endTime, intervalMinutes, daysMask, quietStart, quietEnd]);

  const scheduleFieldInvalid = useMemo(() => scheduleInvalidFromError(error), [error]);

  const scrollToError = () => {
    requestAnimationFrame(() => errorAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const handleSubmit = async () => {
    setError(null);
    setSyncWarning(null);

    if (!/^[01]{7}$/.test(daysMask)) {
      setError("Неверная маска дней.");
      scrollToError();
      return;
    }
    if (!daysMask.includes("1")) {
      setError("Выберите хотя бы один день недели.");
      scrollToError();
      return;
    }

    let quietHoursStartMinute: number | null = null;
    let quietHoursEndMinute: number | null = null;
    const hasQuiet = quietStart.trim().length > 0 || quietEnd.trim().length > 0;
    if (hasQuiet) {
      const qs = parseQuietStartMinute(quietStart);
      const qe = parseQuietEndMinute(quietEnd);
      if (qs === null || qe === null) {
        setError("Тихие часы: укажите начало и конец (ЧЧ:ММ) или очистите оба поля.");
        scrollToError();
        return;
      }
      const qv = validateQuietHoursPair(qs, qe);
      if (qv) {
        setError(qv === "validation_error: quiet hours both or none" ? "Задайте оба времени тихих часов." : qv);
        scrollToError();
        return;
      }
      quietHoursStartMinute = qs;
      quietHoursEndMinute = qe;
    }

    let schedule: Record<string, unknown>;

    if (scheduleMode === "interval_window") {
      const ws = timeInputToMinutes(startTime);
      const we = timeInputToMinutes(endTime);
      if (ws == null || we == null) {
        setError("Укажите время в формате ЧЧ:ММ.");
        scrollToError();
        return;
      }
      if (ws >= we) {
        setError("Начало окна должно быть раньше конца.");
        scrollToError();
        return;
      }
      if (
        !Number.isFinite(intervalMinutes) ||
        intervalMinutes < REMINDER_INTERVAL_WINDOW_MIN_MINUTES ||
        intervalMinutes > REMINDER_INTERVAL_WINDOW_MAX_MINUTES
      ) {
        setError(
          `Интервал от ${REMINDER_INTERVAL_WINDOW_MIN_MINUTES} до ${REMINDER_INTERVAL_WINDOW_MAX_MINUTES} минут.`,
        );
        scrollToError();
        return;
      }
      schedule = {
        scheduleType: "interval_window",
        intervalMinutes,
        windowStartMinute: ws,
        windowEndMinute: we,
        daysMask,
        quietHoursStartMinute,
        quietHoursEndMinute,
      };
    } else {
      const rawTimes = dedupeSortTimes(slotTimeRows.map((s) => s.trim()).filter(Boolean));
      const scheduleDataRaw = {
        timesLocal: rawTimes,
        dayFilter: slotsDayFilter,
        ...(slotsDayFilter === "weekly_mask" ? { daysMask } : {}),
      };
      const norm = normalizeSlotsV1ScheduleData(scheduleDataRaw as SlotsV1ScheduleData);
      if (!norm.ok) {
        setError(norm.error.startsWith("validation_error:") ? "Проверьте времена слотов (ЧЧ:ММ)." : norm.error);
        scrollToError();
        return;
      }
      schedule = {
        scheduleType: "slots_v1",
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1440,
        daysMask,
        scheduleData: norm.data,
        quietHoursStartMinute,
        quietHoursEndMinute,
      };
    }

    setSubmitting(true);
    try {
      const res = await patchPatientReminderScheduleBundle({
        ruleId: rule.id,
        schedule: schedule as NonNullable<UpdateRuleData["schedule"]>,
      });
      if (!res.ok) {
        setError(res.error);
        scrollToError();
        return;
      }
      if (res.syncWarning) setSyncWarning(res.syncWarning);
      onOpenChange(false);
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  const formId = `legacy-reminder-schedule-${rule.id}`;

  const body = (
    <div ref={errorAnchorRef} className="flex flex-col gap-4 px-1 pb-1">
      <ReminderScheduleForm
        formId={formId}
        submitting={submitting}
        linkedObjectTypeForDefaults="custom"
        scheduleMode={scheduleMode}
        setScheduleMode={setScheduleMode}
        intervalMinutes={intervalMinutes}
        setIntervalMinutes={(n) => setIntervalMinutes(clampIntervalMinutes(n))}
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
        daysMask={daysMask}
        setDaysMask={setDaysMask}
        slotTimeRows={slotTimeRows}
        setSlotTimeRows={setSlotTimeRows}
        slotsDayFilter={slotsDayFilter}
        setSlotsDayFilter={setSlotsDayFilter}
        quietStart={quietStart}
        setQuietStart={setQuietStart}
        quietEnd={quietEnd}
        setQuietEnd={setQuietEnd}
        deliveryNote={DELIVERY_NOTE}
        previewBadgeLabel={categoryLabel}
        previewText={previewText}
        error={error}
        syncWarning={syncWarning}
        fieldInvalid={scheduleFieldInvalid}
      />
    </div>
  );

  const footer = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
        Отмена
      </Button>
      <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
        {submitting ? "Сохранение…" : "Сохранить"}
      </Button>
    </div>
  );

  const title = `Расписание: ${categoryLabel}`;

  if (isMobileViewport) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            patientPortalModalSurfaceClass,
            "max-h-[92vh] overflow-y-auto rounded-t-2xl border-t border-[var(--patient-border)] px-4 pb-6",
          )}
        >
          <SheetHeader className="px-0 text-left">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {body}
          <SheetFooter className="px-0">{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          patientPortalModalSurfaceClass,
          "max-h-[90vh] max-w-md overflow-y-auto border-[var(--patient-border)] sm:max-w-md",
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body}
        <DialogFooter className="gap-2 sm:gap-0">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
