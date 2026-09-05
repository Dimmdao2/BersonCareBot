'use client';

import 'react-day-picker/style.css';
import { useEffect, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ru } from 'react-day-picker/locale';
import { DateTime } from 'luxon';
import { CalendarDays } from 'lucide-react';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/doctor/primitives/popover';
import { useIsMobileViewport } from '@/shared/ui/doctor/primitives/useIsMobileViewport';
import { DoctorTimeColumn } from '@/shared/ui/doctor/DoctorTimeColumn';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import { cn } from '@/lib/utils';

/**
 * Оформление календаря — в `.doctor-day-picker` (`app/styles/doctor.css`): выбранный день,
 * «сегодня», стрелки месяца и радиусы читают зональные `--primary` / `--doctor-control-radius`.
 * Doctor-тема объявлена и на `:root:has(#app-shell-doctor)`, поэтому токены доступны в портале.
 */
const RDP_CLASS = 'doctor-day-picker';

function currentLocalTimeSlot(stepMinutes: number): string {
  const now = DateTime.local();
  const totalMinutes = now.hour * 60 + now.minute;
  const roundedMinutes = Math.round(totalMinutes / stepMinutes) * stepMinutes;
  const boundedMinutes = Math.min(23 * 60 + 59, roundedMinutes);
  return `${String(Math.floor(boundedMinutes / 60)).padStart(2, '0')}:${String(
    boundedMinutes % 60,
  ).padStart(2, '0')}`;
}

/**
 * Shared canonical doctor picker (react-day-picker + brand time column).
 * value/onChange: date — "yyyy-MM-dd"; date-time — "yyyy-MM-ddTHH:mm"; time — "HH:mm".
 */
type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  mode?: 'date' | 'date-time' | 'time';
  id?: string;
  ariaLabel?: string;
  testId?: string;
  className?: string;
  /** Inclusive maximum, in the format used by the current picker mode. */
  max?: string;
  /** Time increments in the picker. Defaults to the doctor's standard 15-minute slots. */
  timeStepMinutes?: number;
  /** Date-time mode may be committed as a calendar date without an explicit time. */
  optionalTime?: boolean;
};

export function DoctorDateTimePicker({
  value,
  onChange,
  disabled,
  placeholder,
  mode = 'date-time',
  id,
  ariaLabel,
  testId,
  className,
  max,
  timeStepMinutes = 15,
  optionalTime = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobileViewport();
  const isTimeOnly = mode === 'time';
  const isDateOnly = mode === 'date';
  const hasExplicitTime = /T\d{2}:\d{2}/.test(value);
  const dt = !isTimeOnly && value ? DateTime.fromISO(value) : null;
  const selectedDate = dt?.isValid ? dt.toJSDate() : undefined;
  const time = isTimeOnly
    ? value
    : dt?.isValid && (!optionalTime || hasExplicitTime)
      ? dt.toFormat('HH:mm')
      : '';
  const [today] = useState(() => DateTime.local().startOf('day').toJSDate());
  const maxDateTime = max ? DateTime.fromISO(max) : null;
  const maxDate = maxDateTime?.isValid ? maxDateTime.toJSDate() : undefined;
  const resolvedPlaceholder =
    placeholder ??
    (isTimeOnly ? 'Выберите время' : isDateOnly ? 'Выберите дату' : 'Выберите дату и время');
  const label = isTimeOnly
    ? value || resolvedPlaceholder
    : dt?.isValid
      ? dt
          .setLocale('ru')
          .toFormat(
            isDateOnly || (optionalTime && !hasExplicitTime) ? 'd MMMM yyyy' : 'd MMMM yyyy, HH:mm',
          )
      : resolvedPlaceholder;

  const formatValue = (date: DateTime, hhmm: string) => {
    if (isDateOnly || (optionalTime && !hhmm)) return date.toFormat('yyyy-MM-dd');
    const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10));
    return date
      .set({ hour: Number.isFinite(h) ? h : 9, minute: Number.isFinite(m) ? m : 0 })
      .toFormat("yyyy-MM-dd'T'HH:mm");
  };

  const exceedsMax = (nextValue: string) => {
    if (!maxDateTime?.isValid) return false;
    const next = DateTime.fromISO(nextValue);
    return next.isValid && next.toMillis() > maxDateTime.toMillis();
  };

  const commit = (date: DateTime, hhmm: string) => {
    const nextValue = formatValue(date, hhmm);
    if (!exceedsMax(nextValue)) onChange(nextValue);
  };

  // Mobile bottom-sheet drafts: staged locally and committed only on "Применить". Owner
  // 2026-07-25: the old mobile popover had no apply step and only closed on outside click —
  // a modal bottom sheet needs an explicit, deliberate commit instead.
  const [draftDate, setDraftDate] = useState<Date | undefined>(selectedDate);
  const [draftTime, setDraftTime] = useState(time);
  const [draftTimeEnabled, setDraftTimeEnabled] = useState(!optionalTime || hasExplicitTime);
  const [desktopTimeEnabled, setDesktopTimeEnabled] = useState(
    !optionalTime || hasExplicitTime,
  );

  useEffect(() => {
    if (open && isMobile) {
      setDraftDate(selectedDate);
      setDraftTime(time);
      setDraftTimeEnabled(!optionalTime || hasExplicitTime);
    } else if (open) {
      setDesktopTimeEnabled(!optionalTime || hasExplicitTime);
    }
    // Re-sync the draft only when the sheet opens, not on every parent re-render/keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile]);

  const applyDraft = () => {
    if (isTimeOnly) {
      if (draftTime) onChange(draftTime);
    } else if (draftDate) {
      commit(
        DateTime.fromJSDate(draftDate),
        isDateOnly || (optionalTime && !draftTimeEnabled)
          ? ''
          : draftTime || currentLocalTimeSlot(timeStepMinutes),
      );
    }
    setOpen(false);
  };

  const isTimeUnavailable = (date: Date, hhmm: string) =>
    exceedsMax(formatValue(DateTime.fromJSDate(date), hhmm));
  const isDraftTimeUnavailable =
    !isTimeOnly && !isDateOnly && draftDate && draftTimeEnabled
      ? isTimeUnavailable(draftDate, draftTime || currentLocalTimeSlot(timeStepMinutes))
      : false;

  const triggerClassName = cn(
    buttonVariants({ variant: 'outline', size: isTimeOnly ? 'sm' : 'default' }),
    isTimeOnly
      ? 'h-8 justify-center font-normal tabular-nums'
      : 'w-full justify-start gap-2 font-normal',
    !isTimeOnly && !dt?.isValid && 'text-muted-foreground',
    className,
  );

  const triggerContent = (
    <>
      {!isTimeOnly && <CalendarDays className="size-4 shrink-0 opacity-70" />}
      <span className="truncate">{label}</span>
    </>
  );

  if (isMobile) {
    return (
      <>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={triggerClassName}
          data-testid={testId}
          onClick={() => setOpen(true)}
        >
          {triggerContent}
        </button>
        <DoctorModal
          open={open}
          onClose={() => setOpen(false)}
          title={
            isTimeOnly ? 'Выберите время' : isDateOnly ? 'Выберите дату' : 'Выберите дату и время'
          }
          size="sm"
          bodyClassName="p-0"
          footer={
            <Button
              type="button"
              onClick={applyDraft}
              disabled={isTimeOnly ? !draftTime : !draftDate || isDraftTimeUnavailable}
            >
              Применить
            </Button>
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isTimeOnly ? (
              <div>
                <DoctorTimeColumn
                  value={draftTime}
                  disabled={disabled}
                  startHour={0}
                  endHour={23}
                  stepMinutes={timeStepMinutes}
                  onChange={setDraftTime}
                />
              </div>
            ) : (
              <div className="flex flex-col">
                <DayPicker
                  mode="single"
                  locale={ru}
                  weekStartsOn={1}
                  selected={draftDate}
                  defaultMonth={draftDate}
                  disabled={maxDate ? { after: maxDate } : undefined}
                  modifiers={{ past: { before: today } }}
                  modifiersClassNames={{ past: 'doctor-day-picker-past' }}
                  onSelect={(d) => setDraftDate(d)}
                  className={cn(RDP_CLASS, 'flex justify-center p-3')}
                />
                {!isDateOnly ? (
                  <div className="border-t border-border pt-3">
                    <div className="mb-1 flex items-center gap-2 px-3">
                      <span className="text-sm text-muted-foreground">Время</span>
                      {optionalTime ? (
                        <Switch
                          checked={draftTimeEnabled}
                          onCheckedChange={(enabled) => {
                            setDraftTimeEnabled(enabled);
                            if (enabled && !draftTime) {
                              setDraftTime(currentLocalTimeSlot(timeStepMinutes));
                            }
                          }}
                          aria-label="Указать время"
                        />
                      ) : null}
                    </div>
                    {!optionalTime || draftTimeEnabled ? (
                      <DoctorTimeColumn
                        value={draftTime}
                        disabled={!draftDate}
                        isSlotDisabled={(hhmm) =>
                          draftDate ? isTimeUnavailable(draftDate, hhmm) : false
                        }
                        stepMinutes={timeStepMinutes}
                        onChange={setDraftTime}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </DoctorModal>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        className={triggerClassName}
        data-testid={testId}
      >
        {triggerContent}
      </PopoverTrigger>
      {isTimeOnly ? (
        <PopoverContent
          align="start"
          className="w-24 p-1.5"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <DoctorTimeColumn
            value={time}
            disabled={disabled}
            startHour={0}
            endHour={23}
            stepMinutes={timeStepMinutes}
            onChange={(hhmm) => {
              onChange(hhmm);
              setOpen(false);
            }}
          />
        </PopoverContent>
      ) : isDateOnly ? (
        <PopoverContent className="w-auto p-0" align="start">
          <DayPicker
            mode="single"
            locale={ru}
            weekStartsOn={1}
            selected={selectedDate}
            defaultMonth={selectedDate}
            disabled={maxDate ? { after: maxDate } : undefined}
            modifiers={{ past: { before: today } }}
            modifiersClassNames={{ past: 'doctor-day-picker-past' }}
            onSelect={(d) => {
              if (!d) return;
              commit(DateTime.fromJSDate(d), '');
              setOpen(false);
            }}
            className={cn(RDP_CLASS, 'p-3')}
          />
        </PopoverContent>
      ) : (
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col sm:flex-row sm:items-stretch">
            <DayPicker
              mode="single"
              locale={ru}
              weekStartsOn={1}
              selected={selectedDate}
              defaultMonth={selectedDate}
              disabled={maxDate ? { after: maxDate } : undefined}
              modifiers={{ past: { before: today } }}
              modifiersClassNames={{ past: 'doctor-day-picker-past' }}
              onSelect={(d) => {
                if (!d) return;
                commit(
                  DateTime.fromJSDate(d),
                  optionalTime && !desktopTimeEnabled
                    ? ''
                    : time || currentLocalTimeSlot(timeStepMinutes),
                );
              }}
              className={cn(RDP_CLASS, 'p-3')}
            />
            <div className="border-t border-border p-3 sm:border-t-0 sm:border-l">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Время</span>
                {optionalTime ? (
                  <Switch
                    checked={desktopTimeEnabled}
                    onCheckedChange={(enabled) => {
                      setDesktopTimeEnabled(enabled);
                      if (selectedDate) {
                        commit(
                          DateTime.fromJSDate(selectedDate),
                          enabled ? time || currentLocalTimeSlot(timeStepMinutes) : '',
                        );
                      }
                    }}
                    aria-label="Указать время"
                  />
                ) : null}
              </div>
              {!optionalTime || desktopTimeEnabled ? (
                <DoctorTimeColumn
                  value={time}
                  disabled={!selectedDate && !dt?.isValid}
                  isSlotDisabled={(hhmm) =>
                    selectedDate ? isTimeUnavailable(selectedDate, hhmm) : false
                  }
                  stepMinutes={timeStepMinutes}
                  onChange={(hhmm) => {
                    const base = selectedDate ? DateTime.fromJSDate(selectedDate) : DateTime.now();
                    commit(base, hhmm);
                  }}
                />
              ) : null}
            </div>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
