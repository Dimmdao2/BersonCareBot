'use client';

import { useState, useTransition } from 'react';
import { apiJson } from '@/shared/lib/apiJson';
import {
  DOCTOR_TODAY_PREFERENCES_KEY,
  type DoctorTodayPeopleListMode,
  type DoctorTodayPreferences,
} from '@/modules/system-settings/doctorTodayPreferences';
import type { ProactiveInsightKind } from '@/modules/doctor-proactive-insights/types';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';

type Props = {
  initialPreferences: DoctorTodayPreferences;
  settingsEndpoint: '/api/admin/settings';
};

const PEOPLE_LIST_LABELS: Record<DoctorTodayPeopleListMode, string> = {
  on_support: 'На сопровождении',
  recent_visits: 'Недавние с визитами',
};

export function DoctorTodayPreferencesSection({ initialPreferences, settingsEndpoint }: Props) {
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

  function setSignalVisible(kind: ProactiveInsightKind, visible: boolean) {
    const selected = new Set(preferences.visibleProactiveInsightKinds);
    if (visible) selected.add(kind);
    else selected.delete(kind);
    save({
      ...preferences,
      visibleProactiveInsightKinds: (
        ['wellbeing_low_streak', 'program_inactivity'] as const
      ).filter((candidate) => selected.has(candidate)),
    });
  }

  function setPeopleListMode(value: DoctorTodayPeopleListMode | null) {
    if (value === null) return;
    save({ ...preferences, peopleListMode: value });
  }

  return (
    <DoctorSection id="doctor-today-preferences">
      <DoctorSectionHeader>
        <DoctorSectionTitle>Сегодня</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="flex flex-col gap-4">
        <LabeledSwitch
          label="Низкое самочувствие"
          checked={preferences.visibleProactiveInsightKinds.includes('wellbeing_low_streak')}
          onCheckedChange={(visible) => setSignalVisible('wellbeing_low_streak', visible)}
          disabled={isPending}
        />
        <LabeledSwitch
          label="Нет отметок по программе"
          checked={preferences.visibleProactiveInsightKinds.includes('program_inactivity')}
          onCheckedChange={(visible) => setSignalVisible('program_inactivity', visible)}
          disabled={isPending}
        />
        <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium">
          Список клиентов
          <Select
            value={preferences.peopleListMode}
            onValueChange={setPeopleListMode}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on_support">На сопровождении</SelectItem>
              <SelectItem value="recent_visits">Недавние с визитами</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </DoctorSection>
  );
}
