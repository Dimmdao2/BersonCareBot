'use client';

import { useState } from 'react';
import type { BookingSelection } from '@/app/app/patient/cabinet/useBookingSelection';
import type { BookingSlot, PatientBookingRecord } from '@/modules/patient-booking/types';
import type { BookingAttribution } from '@/modules/booking-attribution/types';
import { mapBookingCreateErrorCodeToRu } from '@/app/app/patient/cabinet/bookingCreateErrorMessages';
import { readStoredPublicBookingAttribution } from './attributionStorage';

type FormAnswer = { fieldKey: string; value: string };

type CreateBookingInput = {
  selection: BookingSelection;
  slot: BookingSlot;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  formAnswers?: FormAnswer[];
};

/**
 * A-3: an anonymous booking is now two requests. The first returns a challenge instead of a
 * booking; the caller types the code that was sent to the phone; the second creates the booking.
 * A signed-in patient booking under their own phone gets the booking straight back from the first
 * request and never sees the prompt.
 */
export type PublicBookingVerificationPrompt = {
  challengeId: string;
  expiresInSeconds: number;
  /** Where the code went, for the on-screen copy. */
  contactPhone: string;
};

export function usePublicCreateBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationPrompt, setVerificationPrompt] =
    useState<PublicBookingVerificationPrompt | null>(null);

  async function createBooking(input: CreateBookingInput): Promise<PatientBookingRecord | false> {
    setSubmitting(true);
    setError(null);
    setVerificationPrompt(null);
    try {
      const attribution: BookingAttribution = readStoredPublicBookingAttribution();
      const body =
        input.selection.type === 'online'
          ? {
              type: 'online' as const,
              category: input.selection.category,
              slotStart: input.slot.startAt,
              slotEnd: input.slot.endAt,
              contactName: input.contactName,
              contactPhone: input.contactPhone,
              contactEmail: input.contactEmail,
              formAnswers: input.formAnswers,
              attribution,
            }
          : (() => {
              return {
                type: 'in_person' as const,
                branchId: input.selection.branchId,
                serviceId: input.selection.serviceId,
                orgSlug: input.selection.orgSlug,
                cityCode: input.selection.cityCode,
                slotStart: input.slot.startAt,
                slotEnd: input.slot.endAt,
                contactName: input.contactName,
                contactPhone: input.contactPhone,
                contactEmail: input.contactEmail,
                formAnswers: input.formAnswers,
                attribution,
              };
            })();

      const res = await fetch('/api/booking/public/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        retryAfterSeconds?: number;
        booking?: PatientBookingRecord;
        verification?: { challengeId: string; expiresInSeconds: number };
      };
      if (res.ok && json.ok === true && json.verification) {
        setVerificationPrompt({
          challengeId: json.verification.challengeId,
          expiresInSeconds: json.verification.expiresInSeconds,
          contactPhone: input.contactPhone,
        });
        return false;
      }
      if (!res.ok || json.ok !== true || !json.booking) {
        if (json.error === 'rate_limited') {
          setError('Слишком много попыток. Попробуйте позже.');
        } else if (json.error === 'verification_unavailable') {
          setError('Не удалось отправить код подтверждения. Попробуйте позже.');
        } else {
          setError(mapBookingCreateErrorCodeToRu(json.error));
        }
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

  async function confirmVerification(code: string): Promise<PatientBookingRecord | false> {
    const prompt = verificationPrompt;
    if (!prompt) return false;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/booking/public/create/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: prompt.challengeId, code: code.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        booking?: PatientBookingRecord;
      };
      if (!res.ok || json.ok !== true || !json.booking) {
        if (json.error === 'verification_failed') {
          // Deliberately one message: the server does not distinguish wrong from expired from
          // exhausted, and neither may the screen.
          setError('Неверный или истёкший код. Запросите новый код.');
        } else if (json.error === 'rate_limited') {
          setError('Слишком много попыток. Попробуйте позже.');
        } else {
          setError(mapBookingCreateErrorCodeToRu(json.error));
        }
        return false;
      }
      setVerificationPrompt(null);
      return json.booking;
    } catch {
      setError('Ошибка сети при подтверждении записи');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function cancelVerification() {
    setVerificationPrompt(null);
    setError(null);
  }

  return {
    submitting,
    error,
    createBooking,
    verificationPrompt,
    confirmVerification,
    cancelVerification,
  };
}
