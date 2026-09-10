'use client';

import { useState, useTransition } from 'react';
import { apiJson } from '@/shared/lib/apiJson';
import {
  DOCTOR_TODAY_PREFERENCES_KEY,
  type DoctorTodayPeopleListMode,
  type DoctorTodayPreferences,
} from '@/modules/system-settings/doctorTodayPreferences';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

type Props = {
  initialPreferences: DoctorTodayPreferences;
  settingsEndpoint: '/api/admin/settings';
};

export function DoctorTodayPreferencesSection({ initialPreferences, settingsEndpoint }: Props) {
  const { patientGenPlural, supportGroupLabel } = useDoctorPatientTerms();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: DoctorTodayPreferences) {
    setError(null);
    startTransition(async () => {
      try {
        await apiJson(settingsEndpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: DOCTOR_TODAY_PREFERENCES_KEY, value: { value: next } }),
        });
        setPreferences(next);
      } catch {
        setError('Не удалось сохранить настройку');
      }
    });
  }

  function setPeopleListMode(value: DoctorTodayPeopleListMode | null) {
    if (value === null) return;
    save({ ...preferences, peopleListMode: value });
  }

  const peopleListLabels: Record<DoctorTodayPeopleListMode, string> = {
    on_support: supportGroupLabel,
    recent_visits: 'Недавние с визитами',
  };

  return (
    <DoctorSection id="doctor-today-preferences">
      <DoctorSectionHeader>
        <DoctorSectionTitle>Сегодня</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="flex flex-col gap-4">
        <DoctorField label={`Список ${patientGenPlural}`} htmlFor="doctor-today-people-list">
          <Select
            value={preferences.peopleListMode}
            onValueChange={setPeopleListMode}
            disabled={isPending}
          >
            <SelectTrigger
              id="doctor-today-people-list"
              displayLabel={peopleListLabels[preferences.peopleListMode]}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on_support">{supportGroupLabel}</SelectItem>
              <SelectItem value="recent_visits">Недавние с визитами</SelectItem>
            </SelectContent>
          </Select>
        </DoctorField>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </DoctorSection>
  );
}
