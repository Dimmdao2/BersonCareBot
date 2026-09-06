'use client';

import { Badge } from '@/shared/ui/patient/primitives/badge';
import { Button } from '@/shared/ui/patient/primitives/button';
import type { BookingSlot } from '@/modules/patient-booking/types';
import { formatBookingTimeShortRu } from '@/shared/lib/formatBusinessDateTime';
import { resolveAppointmentTimeZone } from '@/shared/lib/appointmentZoneOffset';
import { AppointmentZoneOffsetWarning } from '@/shared/ui/patient/AppointmentZoneOffsetWarning';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';

type Props = {
  slots: BookingSlot[];
  selectedSlot: BookingSlot | null;
  onSelectSlot: (slot: BookingSlot) => void;
  disabledSlotStarts?: ReadonlySet<string>;
  /** IANA-таймзона отображения (`system_settings.app_display_timezone`). */
  appDisplayTimeZone: string;
  /** Канонический IANA-пояс филиала; `null`/не передан — слоты остаются в `appDisplayTimeZone`. */
  branchTimeZone?: string | null;
};

export function BookingSlotList({
  slots,
  selectedSlot,
  onSelectSlot,
  appDisplayTimeZone,
  branchTimeZone,
  disabledSlotStarts,
}: Props) {
  const displayTimeZone = resolveAppointmentTimeZone(branchTimeZone, appDisplayTimeZone);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Выбор времени</h3>
        <Badge variant="outline">Шаг 4</Badge>
      </div>
      {slots.length === 0 ? (
        <p className={patientMutedTextClass}>На выбранную дату слоты не найдены.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => {
            const isActive =
              selectedSlot?.startAt === slot.startAt && selectedSlot?.endAt === slot.endAt;
            return (
              <Button
                key={`${slot.startAt}-${slot.endAt}`}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                disabled={disabledSlotStarts?.has(slot.startAt)}
                onClick={() => onSelectSlot(slot)}
              >
                {formatBookingTimeShortRu(slot.startAt, displayTimeZone)} -{' '}
                {formatBookingTimeShortRu(slot.endAt, displayTimeZone)}
                <AppointmentZoneOffsetWarning iso={slot.startAt} branchTimeZone={branchTimeZone} />
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
