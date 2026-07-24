"use client";

import "react-day-picker/style.css";
import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ru } from "react-day-picker/locale";
import { DateTime } from "luxon";
import { CalendarDays } from "lucide-react";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/doctor/primitives/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/doctor/primitives/dialog";
import { useIsMobileViewport } from "@/shared/ui/doctor/primitives/useIsMobileViewport";
import { DoctorTimeColumn } from "@/shared/ui/doctor/DoctorTimeColumn";
import { cn } from "@/lib/utils";

/**
 * react-day-picker's own accent var, scoped to the popup content. `--primary` is themed
 * only under `#app-shell-doctor.theme-bersoncare-doctor-dna`, but Popover/Dialog content
 * portals to `document.body` — outside that scope — so it must read the globally-scoped
 * brand token instead, or it silently falls back to the generic (non-DNA) shadcn default.
 */
const RDP_ACCENT_STYLE = { ["--rdp-accent-color" as string]: "var(--bc-accent-500, #386fba)" } as const;

/**
 * react-day-picker only outlines the selected day by default (`--rdp-selected-border`);
 * it never fills it. Fill it with the brand primary + white text so it reads as an actual
 * selection, matching the filled pill DoctorTimeColumn already uses for its selected slot.
 */
const RDP_SELECTED_DAY_CLASS =
  "!bg-[var(--bc-accent-500,#386fba)] !text-white !border-transparent";

/**
 * Shared canonical date-time picker (react-day-picker + brand time column).
 * value/onChange — строка datetime-local "yyyy-MM-ddTHH:mm".
 */
type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Default keeps the existing datetime-local contract; time mode uses HH:mm. */
  mode?: "date-time" | "time";
  id?: string;
  ariaLabel?: string;
  testId?: string;
  className?: string;
};

export function DoctorDateTimePicker({
  value,
  onChange,
  disabled,
  placeholder,
  mode = "date-time",
  id,
  ariaLabel,
  testId,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobileViewport();
  const isTimeOnly = mode === "time";
  const dt = !isTimeOnly && value ? DateTime.fromISO(value) : null;
  const selectedDate = dt?.isValid ? dt.toJSDate() : undefined;
  const time = isTimeOnly ? value : dt?.isValid ? dt.toFormat("HH:mm") : "";
  const resolvedPlaceholder = placeholder ?? (isTimeOnly ? "Выберите время" : "Выберите дату и время");
  const label = isTimeOnly
    ? value || resolvedPlaceholder
    : dt?.isValid
      ? dt.setLocale("ru").toFormat("d MMMM yyyy, HH:mm")
      : resolvedPlaceholder;

  const commit = (date: DateTime, hhmm: string) => {
    const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
    onChange(
      date.set({ hour: Number.isFinite(h) ? h : 9, minute: Number.isFinite(m) ? m : 0 }).toFormat(
        "yyyy-MM-dd'T'HH:mm",
      ),
    );
  };

  // Mobile bottom-sheet drafts: staged locally and committed only on "Применить". Owner
  // 2026-07-25: the old mobile popover had no apply step and only closed on outside click —
  // a modal bottom sheet needs an explicit, deliberate commit instead.
  const [draftDate, setDraftDate] = useState<Date | undefined>(selectedDate);
  const [draftTime, setDraftTime] = useState(time);

  useEffect(() => {
    if (open && isMobile) {
      setDraftDate(selectedDate);
      setDraftTime(time);
    }
    // Re-sync the draft only when the sheet opens, not on every parent re-render/keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile]);

  const applyDraft = () => {
    if (isTimeOnly) {
      if (draftTime) onChange(draftTime);
    } else if (draftDate) {
      commit(DateTime.fromJSDate(draftDate), draftTime || "09:00");
    }
    setOpen(false);
  };

  const triggerClassName = cn(
    buttonVariants({ variant: "outline", size: isTimeOnly ? "sm" : "default" }),
    isTimeOnly
      ? "h-8 justify-center font-normal tabular-nums"
      : "w-full justify-start gap-2 font-normal",
    !isTimeOnly && !dt?.isValid && "text-muted-foreground",
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          id={id}
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={triggerClassName}
          data-testid={testId}
        >
          {triggerContent}
        </DialogTrigger>
        <DialogContent
          className="max-h-[85dvh] gap-0 overflow-hidden p-0"
          style={RDP_ACCENT_STYLE}
        >
          <DialogHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3 pr-12">
            <DialogTitle>{isTimeOnly ? "Выберите время" : "Выберите дату и время"}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isTimeOnly ? (
              <div className="p-3">
                <DoctorTimeColumn
                  value={draftTime}
                  disabled={disabled}
                  startHour={0}
                  endHour={23}
                  stepMinutes={15}
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
                  onSelect={(d) => setDraftDate(d)}
                  classNames={{ selected: RDP_SELECTED_DAY_CLASS }}
                  className="flex justify-center p-3"
                />
                <div className="border-t border-border p-3">
                  <span className="mb-1 block text-xs text-muted-foreground">Время</span>
                  <DoctorTimeColumn
                    value={draftTime}
                    disabled={!draftDate}
                    onChange={setDraftTime}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={applyDraft}
              disabled={isTimeOnly ? !draftTime : !draftDate}
            >
              Применить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            stepMinutes={15}
            onChange={(hhmm) => {
              onChange(hhmm);
              setOpen(false);
            }}
          />
        </PopoverContent>
      ) : (
        <PopoverContent className="w-auto p-0" align="start" style={RDP_ACCENT_STYLE}>
          <div className="flex flex-col sm:flex-row sm:items-stretch">
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
              classNames={{ selected: RDP_SELECTED_DAY_CLASS }}
              className="p-3"
            />
            <div className="border-t border-border p-3 sm:border-t-0 sm:border-l">
              <span className="mb-1 block text-xs text-muted-foreground">Время</span>
              <DoctorTimeColumn
                value={time}
                disabled={!selectedDate && !dt?.isValid}
                onChange={(hhmm) => {
                  const base = selectedDate ? DateTime.fromJSDate(selectedDate) : DateTime.now();
                  commit(base, hhmm);
                }}
              />
            </div>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
