'use client';

import { useState } from 'react';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';
import { apiJson } from '@/shared/lib/apiJson';

export type DoctorScreensToggleSectionProps = {
  initialDisabled: boolean;
};

/**
 * VISIBILITY_MODEL_DESIGN_2026-08-04.md §5 — an admin/owner with a bound specialist may disable
 * its own clinical-workspace screens. Deliberately independent from whether clinical.workspace is
 * currently granted: turning this OFF is exactly what removes that capability, so the switch must
 * stay reachable afterwards to turn it back ON.
 */
export function DoctorScreensToggleSection({ initialDisabled }: DoctorScreensToggleSectionProps) {
  const [disabled, setDisabled] = useState(initialDisabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (nextEnabled: boolean) => {
    const nextDisabled = !nextEnabled;
    setSaving(true);
    setError(null);
    try {
      await apiJson<{ ok: boolean }>('/api/doctor/account/doctor-screens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: nextDisabled }),
      });
      setDisabled(nextDisabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Врачебные экраны</DoctorSectionTitle>
      </DoctorSectionHeader>
      <LabeledSwitch
        label="Показывать мне врачебные экраны"
        hint="Отключите, если пользуетесь этим кабинетом только как администратор клиники."
        checked={!disabled}
        onCheckedChange={(checked) => void handleChange(checked)}
        disabled={saving}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </DoctorSection>
  );
}
