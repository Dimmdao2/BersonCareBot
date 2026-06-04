"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import { patientButtonPrimaryClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import type { BookingCategory, BookingSlot } from "@/modules/patient-booking/types";
import { BookingCalendar } from "../../../cabinet/BookingCalendar";
import { BookingSlotList } from "../../../cabinet/BookingSlotList";
import type { BookingSelection } from "../../../cabinet/useBookingSelection";
import { useBookingSlots } from "../../../cabinet/useBookingSlots";

type InPersonProps = {
  type: "in_person";
  cityCode: string;
  cityTitle: string;
  serviceTitle: string;
  durationMinutes: number;
  appDisplayTimeZone: string;
  branchId?: string;
  serviceId?: string;
  /** Legacy reschedule from existing booking */
  branchServiceId?: string;
};

type OnlineProps = {
  type: "online";
  category: string;
  appDisplayTimeZone: string;
};

type SlotStepOptions = {
  confirmBasePath?: string;
  slotsApiPath?: string;
  rescheduleBookingId?: string;
};

type Props = (InPersonProps | OnlineProps) & SlotStepOptions;

function buildConfirmQuery(
  props: Props,
  date: string,
  slot: BookingSlot,
): string {
  const q = new URLSearchParams();
  q.set("type", props.type);
  q.set("date", date);
  q.set("slot", slot.startAt);
  q.set("slotEnd", slot.endAt);
  if (props.type === "in_person") {
    q.set("cityCode", props.cityCode);
    q.set("cityTitle", props.cityTitle);
    if (props.branchId && props.serviceId) {
      q.set("branchId", props.branchId);
      q.set("serviceId", props.serviceId);
    } else if (props.branchServiceId) {
      q.set("branchServiceId", props.branchServiceId);
    }
    q.set("serviceTitle", props.serviceTitle);
    q.set("durationMinutes", String(props.durationMinutes));
  } else {
    q.set("category", props.category);
  }
  if (props.rescheduleBookingId) {
    q.set("rescheduleBookingId", props.rescheduleBookingId);
  }
  return q.toString();
}

export function SlotStepClient(props: Props) {
  const router = useRouter();

  const selection: BookingSelection = useMemo(() => {
    if (props.type === "online") {
      return {
        type: "online",
        category: props.category as BookingCategory,
      };
    }
    if (props.branchId && props.serviceId) {
      return {
        type: "in_person",
        cityCode: props.cityCode,
        cityTitle: props.cityTitle,
        branchId: props.branchId,
        serviceId: props.serviceId,
        serviceTitle: props.serviceTitle,
      };
    }
    return {
      type: "in_person",
      cityCode: props.cityCode,
      cityTitle: props.cityTitle,
      branchId: "",
      serviceId: "",
      serviceTitle: props.serviceTitle,
      branchServiceId: props.branchServiceId ?? "",
    };
  }, [props]);

  const confirmBase = props.confirmBasePath ?? routePaths.bookingNewConfirm;
  const slotsState = useBookingSlots(selection, 1, props.slotsApiPath);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);

  const effectiveDate = selectedDate ?? slotsState.availableDates[0] ?? null;
  const canContinue = Boolean(effectiveDate && selectedSlot);

  return (
    <div className="flex flex-col gap-4">
      <BookingCalendar
        availableDates={slotsState.availableDates}
        selectedDate={effectiveDate}
        onSelectDate={(date) => {
          setSelectedDate(date);
          setSelectedSlot(null);
        }}
      />

      {slotsState.loading ? <p className={patientMutedTextClass}>Загрузка расписания…</p> : null}
      {slotsState.error ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive">{slotsState.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void slotsState.reload()}>
            Повторить
          </Button>
        </div>
      ) : null}

      {effectiveDate ? (
        <BookingSlotList
          slots={slotsState.slotsForDate(effectiveDate)}
          selectedSlot={selectedSlot}
          onSelectSlot={setSelectedSlot}
          appDisplayTimeZone={props.appDisplayTimeZone}
        />
      ) : null}

      <button
        type="button"
        className={patientButtonPrimaryClass}
        disabled={!canContinue || !effectiveDate || !selectedSlot}
        onClick={() => {
          if (!effectiveDate || !selectedSlot) return;
          const qs = buildConfirmQuery(props, effectiveDate, selectedSlot);
          router.push(`${confirmBase}?${qs}`);
        }}
      >
        Продолжить
      </button>
    </div>
  );
}
