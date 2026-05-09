"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { PatientReminderRuleJson } from "@/app/api/patient/reminders/reminderPatientJson";
import type { ReminderLinkedObjectType } from "@/modules/reminders/types";
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
import { customReminderFieldsInvalid, scheduleInvalidFromError } from "@/modules/reminders/reminderFormAria";
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

export type ReminderCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedObjectType: ReminderLinkedObjectType;
  linkedObjectId: string;
  contextTitle: string;
  existingRule: PatientReminderRuleJson | null;
  onSaved: () => void;
};

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

export function ReminderCreateDialog({
  open,
  onOpenChange,
  linkedObjectType,
  linkedObjectId,
  contextTitle,
  existingRule,
  onSaved,
}: ReminderCreateDialogProps) {
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
  const [customTitle, setCustomTitle] = useState("");
  const [customText, setCustomText] = useState("");

  const errorAnchorRef = useRef<HTMLParagraphElement | null>(null);

  const isEdit = Boolean(existingRule);
  const isCustom = linkedObjectType === "custom";

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSyncWarning(null);
    if (existingRule) {
      const isSlots = existingRule.scheduleType === "slots_v1";
      setScheduleMode(isSlots ? "slots_v1" : "interval_window");
      setIntervalMinutes(clampIntervalMinutes(existingRule.intervalMinutes ?? DEFAULT_INTERVAL));
      setStartTime(minutesToTimeInput(existingRule.windowStartMinute));
      setEndTime(minutesToTimeInput(existingRule.windowEndMinute));
      setDaysMask(/^[01]{7}$/.test(existingRule.daysMask) ? existingRule.daysMask : DEFAULT_MASK);
      setCustomTitle(existingRule.customTitle?.trim() ?? "");
      setCustomText(existingRule.customText?.trim() ?? "");
      if (isSlots && existingRule.scheduleData?.timesLocal?.length) {
        setSlotTimeRows(dedupeSortTimes([...existingRule.scheduleData.timesLocal]));
        setSlotsDayFilter(existingRule.scheduleData.dayFilter ?? "weekdays");
      } else {
        setSlotTimeRows([...DEFAULT_REHAB_WEEKDAY_SLOTS.timesLocal]);
        setSlotsDayFilter("weekdays");
      }
      if (existingRule.quietHoursStartMinute != null && existingRule.quietHoursEndMinute != null) {
        setQuietStart(minutesToTimeInput(existingRule.quietHoursStartMinute));
        setQuietEnd(minutesToTimeInput(existingRule.quietHoursEndMinute));
      } else {
        setQuietStart("");
        setQuietEnd("");
      }
    } else {
      setScheduleMode(linkedObjectType === "rehab_program" ? "slots_v1" : "interval_window");
      setIntervalMinutes(DEFAULT_INTERVAL);
      setStartTime(minutesToTimeInput(DEFAULT_START));
      setEndTime(minutesToTimeInput(DEFAULT_END));
      setDaysMask(DEFAULT_MASK);
      setCustomTitle("");
      setCustomText("");
      setSlotTimeRows(
        linkedObjectType === "rehab_program"
          ? [...DEFAULT_REHAB_WEEKDAY_SLOTS.timesLocal]
          : [minutesToTimeInput(DEFAULT_START)],
      );
      setSlotsDayFilter("weekdays");
      setQuietStart("");
      setQuietEnd("");
    }
  }, [open, existingRule, linkedObjectType]);

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
  const customFieldInvalid = useMemo(() => customReminderFieldsInvalid(error), [error]);

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

    if (isCustom) {
      const t = customTitle.trim();
      if (t.length < 1 || t.length > 140) {
        setError("Заголовок: от 1 до 140 символов.");
        scrollToError();
        return;
      }
      if (customText.length > 2000) {
        setError("Текст не длиннее 2000 символов.");
        scrollToError();
        return;
      }
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
          `Интервал от ${REMINDER_INTERVAL_WINDOW_MIN_MINUTES} до ${REMINDER_INTERVAL_WINDOW_MAX_MINUTES} минут (до 10 ч 59 мин).`,
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
      if (existingRule) {
        const body: Record<string, unknown> = {
          schedule,
          enabled: existingRule.enabled,
        };
        if (isCustom) {
          body.customTitle = customTitle.trim();
          body.customText = customText.trim() ? customText.trim() : null;
        }
        const res = await fetch(`/api/patient/reminders/${encodeURIComponent(existingRule.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          syncWarning?: string;
        };
        if (!res.ok || !data.ok) {
          setError(data.error === "not_found" ? "Правило не найдено." : "Не удалось сохранить.");
          scrollToError();
          return;
        }
        if (data.syncWarning) setSyncWarning(data.syncWarning);
      } else {
        const body: Record<string, unknown> =
          linkedObjectType === "custom"
            ? {
                linkedObjectType: "custom",
                customTitle: customTitle.trim(),
                customText: customText.trim() ? customText.trim() : null,
                enabled: true,
                schedule,
              }
            : {
                linkedObjectType,
                linkedObjectId,
                enabled: true,
                schedule,
              };
        const res = await fetch("/api/patient/reminders/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          syncWarning?: string;
        };
        if (!res.ok || !data.ok) {
          if (data.error === "not_found") {
            setError("Свяжите аккаунт с ботом, чтобы создавать напоминания.");
          } else {
            setError("Не удалось создать напоминание.");
          }
          scrollToError();
          return;
        }
        if (data.syncWarning) setSyncWarning(data.syncWarning);
      }
      onOpenChange(false);
      onSaved();
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      scrollToError();
    } finally {
      setSubmitting(false);
    }
  };

  const formId = "reminder-create-form";

  const scheduleBlock = (
    <ReminderScheduleForm
      formId={formId}
      submitting={submitting}
      linkedObjectTypeForDefaults={linkedObjectType}
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
      previewBadgeLabel={isCustom ? customTitle.trim() || "Заголовок" : contextTitle}
      previewText={previewText}
      error={error}
      syncWarning={syncWarning}
      fieldInvalid={scheduleFieldInvalid}
    />
  );

  const customFields = isCustom ? (
    <div className="space-y-3 px-1">
      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-ctitle`}>Заголовок</Label>
        <Input
          id={`${formId}-ctitle`}
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          maxLength={140}
          disabled={submitting}
          placeholder="Например: Выпить воду"
          aria-invalid={customFieldInvalid.title || undefined}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-ctext`}>Текст (необязательно)</Label>
        <Textarea
          id={`${formId}-ctext`}
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          maxLength={2000}
          disabled={submitting}
          rows={3}
          placeholder="Короткое напоминание"
          aria-invalid={customFieldInvalid.text || undefined}
        />
      </div>
    </div>
  ) : null;

  const body = (
    <div ref={errorAnchorRef} className="flex flex-col gap-4 px-1 pb-1">
      {customFields}
      {scheduleBlock}
    </div>
  );

  const title = isEdit ? "Изменить напоминание" : isCustom ? "Своё напоминание" : "Напоминание";

  const footer = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
        Отмена
      </Button>
      <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
        {submitting ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
      </Button>
    </div>
  );

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
