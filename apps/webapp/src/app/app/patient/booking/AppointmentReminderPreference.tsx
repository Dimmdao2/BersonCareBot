'use client';

import { useEffect, useState, useTransition } from 'react';
import { Checkbox } from '@/shared/ui/patient/primitives/checkbox';
import { Label } from '@/shared/ui/patient/primitives/label';
import { patientCaptionTextClass, patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import { usePatientTerms } from '@/shared/ui/patient/organization/PatientOrganizationContext';
import { notificationText } from '@/shared/notifications/notificationText';
import type { AppointmentReminderPreference as Preference } from '@/modules/booking-notifications/appointmentReminderSchedule';

function pluralize(value: number, one: string, few: string, many: string): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = value % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatOffset(offsetMinutes: number): string {
  if (offsetMinutes % (24 * 60) === 0) {
    const days = offsetMinutes / (24 * 60);
    return `За ${days} ${pluralize(days, 'день', 'дня', 'дней')}`;
  }
  if (offsetMinutes % 60 === 0) {
    const hours = offsetMinutes / 60;
    return `За ${hours} ${pluralize(hours, 'час', 'часа', 'часов')}`;
  }
  return `За ${offsetMinutes} ${pluralize(offsetMinutes, 'минуту', 'минуты', 'минут')}`;
}

export function AppointmentReminderPreference({ appointmentId }: { appointmentId: string }) {
  const { appointmentPrepositional } = usePatientTerms();
  const [preference, setPreference] = useState<Preference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void fetch(`/api/booking/appointments/${encodeURIComponent(appointmentId)}/reminders`)
      .then(async (response) =>
        response.ok ? (response.json() as Promise<{ preference: Preference }>) : null,
      )
      .then((data) => setPreference(data?.preference ?? null))
      .catch(() => setPreference(null));
  }, [appointmentId]);

  if (!preference || preference.availableOffsetsMinutes.length === 0) return null;

  const save = (selectedOffsetsMinutes: number[]) => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/booking/appointments/${encodeURIComponent(appointmentId)}/reminders`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offsetsMinutes: selectedOffsetsMinutes,
            mutationId: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) {
        setError(notificationText.settingsReminderSettingsSaveFailed);
        return;
      }
      setPreference((current) => (current ? { ...current, selectedOffsetsMinutes } : current));
    });
  };

  return (
    <div className="min-w-48" aria-label={`Напоминания о ${appointmentPrepositional}`}>
      <div className="flex flex-col gap-2">
        {preference.availableOffsetsMinutes.map((offsetMinutes) => {
          const checked = preference.selectedOffsetsMinutes.includes(offsetMinutes);
          return (
            <Label key={offsetMinutes} className={patientCaptionTextClass}>
              <Checkbox
                checked={checked}
                disabled={pending}
                onCheckedChange={(value) =>
                  save(
                    value === true
                      ? [...preference.selectedOffsetsMinutes, offsetMinutes]
                      : preference.selectedOffsetsMinutes.filter(
                          (offset) => offset !== offsetMinutes,
                        ),
                  )
                }
              />
              {formatOffset(offsetMinutes)}
            </Label>
          );
        })}
      </div>
      {error ? (
        <p className={`mt-1 patient-text-danger ${patientMutedTextClass}`}>{error}</p>
      ) : null}
    </div>
  );
}
