"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/doctor/primitives/select";
import {
  doctorClientOverviewSecondaryCardClass,
  doctorClientSectionTitleClass,
} from "./doctorClientCardChrome";
import type { ReminderDayFilter } from "@/modules/reminders/scheduleSlots";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
const DEFAULT_DAYS_MASK = "1111100"; // Mon–Fri

type WarmupScheduleData = {
  timesLocal: string[];
  dayFilter: ReminderDayFilter;
  daysMask?: string;
  everyNDays?: number;
  anchorDate?: string;
};

type WarmupScheduleRule = {
  id: string;
  scheduleType: string;
  scheduleData: WarmupScheduleData | null;
  enabled: boolean;
};

type Props = {
  userId: string;
};

const DAY_FILTER_OPTIONS: { value: ReminderDayFilter; label: string }[] = [
  { value: "weekdays", label: "Рабочие дни (Пн–Пт)" },
  { value: "weekly_mask", label: "Выбранные дни" },
];

export function DoctorClientWarmupSchedulePanel({ userId }: Props) {
  const [rule, setRule] = useState<WarmupScheduleRule | null | undefined>(undefined);
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [dayFilter, setDayFilter] = useState<ReminderDayFilter>("weekdays");
  const [daysMask, setDaysMask] = useState<string>(DEFAULT_DAYS_MASK);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/warmup-schedule`,
      );
      const data = (await res.json()) as { ok?: boolean; rule?: WarmupScheduleRule | null };
      if (!res.ok || !data.ok) {
        setError("Не удалось загрузить расписание");
        return;
      }
      const loaded = data.rule ?? null;
      setRule(loaded);
      if (loaded?.scheduleData?.timesLocal?.length) {
        setTimes([...loaded.scheduleData.timesLocal]);
      } else {
        setTimes(["09:00"]);
      }
      const df = loaded?.scheduleData?.dayFilter ?? "weekdays";
      setDayFilter(df === "every_n_days" ? "weekdays" : df);
      if (df === "weekly_mask" && /^[01]{7}$/.test(loaded?.scheduleData?.daysMask ?? "")) {
        setDaysMask(loaded!.scheduleData!.daysMask!);
      } else {
        setDaysMask(DEFAULT_DAYS_MASK);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleDay(index: number) {
    setDaysMask((prev) => {
      const chars = prev.padEnd(7, "0").slice(0, 7).split("");
      chars[index] = chars[index] === "1" ? "0" : "1";
      return chars.join("");
    });
    setSaved(false);
  }

  async function onSave() {
    if (dayFilter === "weekly_mask" && !daysMask.includes("1")) {
      setError("Выберите хотя бы один день.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        timesLocal: times,
        dayFilter,
        ...(dayFilter === "weekly_mask" ? { daysMask } : {}),
      };
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/warmup-schedule`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError("Не удалось сохранить расписание");
        return;
      }
      setSaved(true);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function addSlot() {
    if (times.length >= 10) return;
    setTimes((prev) => [...prev, "12:00"]);
    setSaved(false);
  }

  function removeSlot(index: number) {
    if (times.length <= 1) return;
    setTimes((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  function updateSlot(index: number, value: string) {
    setTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
    setSaved(false);
  }

  if (loading && rule === undefined) {
    return (
      <div className={doctorClientOverviewSecondaryCardClass}>
        <p className={`mb-2 ${doctorClientSectionTitleClass}`}>Расписание разминок</p>
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={doctorClientOverviewSecondaryCardClass}>
      <p className={`mb-3 ${doctorClientSectionTitleClass}`}>Расписание разминок</p>

      {rule === null ? (
        <p className="text-sm text-muted-foreground">нет расписания</p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Day filter selector */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Дни</span>
            <Select
              value={dayFilter}
              onValueChange={(v) => {
                setDayFilter(v as ReminderDayFilter);
                setSaved(false);
              }}
            >
              <SelectTrigger
                className="h-8 w-full text-sm"
                displayLabel={DAY_FILTER_OPTIONS.find((o) => o.value === dayFilter)?.label}
              />
              <SelectContent>
                {DAY_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Day toggles for weekly_mask */}
          {dayFilter === "weekly_mask" && (
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                    daysMask[i] === "1"
                      ? "bg-primary text-primary-foreground"
                      : "border border-input bg-background text-muted-foreground hover:bg-accent"
                  }`}
                  aria-pressed={daysMask[i] === "1"}
                  aria-label={label}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Time slots */}
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Время</span>
            {times.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={t}
                  onChange={(e) => updateSlot(i, e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Удалить слот"
                  disabled={times.length <= 1}
                  onClick={() => removeSlot(i)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={times.length >= 10}
                onClick={addSlot}
              >
                <Plus className="mr-1 size-3" aria-hidden />
                Добавить время
              </Button>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {saved ? <p className="text-sm text-green-600">Сохранено</p> : null}

          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void onSave()}
            className="mt-1 w-fit"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      )}
    </div>
  );
}
