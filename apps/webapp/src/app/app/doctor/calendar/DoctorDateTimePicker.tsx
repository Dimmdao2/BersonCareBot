"use client";

import "react-day-picker/style.css";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { ru } from "react-day-picker/locale";
import { DateTime } from "luxon";
import { CalendarDays } from "lucide-react";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { Input } from "@/shared/ui/doctor/primitives/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/doctor/primitives/popover";
import { cn } from "@/lib/utils";

/**
 * R17: готовый date-picker (react-day-picker, shadcn-стандарт) вместо нативного
 * datetime-local. value/onChange — строка datetime-local "yyyy-MM-ddTHH:mm".
 */
type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function DoctorDateTimePicker({
  value,
  onChange,
  disabled,
  placeholder = "Выберите дату и время",
}: Props) {
  const [open, setOpen] = useState(false);
  const dt = value ? DateTime.fromISO(value) : null;
  const selectedDate = dt?.isValid ? dt.toJSDate() : undefined;
  const time = dt?.isValid ? dt.toFormat("HH:mm") : "";
  const label = dt?.isValid ? dt.setLocale("ru").toFormat("d MMMM yyyy, HH:mm") : placeholder;

  const commit = (date: DateTime, hhmm: string) => {
    const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
    onChange(
      date.set({ hour: Number.isFinite(h) ? h : 9, minute: Number.isFinite(m) ? m : 0 }).toFormat(
        "yyyy-MM-dd'T'HH:mm",
      ),
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "outline", size: "default" }),
          "w-full justify-start gap-2 font-normal",
          !dt?.isValid && "text-muted-foreground",
        )}
      >
        <CalendarDays className="size-4 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        style={{ ["--rdp-accent-color" as string]: "var(--primary)" }}
      >
        <DayPicker
          mode="single"
          locale={ru}
          weekStartsOn={1}
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={(d) => {
            if (!d) return;
            commit(DateTime.fromJSDate(d), time || "09:00");
          }}
          className="p-3"
        />
        <div className="border-t border-border p-3">
          <label className="mb-1 block text-xs text-muted-foreground">Время</label>
          <Input
            type="time"
            value={time}
            disabled={!selectedDate && !dt?.isValid}
            onChange={(e) => {
              const base = selectedDate ? DateTime.fromJSDate(selectedDate) : DateTime.now();
              commit(base, e.target.value);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
