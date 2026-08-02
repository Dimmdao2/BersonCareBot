'use client';

import { useEffect, useState, useTransition } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/patient/primitives/select';
import { REMINDER_SCHEDULE_PRESETS } from '@/modules/booking-notifications/appointmentReminderPresets';

type Preference = {
  allowedPresetIds: string[];
  presetId: string | null;
};

export function AppointmentReminderPreference({ appointmentId }: { appointmentId: string }) {
  const [preference, setPreference] = useState<Preference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void fetch(`/api/booking/appointments/${encodeURIComponent(appointmentId)}/reminders`)
      .then(async (response) => (response.ok ? (response.json() as Promise<{ preference: Preference }>) : null))
      .then((data) => setPreference(data?.preference ?? null))
      .catch(() => setPreference(null));
  }, [appointmentId]);

  if (!preference || preference.allowedPresetIds.length === 0) return null;
  const selected = preference.presetId ?? 'disabled';
  return (
    <div className="min-w-48">
      <Select
        value={selected}
        onValueChange={(value) => {
          const presetId = value === 'disabled' ? null : value;
          setError(null);
          startTransition(async () => {
            const response = await fetch(
              `/api/booking/appointments/${encodeURIComponent(appointmentId)}/reminders`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ presetId, mutationId: crypto.randomUUID() }),
              },
            );
            if (!response.ok) {
              setError('Не удалось сохранить напоминания');
              return;
            }
            setPreference((current) => (current ? { ...current, presetId } : current));
          });
        }}
        disabled={pending}
      >
        <SelectTrigger aria-label="Напоминания о записи" className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="disabled">Не напоминать</SelectItem>
          {REMINDER_SCHEDULE_PRESETS.filter((preset) => preference.allowedPresetIds.includes(preset.id)).map(
            (preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.displayLabel}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
