"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { patchAdminSetting } from "@/app/app/settings/patchAdminSetting";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

type Props = {
  initialEnabled: boolean;
  initialLocalTime: string;
};

/** Глобальная настройка: ежедневное исходящее сообщение бота пациентам с каналом (не напоминание админу). */
export function PatientHomeMorningPingPanel(props: Props) {
  const [enabled, setEnabled] = useState(props.initialEnabled);
  const [localTime, setLocalTime] = useState(props.initialLocalTime);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setMessage(null);
    setError(null);
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(localTime.trim())) {
      setError("Время: формат HH:MM (например 09:00).");
      return;
    }
    setPending(true);
    try {
      const [okA, okB] = await Promise.all([
        patchAdminSetting("patient_home_morning_ping_enabled", enabled),
        patchAdminSetting("patient_home_morning_ping_local_time", localTime.trim()),
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
    <section className={doctorSectionCardClass} aria-labelledby="patient-home-daily-bot-reminder-heading">
      <h2 id="patient-home-daily-bot-reminder-heading" className={doctorSectionTitleClass}>
        Ежедневное напоминание от бота
      </h2>
      <p className="text-sm text-muted-foreground">
        Исходящее сообщение в мессенджере о разминке дня. Одно время на всех, таймзона приложения
        (`app_display_timezone`). Не меняет разминку на главной — см. автосмену выше.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-label="Включить ежедневное напоминание от бота"
          />
          <span>Включить</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Время (HH:MM)</span>
          <Input
            type="time"
            value={localTime}
            onChange={(e) => setLocalTime(e.target.value)}
            className="w-36"
            aria-label="Локальное время отправки напоминания"
          />
        </label>
        <Button type="button" onClick={() => void onSave()} disabled={pending}>
          {pending ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-green-700" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
