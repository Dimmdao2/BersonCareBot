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
  /** Inclusive start hour of generated slots (default 7 → 07:00). */
  startHour?: number;
  /** Inclusive end hour of generated slots (default 21 → 21:00). */
  endHour?: number;
  /** Step between slots in minutes (default 15). */
  stepMinutes?: number;
  /** Disables individual slots while retaining their place in the time scale. */
  isSlotDisabled?: (hhmm: string) => boolean;
};

function buildSlots(startHour: number, endHour: number, stepMinutes: number): string[] {
  const slots: string[] = [];
  const startTotal = startHour * 60;
  const endTotal = endHour * 60;
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
  startHour = 7,
  endHour = 21,
  stepMinutes = 15,
  isSlotDisabled,
}: Props) {
  const slots = useMemo(
    () => buildSlots(startHour, endHour, stepMinutes),
    [startHour, endHour, stepMinutes],
  );
  const listRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLButtonElement>(null);
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

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Время"
      aria-disabled={disabled || undefined}
      className={cn(
        'flex max-h-[16rem] flex-col gap-0 overflow-y-auto sm:max-h-[18.5rem]',
        disabled && 'pointer-events-none opacity-50',
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
