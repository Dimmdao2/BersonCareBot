"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  doctorClientOverviewSecondaryCardClass,
  doctorClientSectionTitleClass,
} from "./doctorClientCardChrome";

type WarmupScheduleRule = {
  id: string;
  scheduleType: string;
  scheduleData: { timesLocal: string[]; dayFilter: string } | null;
  enabled: boolean;
};

type Props = {
  userId: string;
};

export function DoctorClientWarmupSchedulePanel({ userId }: Props) {
  const [rule, setRule] = useState<WarmupScheduleRule | null | undefined>(undefined);
  const [times, setTimes] = useState<string[]>(["09:00"]);
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
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(userId)}/warmup-schedule`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timesLocal: times, dayFilter: "weekdays" }),
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
        <div className="flex flex-col gap-2">
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
