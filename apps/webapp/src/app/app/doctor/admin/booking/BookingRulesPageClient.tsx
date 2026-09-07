'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { BookingPoliciesSection } from '@/app/app/settings/BookingPoliciesSection';
import { BookingEventNotificationsSection } from '@/app/app/settings/BookingEventNotificationsSection';
import { patchAdminSetting } from '@/app/app/settings/patchAdminSetting';

type Props = {
  availabilityHorizonDays: number;
};

export function BookingRulesPageClient({
  availabilityHorizonDays: initialAvailabilityHorizonDays,
}: Props) {
  const [availabilityHorizonDays, setAvailabilityHorizonDays] = useState(
    String(initialAvailabilityHorizonDays),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveAvailabilityHorizon() {
    const parsed = Number(availabilityHorizonDays);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 92) {
      setSaveError('Укажите целое число от 1 до 92');
      return;
    }
    setSaveError(null);
    startTransition(async () => {
      const ok = await patchAdminSetting('booking_availability_horizon_days', parsed);
      if (!ok) setSaveError('Не удалось сохранить');
    });
  }

  return (
    <div className="space-y-4">
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Календарь записи</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="max-w-sm space-y-3">
          <Label htmlFor="booking-availability-horizon-days">
            На сколько дней вперёд показывать календарь записи
          </Label>
          <Input
            id="booking-availability-horizon-days"
            type="number"
            min={1}
            max={92}
            step={1}
            value={availabilityHorizonDays}
            onChange={(event) => setAvailabilityHorizonDays(event.target.value)}
          />
          <Button type="button" size="sm" disabled={pending} onClick={saveAvailabilityHorizon}>
            Сохранить
          </Button>
          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
        </div>
      </DoctorSection>

      <BookingPoliciesSection />
      <BookingEventNotificationsSection layout="compact" />
    </div>
  );
}
