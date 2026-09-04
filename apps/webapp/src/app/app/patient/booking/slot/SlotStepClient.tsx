'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/patient/primitives/button';
import { routePaths } from '@/app-layer/routes/paths';
import { patientButtonPrimaryClass } from '@/shared/ui/patient/patientVisual';
import type { BookingCategory, BookingSlot } from '@/modules/patient-booking/types';
import { BookingCalendar } from '../../cabinet/BookingCalendar';
import { BookingSlotList } from '../../cabinet/BookingSlotList';
import type { BookingSelection } from '../../cabinet/useBookingSelection';
import { useBookingSlots } from '../../cabinet/useBookingSlots';
import { AppContentLoading } from '@/shared/ui/AppContentLoading';

type InPersonProps = {
  type: 'in_person';
  cityCode: string;
  cityTitle: string;
  serviceTitle: string;
  durationMinutes: number;
  priceMinor?: number;
  /** Org-scoped scheduling setting, resolved by the server page. */
  maxConsecutiveSlotHours?: number;
  appDisplayTimeZone: string;
  branchId?: string;
  serviceId?: string;
  orgSlug?: string;
};

type OnlineProps = {
  type: 'online';
  category: string;
  appDisplayTimeZone: string;
  maxConsecutiveSlotHours?: number;
};

type SlotStepOptions = {
  confirmBasePath?: string;
  slotsApiPath?: string;
  rescheduleBookingId?: string;
};

type Props = (InPersonProps | OnlineProps) & SlotStepOptions;

function todayIsoDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildConfirmQuery(
  props: Props,
  date: string,
  slot: BookingSlot,
  slotCount: number,
): string {
  const q = new URLSearchParams();
  q.set('type', props.type);
  q.set('date', date);
  q.set('slot', slot.startAt);
  q.set('slotEnd', slot.endAt);
  q.set('slotCount', String(slotCount));
  if (props.type === 'in_person') {
    q.set('cityCode', props.cityCode);
    q.set('cityTitle', props.cityTitle);
    if (!props.branchId || !props.serviceId) return '';
    q.set('branchId', props.branchId);
    q.set('serviceId', props.serviceId);
    q.set('serviceTitle', props.serviceTitle);
    q.set('durationMinutes', String(props.durationMinutes));
    q.set('priceMinor', String(props.priceMinor ?? 0));
    if (props.orgSlug) q.set('orgSlug', props.orgSlug);
  } else {
    q.set('category', props.category);
  }
  if (props.rescheduleBookingId) {
    q.set('rescheduleBookingId', props.rescheduleBookingId);
  }
  return q.toString();
}

export function SlotStepClient(props: Props) {
  const router = useRouter();

  const selection: BookingSelection = useMemo(() => {
    if (props.type === 'online') {
      return {
        type: 'online',
        category: props.category as BookingCategory,
      };
    }
    return {
      type: 'in_person',
      cityCode: props.cityCode,
      cityTitle: props.cityTitle,
      branchId: props.branchId ?? '',
      serviceId: props.serviceId ?? '',
      serviceTitle: props.serviceTitle,
      ...(props.orgSlug ? { orgSlug: props.orgSlug } : {}),
    };
  }, [props]);

  const confirmBase = props.confirmBasePath ?? routePaths.bookingNewConfirm;
  const [slotCount, setSlotCount] = useState(1);
  const slotsState = useBookingSlots(selection, slotCount, props.slotsApiPath);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);

  const today = todayIsoDate();
  const firstSelectableDate = useMemo(
    () => slotsState.availableDates.find((date) => date >= today) ?? null,
    [slotsState.availableDates, today],
  );
  const effectiveDate = selectedDate ?? firstSelectableDate;
  const unitMinutes = props.type === 'in_person' ? props.durationMinutes : 60;
  const maxConsecutiveMinutes = Math.max(60, Math.round((props.maxConsecutiveSlotHours ?? 3) * 60));
  const canExtend = (slotCount + 1) * unitMinutes <= maxConsecutiveMinutes;
  const currentSlots = effectiveDate ? slotsState.slotsForDate(effectiveDate) : [];

  // If a fresh availability read no longer contains the selected start, drop the selection.
  // Adjust during render (React re-renders immediately) rather than in an effect; the guard
  // clears itself once selectedSlot becomes null, so it cannot loop.
  if (
    !slotsState.loading &&
    selectedSlot &&
    effectiveDate &&
    !currentSlots.some((slot) => slot.startAt === selectedSlot.startAt)
  ) {
    setSelectedSlot(null);
    setSlotCount(1);
  }

  const canContinue = Boolean(effectiveDate && selectedSlot);

  return (
    <div className="flex flex-col gap-4">
      <BookingCalendar
        availableDates={slotsState.availableDates}
        selectedDate={effectiveDate}
        onSelectDate={(date) => {
          setSelectedDate(date);
          setSelectedSlot(null);
          setSlotCount(1);
        }}
      />

      {slotsState.loading ? <AppContentLoading className="py-4" /> : null}
      {slotsState.error ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive">{slotsState.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void slotsState.reload()}
          >
            Повторить
          </Button>
        </div>
      ) : null}

      {effectiveDate ? (
        <BookingSlotList
          slots={currentSlots}
          selectedSlot={selectedSlot}
          onSelectSlot={(slot) => {
            if (selectedSlot && slot.startAt === selectedSlot.endAt && canExtend) {
              setSlotCount((count) => count + 1);
              setSelectedSlot({
                startAt: selectedSlot.startAt,
                endAt: new Date(
                  new Date(selectedSlot.endAt).getTime() + unitMinutes * 60_000,
                ).toISOString(),
              });
              return;
            }
            setSlotCount(1);
            setSelectedSlot(slot);
          }}
          disabledSlotStarts={
            selectedSlot
              ? new Set(
                  currentSlots.flatMap((slot) =>
                    (slot.startAt === selectedSlot.endAt && canExtend) ||
                    slot.startAt === selectedSlot.startAt
                      ? []
                      : [slot.startAt],
                  ),
                )
              : undefined
          }
          appDisplayTimeZone={props.appDisplayTimeZone}
        />
      ) : null}

      <Button
        type="button"
        className={patientButtonPrimaryClass}
        disabled={!canContinue || !effectiveDate || !selectedSlot}
        onClick={() => {
          if (!effectiveDate || !selectedSlot) return;
          const qs = buildConfirmQuery(props, effectiveDate, selectedSlot, slotCount);
          router.push(`${confirmBase}?${qs}`);
        }}
      >
        Продолжить
      </Button>
    </div>
  );
}
