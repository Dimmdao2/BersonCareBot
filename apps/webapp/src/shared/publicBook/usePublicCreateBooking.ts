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
  contactFio?: { lastName: string; firstName: string; patronymic?: string };
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
  proofMethod: 'sms' | 'email';
  challengeId: string;
  expiresInSeconds: number;
  contact: string;
};

export function usePublicCreateBooking() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationPrompt, setVerificationPrompt] =
    useState<PublicBookingVerificationPrompt | null>(null);
  const [proofMethod, setProofMethod] = useState<'sms' | 'email'>('sms');
  const [pendingInput, setPendingInput] = useState<CreateBookingInput | null>(null);

  async function submitCreate(
    input: CreateBookingInput,
    selectedProofMethod: 'sms' | 'email',
  ): Promise<PatientBookingRecord | false> {
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
              proofMethod: selectedProofMethod,
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
                proofMethod: selectedProofMethod,
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
      if (res.ok && json.ok === true && json.verification && selectedProofMethod === 'sms') {
        setVerificationPrompt({
          proofMethod: 'sms',
          challengeId: json.verification.challengeId,
          expiresInSeconds: json.verification.expiresInSeconds,
          contact: input.contactPhone,
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
  }

  async function createBooking(input: CreateBookingInput): Promise<PatientBookingRecord | false> {
    setSubmitting(true);
    setError(null);
    setVerificationPrompt(null);
    setPendingInput(input);
    try {
      if (proofMethod === 'email') {
        const email = input.contactEmail?.trim();
        if (!email || !input.contactFio) {
          setError('Введите email для подтверждения.');
          return false;
        }
        const registration = await fetch('/api/auth/email-otp/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, ...input.contactFio }),
        });
        let res = registration;
        let json = (await registration.json().catch(() => ({}))) as {
          ok?: boolean; challengeId?: string; error?: string; message?: string;
        };
        if (json.error === 'duplicate_email') {
          res = await fetch('/api/auth/email-otp/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          json = (await res.json().catch(() => ({}))) as typeof json;
        }
        if (!res.ok || json.ok !== true || !json.challengeId) {
          setError(
            json.error === 'rate_limited'
              ? 'Слишком много попыток. Попробуйте позже.'
              : (json.message ?? 'Не удалось отправить код подтверждения.'),
          );
          return false;
        }
        setVerificationPrompt({ proofMethod: 'email', challengeId: json.challengeId, expiresInSeconds: 600, contact: email });
        return false;
      }
      return await submitCreate(input, 'sms');
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
      const res = await fetch(
        prompt.proofMethod === 'email'
          ? '/api/auth/email-otp/confirm'
          : '/api/booking/public/create/confirm',
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          prompt.proofMethod === 'email'
            ? { email: prompt.contact, code: code.trim() }
            : { challengeId: prompt.challengeId, code: code.trim() },
        ),
      },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        booking?: PatientBookingRecord;
      };
      if (prompt.proofMethod === 'email' && res.ok && json.ok === true && pendingInput) {
        setVerificationPrompt(null);
        return await submitCreate(pendingInput, 'email');
      }
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
    proofMethod,
    setProofMethod,
  };
}
