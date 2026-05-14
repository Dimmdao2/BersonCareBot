"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { savePatientHomeRepeatCooldownsAction } from "@/app/app/doctor/patient-home/patientHomeDoctorSettingsActions";
import {
  PATIENT_REPEAT_COOLDOWN_MINUTES_MAX,
  PATIENT_REPEAT_COOLDOWN_MINUTES_MIN,
  clampRepeatCooldownMinutes,
} from "@/modules/patient-home/patientHomeRepeatCooldownSettings";

const MINUTE_OPTIONS: number[] = Array.from(
  { length: (PATIENT_REPEAT_COOLDOWN_MINUTES_MAX - PATIENT_REPEAT_COOLDOWN_MINUTES_MIN) / 5 + 1 },
  (_, i) => PATIENT_REPEAT_COOLDOWN_MINUTES_MIN + i * 5,
);

function minuteTriggerLabel(valueStr: string): string {
  const n = Number.parseInt(valueStr, 10);
  if (!Number.isFinite(n)) return valueStr;
  return `${n} мин`;
}

type Props = {
  initialWarmupMinutes: number;
  initialPlanItemMinutes: number;
  initialSkipToNext: boolean;
};

export function PatientHomeRepeatCooldownPanel(props: Props) {
  const router = useRouter();
  const minuteOptions = useMemo(() => {
    const opts = new Set(MINUTE_OPTIONS);
    opts.add(clampRepeatCooldownMinutes(props.initialWarmupMinutes));
    opts.add(clampRepeatCooldownMinutes(props.initialPlanItemMinutes));
    return [...opts].sort((a, b) => a - b);
  }, [props.initialWarmupMinutes, props.initialPlanItemMinutes]);
  const [warmupMin, setWarmupMin] = useState(String(props.initialWarmupMinutes));
  const [planMin, setPlanMin] = useState(String(props.initialPlanItemMinutes));
  const [skipNext, setSkipNext] = useState(props.initialSkipToNext);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setMessage(null);
    setError(null);
    const w = Number.parseInt(warmupMin, 10);
    const p = Number.parseInt(planMin, 10);
    if (
      !Number.isFinite(w) ||
      w < PATIENT_REPEAT_COOLDOWN_MINUTES_MIN ||
      w > PATIENT_REPEAT_COOLDOWN_MINUTES_MAX ||
      !Number.isFinite(p) ||
      p < PATIENT_REPEAT_COOLDOWN_MINUTES_MIN ||
      p > PATIENT_REPEAT_COOLDOWN_MINUTES_MAX
    ) {
      setError("Выберите паузу из списка.");
      return;
    }
    setPending(true);
    try {
      const result = await savePatientHomeRepeatCooldownsAction({
        warmupRepeatMinutes: w,
        planItemRepeatMinutes: p,
        skipWarmupToNextAvailable: skipNext,
      });
      if (!result.ok) {
        setError(result.error === "forbidden" ? "Нет доступа." : "Не удалось сохранить.");
        return;
      }
      setMessage("Сохранено");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-labelledby="patient-home-repeat-cooldown-heading"
    >
      <h2 id="patient-home-repeat-cooldown-heading" className="text-base font-semibold">
        Паузы повтора
      </h2>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Разминка (мин)</span>
          <Select value={warmupMin} onValueChange={(v) => { if (v) setWarmupMin(v); }} disabled={pending}>
            <SelectTrigger className="w-40" displayLabel={minuteTriggerLabel(warmupMin)} />
            <SelectContent className="max-h-72">
              {minuteOptions.map((m) => (
                <SelectItem key={m} value={String(m)} label={`${m} мин`}>
                  {m} мин
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Пункты плана (мин)</span>
          <Select value={planMin} onValueChange={(v) => { if (v) setPlanMin(v); }} disabled={pending}>
            <SelectTrigger className="w-40" displayLabel={minuteTriggerLabel(planMin)} />
            <SelectContent className="max-h-72">
              {minuteOptions.map((m) => (
                <SelectItem key={m} value={String(m)} label={`${m} мин`}>
                  {m} мин
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border"
            checked={skipNext}
            onChange={(e) => setSkipNext(e.target.checked)}
            disabled={pending}
            aria-label="Показывать следующую доступную разминку дня"
          />
          <span>Следующая разминка сразу</span>
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
