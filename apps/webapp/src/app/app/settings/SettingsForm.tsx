"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SettingsFormProps = {
  patientLabel: string;
  smsFallbackEnabled: boolean;
};

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

export function SettingsForm({ patientLabel, smsFallbackEnabled }: SettingsFormProps) {
  const [label, setLabel] = useState(patientLabel);
  const [smsFallback, setSmsFallback] = useState(smsFallbackEnabled);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch("/api/doctor/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "patient_label", value: { value: label } }),
          }),
          fetch("/api/doctor/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "sms_fallback_enabled", value: { value: smsFallback } }),
          }),
        ]);
        if (!r1.ok || !r2.ok) {
          setError("Не удалось сохранить настройки");
          return;
        }
        setSaved(true);
      } catch {
        setError("Ошибка при сохранении");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Настройки кабинета</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="patient-label-select">
            Как называть пациента
          </label>
          <Select value={label} onValueChange={(v) => { if (v) setLabel(v); }}>
            <SelectTrigger id="patient-label-select" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="пациент">Пациент</SelectItem>
              <SelectItem value="клиент">Клиент</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Используется в интерфейсе кабинета
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">SMS fallback</span>
            <span className="text-xs text-muted-foreground">
              Отправлять SMS, если нет подтверждения через мессенджер
            </span>
          </div>
          <Toggle checked={smsFallback} onChange={setSmsFallback} disabled={isPending} />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Сохранение..." : "Сохранить"}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
