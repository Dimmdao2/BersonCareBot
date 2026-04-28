"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { savePatientHomePracticeTargetAction } from "@/app/app/doctor/patient-home/patientHomeDoctorSettingsActions";

export function PatientHomePracticeTargetPanel(props: { initialTarget: number }) {
  const [value, setValue] = useState(String(props.initialTarget));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setMessage(null);
    setError(null);
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      setError("Введите число от 1 до 10.");
      return;
    }
    setPending(true);
    try {
      const res = await savePatientHomePracticeTargetAction(n);
      if (!res.ok) {
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
      aria-labelledby="patient-home-practice-target-heading"
    >
      <h2 id="patient-home-practice-target-heading" className="text-base font-semibold">
        Цель практик на главной
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Сколько коротких практик в день показывать как цель прогресса (1–10). По умолчанию 3.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Цель в день</span>
          <Input
            type="number"
            min={1}
            max={10}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24"
            aria-label="Целевое число практик в день"
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
