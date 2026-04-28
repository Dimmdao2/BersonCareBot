"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { patchAdminSetting } from "@/app/app/settings/patchAdminSetting";

type Props = {
  initialEnabled: boolean;
  initialLocalTime: string;
};

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
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-labelledby="patient-home-morning-ping-heading"
    >
      <h2 id="patient-home-morning-ping-heading" className="text-base font-semibold">
        Утренний пинг в боте
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ежедневное напоминание о «Разминке дня» в подключённом мессенджере. Время — в таймзоне приложения
        (как в настройке «app_display_timezone»). Состав разминки задаётся в блоке главной `daily_warmup`.
      </p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-label="Включить утренний пинг"
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
            aria-label="Локальное время пинга"
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
