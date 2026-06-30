"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Scrollable column of selectable time slots — brand-styled twin of the
 * react-day-picker day grid. Selected slot mirrors the DayPicker selected day:
 * background var(--primary), text var(--primary-foreground), rounded.
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
};

function buildSlots(startHour: number, endHour: number, stepMinutes: number): string[] {
  const slots: string[] = [];
  const startTotal = startHour * 60;
  const endTotal = endHour * 60;
  for (let t = startTotal; t <= endTotal; t += stepMinutes) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return slots;
}

export function DoctorTimeColumn({
  value,
  onChange,
  disabled,
  startHour = 7,
  endHour = 21,
  stepMinutes = 15,
}: Props) {
  const slots = useMemo(
    () => buildSlots(startHour, endHour, stepMinutes),
    [startHour, endHour, stepMinutes],
  );
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll the selected slot into view when mounted (popover opens).
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div
      role="listbox"
      aria-label="Время"
      aria-disabled={disabled || undefined}
      className={cn(
        "flex max-h-[16rem] flex-col gap-0.5 overflow-y-auto pr-1 sm:max-h-[18.5rem]",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {slots.map((slot) => {
        const isSelected = slot === value;
        return (
          <button
            key={slot}
            ref={isSelected ? selectedRef : undefined}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={disabled}
            onClick={() => onChange(slot)}
            className={cn(
              "w-full shrink-0 cursor-pointer rounded-md px-3 py-1.5 text-center text-sm tabular-nums tracking-tight outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
              isSelected
                ? "bg-primary font-medium text-primary-foreground hover:bg-primary/90"
                : "text-foreground hover:bg-accent",
            )}
          >
            {slot}
          </button>
        );
      })}
    </div>
  );
}
