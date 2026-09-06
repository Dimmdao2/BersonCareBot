'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { reminderRuleToPatientJson } from '@/app/api/patient/reminders/reminderPatientJson';
import type { PatientReminderRuleJson } from '@/app/api/patient/reminders/reminderPatientJson';
import { Button } from '@/shared/ui/patient/primitives/button';
import { PatientModal } from '@/shared/ui/patient/PatientModal';
import type { UpdateRuleData } from '@/modules/reminders/service';
import type { ReminderRule } from '@/modules/reminders/types';
import { scheduleInvalidFromError } from '@/modules/reminders/reminderFormAria';
import type { ReminderDayFilter, SlotsV1ScheduleData } from '@/modules/reminders/scheduleSlots';
import {
  DEFAULT_REHAB_DAILY_SLOTS,
  normalizeSlotsV1ScheduleData,
} from '@/modules/reminders/scheduleSlots';
import {
  DEFAULT_REMINDER_FORM_DAYS_MASK,
  DEFAULT_REMINDER_FORM_FIRST_SLOT_TIME,
  DEFAULT_REMINDER_FORM_INTERVAL_MINUTES,
  DEFAULT_REMINDER_FORM_WINDOW_END_MINUTE,
  DEFAULT_REMINDER_FORM_WINDOW_START_MINUTE,
} from '@/modules/reminders/reminderFormDefaults';
import {
  REMINDER_INTERVAL_WINDOW_MAX_MINUTES,
  REMINDER_INTERVAL_WINDOW_MIN_MINUTES,
  clampIntervalMinutes,
} from '@/modules/reminders/reminderIntervalBounds';
import { minutesToTimeInput, timeInputToMinutes } from '@/modules/reminders/reminderTimeInputs';
import { ReminderScheduleForm } from '@/modules/reminders/components/ReminderScheduleForm';
import { patchPatientReminderScheduleBundle } from '@/app/app/patient/reminders/actions';
const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

function dedupeSortTimes(times: string[]): string[] {
  const set = new Set(times.map((t) => t.trim()).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, 'en'));
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
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_REMINDER_FORM_INTERVAL_MINUTES);
  const [startTime, setStartTime] = useState(
    minutesToTimeInput(DEFAULT_REMINDER_FORM_WINDOW_START_MINUTE),
  );
  const [endTime, setEndTime] = useState(
    minutesToTimeInput(DEFAULT_REMINDER_FORM_WINDOW_END_MINUTE),
  );
  const [daysMask, setDaysMask] = useState(DEFAULT_REMINDER_FORM_DAYS_MASK);
  const [scheduleMode, setScheduleMode] = useState<'interval_window' | 'slots_v1'>(
    'interval_window',
  );
  const [slotTimeRows, setSlotTimeRows] = useState<string[]>(() => [
    ...DEFAULT_REHAB_DAILY_SLOTS.timesLocal,
  ]);
  const [slotsDayFilter, setSlotsDayFilter] = useState<ReminderDayFilter>('weekdays');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const json: PatientReminderRuleJson = reminderRuleToPatientJson(rule);
    const isSlots = json.scheduleType === 'slots_v1';
    setScheduleMode(isSlots ? 'slots_v1' : 'interval_window');
    setIntervalMinutes(
      clampIntervalMinutes(json.intervalMinutes ?? DEFAULT_REMINDER_FORM_INTERVAL_MINUTES),
    );
    setStartTime(minutesToTimeInput(json.windowStartMinute));
    setEndTime(minutesToTimeInput(json.windowEndMinute));
    setDaysMask(/^[01]{7}$/.test(json.daysMask) ? json.daysMask : DEFAULT_REMINDER_FORM_DAYS_MASK);
    if (isSlots && json.scheduleData?.timesLocal?.length) {
      setSlotTimeRows(dedupeSortTimes([...json.scheduleData.timesLocal]));
      const df = json.scheduleData.dayFilter ?? 'weekdays';
      setSlotsDayFilter(df);
      if (df === 'weekly_mask' && /^[01]{7}$/.test(json.scheduleData.daysMask ?? '')) {
        setDaysMask(json.scheduleData.daysMask!.padEnd(7, '0').slice(0, 7));
      }
    } else if (isSlots) {
      setSlotTimeRows([...DEFAULT_REHAB_DAILY_SLOTS.timesLocal]);
      setSlotsDayFilter('weekly_mask');
      setDaysMask(DEFAULT_REHAB_DAILY_SLOTS.daysMask ?? '1111111');
    } else {
      setSlotTimeRows([DEFAULT_REMINDER_FORM_FIRST_SLOT_TIME]);
      setSlotsDayFilter('weekdays');
    }
  }, [open, rule]);

  const previewText = useMemo(() => {
    const daysOn = daysMask
      .split('')
      .map((c, i) => (c === '1' ? WEEKDAY_LABELS[i] : null))
      .filter(Boolean)
      .join(', ');
    if (scheduleMode === 'slots_v1') {
      const lines = dedupeSortTimes(slotTimeRows.map((s) => s.trim()).filter(Boolean));
      if (slotsDayFilter === 'weekdays') {
        return `Напоминания: ${lines.join(', ') || '—'}. Дни: Пн–Пт.`;
      }
      return `Напоминания: ${lines.join(', ') || '—'}. Дни: ${daysOn || 'не выбраны'}.`;
    }
    const ws = timeInputToMinutes(startTime);
    const we = timeInputToMinutes(endTime);
    if (ws == null || we == null) return 'Проверьте время.';
    return `${startTime}–${endTime}, каждые ${intervalMinutes} мин. Дни: ${daysOn || 'не выбраны'}.`;
  }, [scheduleMode, slotTimeRows, slotsDayFilter, startTime, endTime, intervalMinutes, daysMask]);

  const scheduleFieldInvalid = useMemo(() => scheduleInvalidFromError(error), [error]);

  const scrollToError = () => {
    requestAnimationFrame(() =>
      errorAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    );
  };

  const handleSubmit = async () => {
    setError(null);

    if (!/^[01]{7}$/.test(daysMask)) {
      setError('Неверная маска дней.');
      scrollToError();
      return;
    }
    if (!daysMask.includes('1')) {
      setError('Выберите хотя бы один день недели.');
      scrollToError();
      return;
    }

    let schedule: Record<string, unknown>;

    if (scheduleMode === 'interval_window') {
      const ws = timeInputToMinutes(startTime);
      const we = timeInputToMinutes(endTime);
      if (ws == null || we == null) {
        setError('Укажите время в формате ЧЧ:ММ.');
        scrollToError();
        return;
      }
      if (ws >= we) {
        setError('Начало периода должно быть раньше конца.');
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
        scheduleType: 'interval_window',
        intervalMinutes,
        windowStartMinute: ws,
        windowEndMinute: we,
        daysMask,
      };
    } else {
      const rawTimes = dedupeSortTimes(slotTimeRows.map((s) => s.trim()).filter(Boolean));
      const scheduleDataRaw = {
        timesLocal: rawTimes,
        dayFilter: slotsDayFilter,
        ...(slotsDayFilter === 'weekly_mask' ? { daysMask } : {}),
      };
      const norm = normalizeSlotsV1ScheduleData(scheduleDataRaw as SlotsV1ScheduleData);
      if (!norm.ok) {
        setError(
          norm.error.startsWith('validation_error:')
            ? 'Проверьте время напоминаний (ЧЧ:ММ).'
            : norm.error,
        );
        scrollToError();
        return;
      }
      schedule = {
        scheduleType: 'slots_v1',
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1440,
        daysMask,
        scheduleData: norm.data,
      };
    }

    setSubmitting(true);
    try {
      const res = await patchPatientReminderScheduleBundle({
        ruleId: rule.id,
        schedule: schedule as NonNullable<UpdateRuleData['schedule']>,
      });
      if (!res.ok) {
        setError(res.error);
        scrollToError();
        return;
      }
      onOpenChange(false);
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  const formId = `legacy-reminder-schedule-${rule.id}`;

  const body = (
    <div ref={errorAnchorRef} className="flex flex-col gap-4">
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
        previewBadgeLabel={categoryLabel}
        previewText={previewText}
        error={error}
        fieldInvalid={scheduleFieldInvalid}
      />
    </div>
  );

  const footer = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={submitting}
      >
        Отмена
      </Button>
      <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
        {submitting ? 'Сохранение…' : 'Сохранить'}
      </Button>
    </>
  );

  return (
    <PatientModal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Расписание"
      titleSubject={categoryLabel}
      size="lg"
      footer={footer}
    >
      {body}
    </PatientModal>
  );
}
