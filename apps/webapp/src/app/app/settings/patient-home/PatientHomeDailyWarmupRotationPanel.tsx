"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { patchAdminSetting } from "@/app/app/settings/patchAdminSetting";
import {
  DEFAULT_PATIENT_HOME_DAILY_WARMUP_ROTATION_TIMES,
  MAX_DAILY_WARMUP_ROTATION_TIMES,
} from "@/modules/patient-home/patientHomeDailyWarmupRotationSettings";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

type Props = {
  initialEnabled: boolean;
  initialTimes: string[];
};

export function PatientHomeDailyWarmupRotationPanel(props: Props) {
  const [enabled, setEnabled] = useState(props.initialEnabled);
  const [times, setTimes] = useState<string[]>(
    props.initialTimes.length > 0 ?
      props.initialTimes
    : [...DEFAULT_PATIENT_HOME_DAILY_WARMUP_ROTATION_TIMES],
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addTimeRow() {
    if (times.length >= MAX_DAILY_WARMUP_ROTATION_TIMES) return;
    setTimes((prev) => [...prev, "12:00"]);
  }

  function removeTimeRow(index: number) {
    setTimes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function onSave() {
    setMessage(null);
    setError(null);
    for (const t of times) {
      if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(t.trim())) {
        setError("Время: формат HH:MM.");
        return;
      }
    }
    const unique = new Set(times.map((t) => t.trim()));
    if (unique.size !== times.length) {
      setError("Времена не должны повторяться.");
      return;
    }
    if (enabled && times.length < 1) {
      setError("Укажите хотя бы одно время.");
      return;
    }
    setPending(true);
    try {
      const sorted = [...times].map((t) => t.trim()).sort();
      const [okA, okB] = await Promise.all([
        patchAdminSetting("patient_home_daily_warmup_rotation_enabled", enabled),
        patchAdminSetting("patient_home_daily_warmup_rotation_times", sorted),
      ]);
      if (!okA || !okB) {
        setError("Не удалось сохранить.");
        return;
      }
      setMessage("Сохранено");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={doctorSectionCardClass} aria-labelledby="patient-home-warmup-rotation-heading">
      <h2 id="patient-home-warmup-rotation-heading" className={doctorSectionTitleClass}>
        Автосмена разминок на главной
      </h2>
      <p className="text-sm text-muted-foreground">
        Какая разминка дня на главной пациента. До 3 времён в календарной таймзоне пациента (не путать с
        исходящим сообщением бота ниже).
      </p>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-label="Включить автосмену разминок"
          />
          <span>Включить</span>
        </label>
        <ul className="flex flex-col gap-2">
          {times.map((time, index) => (
            <li key={index} className="flex items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Время {index + 1}</span>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTimes((prev) => prev.map((row, i) => (i === index ? v : row)));
                  }}
                  className="w-36"
                  aria-label={`Время смены ${index + 1}`}
                />
              </label>
              {times.length > 1 ?
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeTimeRow(index)}
                  disabled={pending}
                >
                  Удалить
                </Button>
              : null}
            </li>
          ))}
        </ul>
        {times.length < MAX_DAILY_WARMUP_ROTATION_TIMES ?
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addTimeRow} disabled={pending}>
            Добавить время
          </Button>
        : null}
        <Button type="button" onClick={() => void onSave()} disabled={pending} className="w-fit">
          {pending ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
      {error ?
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      : null}
      {message ?
        <p className="mt-2 text-sm text-green-700" role="status">
          {message}
        </p>
      : null}
    </section>
  );
}
