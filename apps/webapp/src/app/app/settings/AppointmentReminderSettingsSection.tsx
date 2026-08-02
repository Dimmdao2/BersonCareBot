'use client';

import { useState, useTransition } from 'react';
import { apiJson } from '@/shared/lib/apiJson';
import { REMINDER_SCHEDULE_PRESETS, type AppointmentReminderSpecialistSettings } from '@/modules/booking-notifications/appointmentReminderPresets';
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/doctor/primitives/select';

export function AppointmentReminderSettingsSection({ initialSettings }: { initialSettings: AppointmentReminderSpecialistSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const save = (next: AppointmentReminderSpecialistSettings) => {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const response = await apiJson('/api/doctor/appointment-reminder-presets', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
        }) as { settings: AppointmentReminderSpecialistSettings };
        setSettings(response.settings);
        setSaved(true);
      } catch { setError('Не удалось сохранить настройки напоминаний'); }
    });
  };
  return <DoctorSection>
    <DoctorSectionHeader><DoctorSectionTitle>Напоминания о записях</DoctorSectionTitle></DoctorSectionHeader>
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Выберите варианты, которые клиент сможет изменить для своей подтверждённой записи.</p>
      {REMINDER_SCHEDULE_PRESETS.map((preset) => {
        const checked = settings.allowedPresetIds.includes(preset.id);
        return <Label key={preset.id} className="flex items-center gap-2 text-sm">
          <Checkbox checked={checked} disabled={pending} onCheckedChange={(value) => {
            const allowedPresetIds = value === true ? [...settings.allowedPresetIds, preset.id] : settings.allowedPresetIds.filter((id) => id !== preset.id);
            save({ allowedPresetIds, defaultPresetId: allowedPresetIds.includes(settings.defaultPresetId ?? '') ? settings.defaultPresetId : null });
          }} />
          {preset.displayLabel}
        </Label>;
      })}
      <div className="max-w-sm space-y-1.5">
        <Label>Вариант по умолчанию</Label>
        <Select value={settings.defaultPresetId ?? 'disabled'} disabled={pending} onValueChange={(value) => save({ ...settings, defaultPresetId: value === 'disabled' ? null : value })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="disabled">Не напоминать</SelectItem>
            {REMINDER_SCHEDULE_PRESETS.filter((preset) => settings.allowedPresetIds.includes(preset.id)).map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.displayLabel}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {saved ? <span className="text-sm text-green-600">Сохранено</span> : null}
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </div>
  </DoctorSection>;
}
