'use client';

import { useState, type ReactNode } from 'react';
import { History } from 'lucide-react';
import { Badge } from '@/shared/ui/patient/primitives/badge';
import { Button } from '@/shared/ui/patient/primitives/button';
import { PatientModal } from '@/shared/ui/patient/PatientModal';
import { cn } from '@/lib/utils';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import { formatBookingDateTimeMediumRu } from '@/shared/lib/formatBusinessDateTime';
import { resolveAppointmentTimeZone } from '@/shared/lib/appointmentZoneOffset';
import { AppointmentZoneOffsetWarning } from '@/shared/ui/patient/AppointmentZoneOffsetWarning';
import { usePatientTerms } from '@/shared/ui/patient/organization/PatientOrganizationContext';
import {
  patientListItemClass,
  patientActionTextClass,
  patientCaptionTextClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';
import {
  bookingProvenancePrefix,
  nativeBookingSubtitle,
} from '@/app/app/patient/cabinet/patientBookingLabels';

type Props = {
  items: PatientBookingRecord[];
  appDisplayTimeZone: string;
};

function nativePastStatusRight(
  status: PatientBookingRecord['status'],
  cancelReason: string | null,
): ReactNode {
  if (status === 'confirmed') return null;
  if (status === 'cancelled') {
    const label =
      cancelReason === 'prepayment_expired' ? 'Предоплата не внесена' : 'Отменена';
    return (
      <span className={cn('shrink-0 patient-text-danger', patientActionTextClass)}>{label}</span>
    );
  }
  if (status === 'completed') return <Badge variant="outline">Завершена</Badge>;
  if (status === 'rescheduled') return <Badge variant="outline">Перенесена</Badge>;
  if (status === 'no_show') return <Badge variant="outline">Неявка</Badge>;
  if (status === 'failed_sync') return <Badge variant="destructive">Ошибка</Badge>;
  if (status === 'cancel_failed')
    return <Badge variant="destructive">Не удалось отменить</Badge>;
  if (status === 'cancelling') return <Badge variant="secondary">Отмена…</Badge>;
  if (status === 'creating') return <Badge variant="secondary">Создается</Badge>;
  return null;
}

function PastList({ items, appDisplayTimeZone }: Props) {
  const terms = usePatientTerms();
  if (items.length === 0) {
    return <p className={patientMutedTextClass}>Пока пусто.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((booking) => {
        const branchTimeZone = booking.canonicalInPersonContext?.timezone;
        const displayTimeZone = resolveAppointmentTimeZone(branchTimeZone, appDisplayTimeZone);
        return (
          <li
            key={booking.id}
            className={cn(
              patientListItemClass,
              'flex items-center justify-between gap-2 !px-3 !py-2',
            )}
          >
            <div className="min-w-0">
              <p className={cn('flex items-center gap-1.5 truncate', patientActionTextClass)}>
                <span>{formatBookingDateTimeMediumRu(booking.slotStart, displayTimeZone)}</span>
                <AppointmentZoneOffsetWarning iso={booking.slotStart} branchTimeZone={branchTimeZone} />
              </p>
              <p className={cn(patientCaptionTextClass, 'truncate')}>
                {bookingProvenancePrefix(booking)}
                {nativeBookingSubtitle(booking, terms)}
              </p>
            </div>
            {nativePastStatusRight(booking.status, booking.cancelReason)}
          </li>
        );
      })}
    </ul>
  );
}

export function BookingPastHistorySection({ items, appDisplayTimeZone }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className={patientSectionSurfaceClass}>
      <div className="flex min-w-0 items-center gap-3">
        <History className="size-5 shrink-0 patient-text-accent" aria-hidden />
        <h3 className={cn(patientSectionTitleClass, 'min-w-0')}>История посещений</h3>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        Открыть историю
      </Button>
      <PatientModal open={open} onClose={() => setOpen(false)} title="История посещений" size="lg">
        <PastList items={items} appDisplayTimeZone={appDisplayTimeZone} />
      </PatientModal>
    </div>
  );
}
