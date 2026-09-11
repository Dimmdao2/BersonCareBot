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

/** PAY-APPT-08: верхняя граница ХРАНЕНИЯ (год в минутах), а не продуктовый лимит.
 * Владелец запретил искусственный максимум — врач вправе ждать предоплату сколько нужно. */
const PREPAYMENT_WAIT_MAX_MINUTES = 525_600;

type Props = {
  availabilityHorizonDays: number;
  prepaymentWaitMinutes: number;
};

export function BookingRulesPageClient({
  availabilityHorizonDays: initialAvailabilityHorizonDays,
  prepaymentWaitMinutes: initialPrepaymentWaitMinutes,
}: Props) {
  const [availabilityHorizonDays, setAvailabilityHorizonDays] = useState(
    String(initialAvailabilityHorizonDays),
  );
  const [prepaymentWaitMinutes, setPrepaymentWaitMinutes] = useState(
    String(initialPrepaymentWaitMinutes),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prepaymentSaveError, setPrepaymentSaveError] = useState<string | null>(null);
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

  function savePrepaymentWait() {
    const parsed = Number(prepaymentWaitMinutes);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > PREPAYMENT_WAIT_MAX_MINUTES) {
      setPrepaymentSaveError('Укажите целое число минут, не меньше 1');
      return;
    }
    setPrepaymentSaveError(null);
    startTransition(async () => {
      const ok = await patchAdminSetting('booking_prepayment_wait_minutes', parsed);
      if (!ok) setPrepaymentSaveError('Не удалось сохранить');
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

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Оплата записи</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="max-w-sm space-y-3">
          <Label htmlFor="booking-prepayment-wait-minutes">
            Сколько ждать предоплату, минут
          </Label>
          <Input
            id="booking-prepayment-wait-minutes"
            type="number"
            min={1}
            max={PREPAYMENT_WAIT_MAX_MINUTES}
            step={1}
            value={prepaymentWaitMinutes}
            onChange={(event) => setPrepaymentWaitMinutes(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Пока идёт этот срок, слот занят и запись ждёт оплаты. Если предоплата не пришла, запись
            отменяется, а время освобождается.
          </p>
          <Button type="button" size="sm" disabled={pending} onClick={savePrepaymentWait}>
            Сохранить
          </Button>
          {prepaymentSaveError ? (
            <p className="text-sm text-destructive">{prepaymentSaveError}</p>
          ) : null}
        </div>
      </DoctorSection>

      <BookingPoliciesSection />
      <BookingEventNotificationsSection layout="compact" />
    </div>
  );
}
