'use client';

import { ConfirmStepClient } from '@/app/app/patient/booking/confirm/ConfirmStepClient';
import type { BookingCategory } from '@/modules/patient-booking/types';
import type { StructuredFio } from '@/shared/lib/fio';
import { publicBookPaths } from '@/shared/publicBook/paths';
import { usePublicCreateBooking } from '@/shared/publicBook/usePublicCreateBooking';

type InPersonProps = {
  type: 'in_person';
  cityCode?: string;
  cityTitle?: string;
  branchId?: string;
  serviceId?: string;
  orgSlug?: string;
  serviceTitle?: string;
  slotStart: string;
  slotEnd: string;
  appDisplayTimeZone: string;
};

type OnlineProps = {
  type: 'online';
  category: BookingCategory;
  slotStart: string;
  slotEnd: string;
  appDisplayTimeZone: string;
};

const EMPTY_FIO: StructuredFio = {
  lastName: '',
  firstName: '',
  patronymic: '',
};

export function PublicConfirmStepClient(props: InPersonProps | OnlineProps) {
  return (
    <ConfirmStepClient
      {...props}
      defaultFio={EMPTY_FIO}
      defaultPhone=""
      defaultEmail=""
      formFieldsApiPath="/api/booking/public/form-fields"
      successRedirectPath={publicBookPaths.done}
      doneRedirectPath={publicBookPaths.done}
      buildAwaitingPaymentHref={(booking) =>
        `${publicBookPaths.pay}?bookingId=${encodeURIComponent(booking.id)}`
      }
      useCreateBookingHook={usePublicCreateBooking}
    />
  );
}
