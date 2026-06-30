"use client";

import { useState, useTransition } from "react";
import { apiJson } from "@/shared/lib/apiJson";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { LabeledSwitch } from "@/shared/ui/doctor/primitives/labeled-switch";

export type AppointmentReminderSettingsSectionProps = {
  initialEnabled: boolean;
  initialOffsetsMinutes: number[];
};

function formatOffset(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `за ${hours} ч`;
  }
  return `за ${minutes} мин`;
}

function parseOffsetsText(raw: string): { offsets: number[]; error: string | null } {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const offsets: number[] = [];
  for (const line of lines) {
    const n = Number(line);
    if (!Number.isInteger(n) || n <= 0) {
      return {
        offsets: [],
        error: `Некорректное значение: "${line}". Введите положительные целые числа (минуты).`,
      };
    }
    offsets.push(n);
  }
  return { offsets, error: null };
}

export function AppointmentReminderSettingsSection({
  initialEnabled,
  initialOffsetsMinutes,
}: AppointmentReminderSettingsSectionProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [offsets, setOffsets] = useState<number[]>(initialOffsetsMinutes);
  const [editMode, setEditMode] = useState(false);
  const [offsetsText, setOffsetsText] = useState(initialOffsetsMinutes.join("\n"));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function patchDoctorSetting(key: string, value: unknown): Promise<void> {
    await apiJson("/api/doctor/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: { value } }),
    });
  }

  function handleToggleEnabled(v: boolean) {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await patchDoctorSetting("doctor_appointment_reminder_enabled", v);
        setEnabled(v);
        setSaved(true);
      } catch {
        setError("Не удалось сохранить настройку");
      }
    });
  }

  function handleEditOpen() {
    setOffsetsText(offsets.join("\n"));
    setEditMode(true);
    setSaved(false);
    setError(null);
  }

  function handleEditCancel() {
    setEditMode(false);
    setError(null);
  }

  function handleSaveOffsets() {
    setSaved(false);
    setError(null);
    const { offsets: parsed, error: parseError } = parseOffsetsText(offsetsText);
    if (parseError) {
      setError(parseError);
      return;
    }
    startTransition(async () => {
      try {
        await patchDoctorSetting("doctor_appointment_reminder_offsets_minutes", parsed);
        setOffsets(parsed);
        setEditMode(false);
        setSaved(true);
      } catch {
        setError("Не удалось сохранить смещения напоминаний");
      }
    });
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Напоминания о записях</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="flex flex-col gap-4">
        <LabeledSwitch
          label="Отправлять напоминания клиентам о записи"
          checked={enabled}
          onCheckedChange={handleToggleEnabled}
          disabled={isPending}
        />

        {enabled && (
          <div className="flex flex-col gap-2">
            {!editMode ? (
              <>
                {offsets.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {offsets.map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium"
                      >
                        {formatOffset(m)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Смещения не заданы.</p>
                )}
                <div>
                  <Button variant="outline" size="sm" onClick={handleEditOpen} disabled={isPending}>
                    Изменить время напоминаний
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Введите смещения в минутах до записи, по одному на строку. Например: 1440 (24 ч), 120 (2 ч).
                </p>
                <Textarea
                  value={offsetsText}
                  onChange={(e) => setOffsetsText(e.target.value)}
                  placeholder={"1440\n120"}
                  disabled={isPending}
                  className="max-w-xs font-mono text-sm"
                  rows={4}
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleSaveOffsets} disabled={isPending}>
                    {isPending ? "Сохранение…" : "Сохранить"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleEditCancel} disabled={isPending}>
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {saved && <span className="text-sm text-green-600">Сохранено</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </DoctorSection>
  );
}
