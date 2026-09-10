'use client';

import { useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Switch } from '@/shared/ui/doctor/primitives/switch';

export function ClinicStaffSecuritySection({ initialRequired }: { initialRequired: boolean }) {
  const [required, setRequired] = useState(initialRequired);
  const [pending, startTransition] = useTransition();

  const onCheckedChange = (next: boolean) => {
    startTransition(async () => {
      const response = await fetch('/api/doctor/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'doctor_staff_second_factor_required',
          value: { value: next },
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (!response.ok || !body?.ok) {
        toast.error('Не удалось сохранить настройку безопасности');
        return;
      }
      setRequired(next);
      toast.success('Настройка безопасности сохранена');
    });
  };

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Безопасность входа</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="clinic-staff-second-factor">Требовать второй фактор при входе</Label>
          <p className="text-sm text-muted-foreground">
            После пароля сотрудники используют личный TOTP или код на подтверждённый email.
          </p>
        </div>
        <Switch
          id="clinic-staff-second-factor"
          checked={required}
          disabled={pending}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </DoctorSection>
  );
}
