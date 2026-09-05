'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';

/**
 * Scrollable column of selectable time slots — brand-styled twin of the
 * react-day-picker day grid. The selected slot uses the shared light-blue selection fill.
 *
 * `value` / `onChange` — строка "HH:mm" (24h). Пустое значение = ничего не выбрано.
 */
type Props = {
  /** Selected time "HH:mm" or "" when none. */
  value: string;
  /** Called with the picked slot "HH:mm". Does NOT close the popover. */
  onChange: (hhmm: string) => void;
  disabled?: boolean;
  /** Inclusive start hour of generated slots (default 0 → 00:00). */
  startHour?: number;
  /** Last generated hour (default 23 → through 23:45 at a 15-minute step). */
  endHour?: number;
  /** Step between slots in minutes (default 15). */
  stepMinutes?: number;
  /** Disables individual slots while retaining their place in the time scale. */
  isSlotDisabled?: (hhmm: string) => boolean;
  /** Mobile wheel layout: hours and minutes scroll independently. */
  splitColumns?: boolean;
  className?: string;
};

function buildSlots(startHour: number, endHour: number, stepMinutes: number): string[] {
  const slots: string[] = [];
  const startTotal = startHour * 60;
  const endTotal = endHour * 60 + (60 - stepMinutes);
  for (let t = startTotal; t <= endTotal; t += stepMinutes) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return slots;
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number.parseInt(match[1] ?? '', 10);
  const minutes = Number.parseInt(match[2] ?? '', 10);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

export function DoctorTimeColumn({
  value,
  onChange,
  disabled,
  startHour = 0,
  endHour = 23,
  stepMinutes = 15,
  isSlotDisabled,
  splitColumns = false,
  className,
}: Props) {
  const slots = useMemo(
    () => buildSlots(startHour, endHour, stepMinutes),
    [startHour, endHour, stepMinutes],
  );
  const listRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLButtonElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const hourAnchorRef = useRef<HTMLButtonElement>(null);
  const minuteAnchorRef = useRef<HTMLButtonElement>(null);
  const parsedValueMinutes = timeToMinutes(value);
  const now = new Date();
  const effectiveMinutes = parsedValueMinutes ?? now.getHours() * 60 + now.getMinutes();
  const selectedHour = Math.min(endHour, Math.max(startHour, Math.floor(effectiveMinutes / 60)));
  const selectedMinute = Math.min(
    60 - stepMinutes,
    Math.max(0, Math.round((effectiveMinutes % 60) / stepMinutes) * stepMinutes),
  );
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index),
    [endHour, startHour],
  );
  const minutes = useMemo(
    () => Array.from({ length: Math.ceil(60 / stepMinutes) }, (_, index) => index * stepMinutes),
    [stepMinutes],
  );
  const scrollAnchor = useMemo(() => {
    const now = new Date();
    const targetMinutes = timeToMinutes(value) ?? now.getHours() * 60 + now.getMinutes();
    return slots.reduce((closest, slot) => {
      const closestDistance = Math.abs((timeToMinutes(closest) ?? 0) - targetMinutes);
      const slotDistance = Math.abs((timeToMinutes(slot) ?? 0) - targetMinutes);
      return slotDistance < closestDistance ? slot : closest;
    }, slots[0] ?? '');
  }, [slots, value]);

  // Keep an explicit selection in view; without one, open around the user's current local time.
  useEffect(() => {
    const list = listRef.current;
    const anchor = scrollAnchorRef.current;
    if (!list || !anchor) return;
    const frame = window.requestAnimationFrame(() => {
      const anchorTop =
        anchor.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      list.scrollTop = Math.max(
        0,
        anchorTop - (list.clientHeight - anchor.offsetHeight) / 2,
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollAnchor]);

  useEffect(() => {
    if (!splitColumns) return;
    const center = (list: HTMLDivElement | null, anchor: HTMLButtonElement | null) => {
      if (!list || !anchor) return;
      const anchorTop =
        anchor.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      list.scrollTop = Math.max(0, anchorTop - (list.clientHeight - anchor.offsetHeight) / 2);
    };
    const frame = window.requestAnimationFrame(() => {
      center(hourListRef.current, hourAnchorRef.current);
      center(minuteListRef.current, minuteAnchorRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedHour, selectedMinute, splitColumns]);

  if (splitColumns) {
    const formatPart = (part: number) => String(part).padStart(2, '0');
    const hasSelection = parsedValueMinutes !== null;

    return (
      <div
        className={cn(
          'grid min-h-0 grid-cols-2 divide-x divide-border overflow-hidden',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
      >
        <div
          ref={hourListRef}
          role="listbox"
          aria-label="Часы"
          aria-disabled={disabled || undefined}
          className="min-h-0 overflow-y-auto"
        >
          {hours.map((hour) => {
            const optionValue = `${formatPart(hour)}:${formatPart(selectedMinute)}`;
            const hourDisabled =
              disabled || minutes.every((minute) => isSlotDisabled?.(`${formatPart(hour)}:${formatPart(minute)}`));
            return (
              <Button
                key={hour}
                ref={hour === selectedHour ? hourAnchorRef : undefined}
                type="button"
                variant="ghost"
                role="option"
                aria-label={`${hour} часов`}
                aria-selected={hasSelection && hour === selectedHour}
                disabled={hourDisabled}
                onClick={() => onChange(optionValue)}
                className={cn(
                  'w-full shrink-0 cursor-pointer rounded-none px-3 py-1.5 text-center text-base tabular-nums tracking-tight outline-none transition-colors md:text-sm',
                  'focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
                  hasSelection && hour === selectedHour
                    ? 'bg-primary/10 font-medium text-foreground hover:bg-primary/15'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                {formatPart(hour)}
              </Button>
            );
          })}
        </div>
        <div
          ref={minuteListRef}
          role="listbox"
          aria-label="Минуты"
          aria-disabled={disabled || undefined}
          className="min-h-0 overflow-y-auto"
        >
          {minutes.map((minute) => {
            const optionValue = `${formatPart(selectedHour)}:${formatPart(minute)}`;
            const minuteDisabled = disabled || isSlotDisabled?.(optionValue) || false;
            return (
              <Button
                key={minute}
                ref={minute === selectedMinute ? minuteAnchorRef : undefined}
                type="button"
                variant="ghost"
                role="option"
                aria-label={`${minute} минут`}
                aria-selected={hasSelection && minute === selectedMinute}
                disabled={minuteDisabled}
                onClick={() => onChange(optionValue)}
                className={cn(
                  'w-full shrink-0 cursor-pointer rounded-none px-3 py-1.5 text-center text-base tabular-nums tracking-tight outline-none transition-colors md:text-sm',
                  'focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
                  hasSelection && minute === selectedMinute
                    ? 'bg-primary/10 font-medium text-foreground hover:bg-primary/15'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                {formatPart(minute)}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Время"
      aria-disabled={disabled || undefined}
      className={cn(
        'flex max-h-[16rem] flex-col gap-0 overflow-y-auto sm:max-h-[18.5rem]',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {slots.map((slot) => {
        const isSelected = slot === value;
        const slotDisabled = disabled || isSlotDisabled?.(slot) || false;
        return (
          <Button
            key={slot}
            ref={slot === scrollAnchor ? scrollAnchorRef : undefined}
            type="button"
            variant="ghost"
            role="option"
            aria-selected={isSelected}
            disabled={slotDisabled}
            onClick={() => onChange(slot)}
            className={cn(
              'w-full shrink-0 cursor-pointer rounded-md px-3 py-1.5 text-center text-base tabular-nums tracking-tight outline-none transition-colors md:text-sm',
              'focus-visible:ring-2 focus-visible:ring-ring/50',
              'disabled:pointer-events-none disabled:opacity-50',
              isSelected
                ? 'rounded-none bg-primary/10 font-medium text-foreground hover:bg-primary/15'
                : 'text-foreground hover:bg-accent',
            )}
          >
            {slot}
          </Button>
        );
      })}
    </div>
  );
}
