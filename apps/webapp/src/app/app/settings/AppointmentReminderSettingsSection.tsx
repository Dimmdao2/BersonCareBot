'use client';

import { useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { apiJson } from '@/shared/lib/apiJson';
import {
  isAppointmentReminderPresetId,
  REMINDER_SCHEDULE_PRESETS,
  type AppointmentReminderSpecialistSettings,
} from '@/modules/booking-notifications/appointmentReminderPresets';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';

export function AppointmentReminderSettingsSection({
  initialSettings,
}: {
  initialSettings: AppointmentReminderSpecialistSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [pending, startTransition] = useTransition();
  const save = (next: AppointmentReminderSpecialistSettings) => {
    startTransition(async () => {
      try {
        const response = (await apiJson('/api/doctor/appointment-reminder-presets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        })) as { settings: AppointmentReminderSpecialistSettings };
        setSettings(response.settings);
        toast.success('Сохранено');
      } catch {
        toast.error('Не удалось сохранить настройки напоминаний');
      }
    });
  };
  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Напоминания о записях</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Выберите варианты, которые клиент сможет изменить для своей подтверждённой записи.
        </p>
        {REMINDER_SCHEDULE_PRESETS.map((preset) => {
          const checked = settings.allowedPresetIds.includes(preset.id);
          return (
            <Label key={preset.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={checked}
                disabled={pending}
                onCheckedChange={(value) => {
                  const allowedPresetIds =
                    value === true
                      ? [...settings.allowedPresetIds, preset.id]
                      : settings.allowedPresetIds.filter((id) => id !== preset.id);
                  save({
                    allowedPresetIds,
                    defaultPresetId:
                      settings.defaultPresetId !== null &&
                      allowedPresetIds.includes(settings.defaultPresetId)
                        ? settings.defaultPresetId
                        : null,
                  });
                }}
              />
              {preset.displayLabel}
            </Label>
          );
        })}
        <DoctorField label="Вариант по умолчанию" htmlFor="appointment-reminder-default">
          <Select
            value={settings.defaultPresetId ?? 'disabled'}
            disabled={pending}
            onValueChange={(value) => {
              const defaultPresetId = isAppointmentReminderPresetId(value) ? value : null;
              save({ ...settings, defaultPresetId });
            }}
          >
            <SelectTrigger
              id="appointment-reminder-default"
              displayLabel={
                settings.defaultPresetId === null
                  ? 'Не напоминать'
                  : REMINDER_SCHEDULE_PRESETS.find(
                      (preset) => preset.id === settings.defaultPresetId,
                    )?.displayLabel
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">Не напоминать</SelectItem>
              {REMINDER_SCHEDULE_PRESETS.filter((preset) =>
                settings.allowedPresetIds.includes(preset.id),
              ).map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.displayLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DoctorField>
      </div>
    </DoctorSection>
  );
}
