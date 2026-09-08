'use client';

import { type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/shared/ui/patient/primitives/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/patient/primitives/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/ui/patient/primitives/collapsible';
import { cn } from '@/lib/utils';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import { formatBookingDateTimeMediumRu } from '@/shared/lib/formatBusinessDateTime';
import { resolveAppointmentTimeZone } from '@/shared/lib/appointmentZoneOffset';
import { AppointmentZoneOffsetWarning } from '@/shared/ui/patient/AppointmentZoneOffsetWarning';
import {
  patientMutedTextClass,
} from '@/shared/ui/patient/patientVisual';
import { bookingProvenancePrefix, nativeBookingSubtitle } from './patientBookingLabels';

type Props = {
  items: PatientBookingRecord[];
  /** IANA-таймзона отображения (`system_settings.app_display_timezone`). */
  appDisplayTimeZone: string;
};

/** В журнале прошлых приёмов не показываем нейтральное «подтверждена»; «отменена» — красным. */
function nativePastStatusRight(status: PatientBookingRecord['status']): ReactNode {
  if (status === 'confirmed') return null;
  if (status === 'cancelled') {
    return <span className="shrink-0 text-sm font-medium text-destructive">Отменена</span>;
  }
  if (status === 'completed') return <Badge variant="outline">Завершена</Badge>;
  if (status === 'rescheduled') return <Badge variant="outline">Перенесена</Badge>;
  if (status === 'no_show') return <Badge variant="outline">Неявка</Badge>;
  if (status === 'failed_sync') return <Badge variant="destructive">Ошибка</Badge>;
  if (status === 'cancel_failed') return <Badge variant="destructive">Не удалось отменить</Badge>;
  if (status === 'cancelling') return <Badge variant="secondary">Отмена…</Badge>;
  if (status === 'creating') return <Badge variant="secondary">Создается</Badge>;
  return null;
}

export function CabinetPastBookings({ items, appDisplayTimeZone }: Props) {
  return (
    <Card>
      <Collapsible defaultOpen={items.length > 0}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left">
            <CardTitle className="text-base">Журнал прошедших приёмов</CardTitle>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-[var(--patient-text-muted)] transition-transform',
                'group-data-[panel-open]:rotate-180',
              )}
            />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-2">
            {items.length === 0 ? (
              <p className={patientMutedTextClass}>Пока пусто.</p>
            ) : (
              items.map((booking) => {
                const branchTimeZone = booking.canonicalInPersonContext?.timezone;
                const displayTimeZone = resolveAppointmentTimeZone(
                  branchTimeZone,
                  appDisplayTimeZone,
                );
                return (
                <Card
                  key={booking.id}
                  variant="list"
                  className={cn(
                    'flex items-center justify-between gap-2 px-3 py-2',
                  )}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <span>{formatBookingDateTimeMediumRu(booking.slotStart, displayTimeZone)}</span>
                      <AppointmentZoneOffsetWarning
                        iso={booking.slotStart}
                        branchTimeZone={branchTimeZone}
                      />
                    </p>
                    <p className={cn(patientMutedTextClass, 'truncate text-xs')}>
                      {bookingProvenancePrefix(booking)}
                      {nativeBookingSubtitle(booking)}
                    </p>
                  </div>
                  {nativePastStatusRight(booking.status)}
                </Card>
                );
              })
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
