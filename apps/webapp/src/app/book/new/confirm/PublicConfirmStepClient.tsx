"use client";

import { ConfirmStepClient } from "@/app/app/patient/booking/new/confirm/ConfirmStepClient";
import type { BookingCategory } from "@/modules/patient-booking/types";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { usePublicCreateBooking } from "@/shared/publicBook/usePublicCreateBooking";

type InPersonProps = {
  type: "in_person";
  cityCode?: string;
  cityTitle?: string;
  branchServiceId?: string;
  serviceTitle?: string;
  slotStart: string;
  slotEnd: string;
  appDisplayTimeZone: string;
};

type OnlineProps = {
  type: "online";
  category: BookingCategory;
  slotStart: string;
  slotEnd: string;
  appDisplayTimeZone: string;
};

export function PublicConfirmStepClient(props: InPersonProps | OnlineProps) {
  return (
    <ConfirmStepClient
      {...props}
      defaultName=""
      defaultPhone=""
      formFieldsApiPath="/api/booking/public/form-fields"
      successRedirectPath={publicBookPaths.done}
      buildAwaitingPaymentHref={(booking, contactPhone) =>
        `${publicBookPaths.pay}?bookingId=${encodeURIComponent(booking.id)}&phone=${encodeURIComponent(contactPhone)}`
      }
      useCreateBookingHook={usePublicCreateBooking}
    />
  );
}
