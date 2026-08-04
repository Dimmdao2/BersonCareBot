'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BookingSelection } from './useBookingSelection';
import type {
  BookingContactFioInput,
  BookingSlot,
  PatientBookingRecord,
} from '@/modules/patient-booking/types';
import { mapBookingCreateErrorCodeToRu } from './bookingCreateErrorMessages';
import { redirectIfPatientActivationRequired } from './bookingPatientActivation';

type FormAnswer = { fieldKey: string; value: string };

type CreateBookingInput = {
  selection: BookingSelection;
  slot: BookingSlot;
  slotCount?: number;
  contactName: string;
  contactFio?: BookingContactFioInput;
  contactPhone: string;
  contactEmail?: string;
  formAnswers?: FormAnswer[];
  patientPackageId?: string;
};

export function useCreateBooking() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBooking(input: CreateBookingInput): Promise<PatientBookingRecord | false> {
    setSubmitting(true);
    setError(null);
    try {
      const body =
        input.selection.type === 'online'
          ? {
              type: 'online' as const,
              category: input.selection.category,
              slotStart: input.slot.startAt,
              slotEnd: input.slot.endAt,
              slotCount: input.slotCount,
              contactName: input.contactName,
              contactFio: input.contactFio,
              contactPhone: input.contactPhone,
              contactEmail: input.contactEmail,
              formAnswers: input.formAnswers,
            }
          : (() => {
              return {
                type: 'in_person' as const,
                branchId: input.selection.branchId,
                serviceId: input.selection.serviceId,
                cityCode: input.selection.cityCode,
                slotStart: input.slot.startAt,
                slotEnd: input.slot.endAt,
                slotCount: input.slotCount,
                contactName: input.contactName,
                contactFio: input.contactFio,
                contactPhone: input.contactPhone,
                contactEmail: input.contactEmail,
                formAnswers: input.formAnswers,
                ...(input.patientPackageId ? { patientPackageId: input.patientPackageId } : {}),
              };
            })();

      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        redirectTo?: string;
        booking?: PatientBookingRecord;
      };
      if (!res.ok || json.ok !== true || !json.booking) {
        if (redirectIfPatientActivationRequired(json, router)) {
          setError(null);
          return false;
        }
        setError(json.message ?? mapBookingCreateErrorCodeToRu(json.error));
        return false;
      }
      return json.booking;
    } catch {
      setError('Ошибка сети при создании записи');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return {
    submitting,
    error,
    createBooking,
  };
}
