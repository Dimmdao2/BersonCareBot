'use client';

import { useState, useTransition } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/doctor/primitives/tabs';
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
import { BookingPackagePastUnlinkSetting } from '@/app/app/settings/BookingPackagePastUnlinkSetting';
import { patchAdminSetting } from '@/app/app/settings/patchAdminSetting';

type Props = {
  allowPastUnlinkPastPackageSessions?: boolean;
  availabilityHorizonDays: number;
};

export function BookingRulesPageClient({
  allowPastUnlinkPastPackageSessions = false,
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

      <Tabs defaultValue="cancellation">
        <TabsList variant="line" className="w-full max-w-md justify-start">
          <TabsTrigger value="cancellation">Отмена</TabsTrigger>
          <TabsTrigger value="reschedule">Перенос</TabsTrigger>
          <TabsTrigger value="notifications">Уведомления</TabsTrigger>
        </TabsList>
        <TabsContent value="cancellation" className="mt-4 space-y-4">
          <BookingPoliciesSection defaultKind="cancellation" lockKind />
          <BookingPackagePastUnlinkSetting allowPastUnlink={allowPastUnlinkPastPackageSessions} />
        </TabsContent>
        <TabsContent value="reschedule" className="mt-4">
          <BookingPoliciesSection defaultKind="reschedule" lockKind />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <BookingEventNotificationsSection layout="compact" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
