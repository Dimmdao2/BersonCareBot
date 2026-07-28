'use client';

import { useState, useTransition } from 'react';
import { apiJson } from '@/shared/lib/apiJson';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';

export type AppointmentReminderSettingsSectionProps = {
  initialEnabled: boolean;
  initialOffsetsMinutes: number[];
  settingsEndpoint: '/api/admin/settings';
};

function formatOffset(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) return `за ${minutes / 60} ч`;
  return `за ${minutes} мин`;
}

function parseOffsetsText(raw: string): { offsets: number[]; error: string | null } {
  const offsets: number[] = [];
  for (const line of raw
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)) {
    const value = Number(line);
    if (!Number.isSafeInteger(value) || value <= 0) {
      return {
        offsets: [],
        error: `Некорректное значение: "${line}". Введите положительные целые числа (минуты).`,
      };
    }
    offsets.push(value);
  }
  return { offsets, error: null };
}

export function AppointmentReminderSettingsSection({
  initialEnabled,
  initialOffsetsMinutes,
  settingsEndpoint,
}: AppointmentReminderSettingsSectionProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [offsets, setOffsets] = useState(initialOffsetsMinutes);
  const [offsetsText, setOffsetsText] = useState(initialOffsetsMinutes.join('\n'));
  const [editMode, setEditMode] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function patch(key: string, value: unknown): Promise<void> {
    await apiJson(settingsEndpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: { value } }),
    });
  }

  function setReminderEnabled(value: boolean) {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await patch('doctor_appointment_reminder_enabled', value);
        setEnabled(value);
        setSaved(true);
      } catch {
        setError('Не удалось сохранить настройку');
      }
    });
  }

  function saveOffsets() {
    const parsed = parseOffsetsText(offsetsText);
    setSaved(false);
    setError(parsed.error);
    if (parsed.error) return;
    startTransition(async () => {
      try {
        await patch('doctor_appointment_reminder_offsets_minutes', parsed.offsets);
        setOffsets(parsed.offsets);
        setEditMode(false);
        setSaved(true);
      } catch {
        setError('Не удалось сохранить время напоминаний');
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
          onCheckedChange={setReminderEnabled}
          disabled={isPending}
        />
        {enabled ? (
          <div className="flex flex-col gap-2">
            {!editMode ? (
              <>
                {offsets.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {offsets.map((minutes, index) => (
                      <span
                        key={`${minutes}-${index}`}
                        className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium"
                      >
                        {formatOffset(minutes)}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOffsetsText(offsets.join('\n'));
                      setEditMode(true);
                      setError(null);
                    }}
                    disabled={isPending}
                  >
                    Изменить время напоминаний
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Введите смещения в минутах до записи, по одному на строку. Например: 1440 (24 ч),
                  120 (2 ч).
                </p>
                <Textarea
                  value={offsetsText}
                  onChange={(event) => setOffsetsText(event.target.value)}
                  placeholder={'1440\n120'}
                  disabled={isPending}
                  className="max-w-xs font-mono text-sm"
                  rows={4}
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={saveOffsets} disabled={isPending}>
                    {isPending ? 'Сохранение…' : 'Сохранить'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditMode(false);
                      setError(null);
                    }}
                    disabled={isPending}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {saved ? <span className="text-sm text-green-600">Сохранено</span> : null}
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </DoctorSection>
  );
}
