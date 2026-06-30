"use client";

import "react-day-picker/style.css";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { ru } from "react-day-picker/locale";
import { DateTime } from "luxon";
import { CalendarDays } from "lucide-react";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/doctor/primitives/popover";
import { cn } from "@/lib/utils";

/**
 * Shared canonical date-only picker (react-day-picker, no time input).
 * value/onChange — строка "yyyy-MM-dd".
 */
type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
};

export function DoctorDatePicker({
  value,
  onChange,
  disabled,
  placeholder = "Выберите дату",
  testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const dt = value ? DateTime.fromISO(value) : null;
  const selectedDate = dt?.isValid ? dt.toJSDate() : undefined;
  const label = dt?.isValid ? dt.setLocale("ru").toFormat("d MMMM yyyy") : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        data-testid={testId}
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
            onChange(DateTime.fromJSDate(d).toFormat("yyyy-MM-dd"));
            setOpen(false);
          }}
          className="p-3"
        />
      </PopoverContent>
    </Popover>
  );
}
