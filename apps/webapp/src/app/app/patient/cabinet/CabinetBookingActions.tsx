'use client';

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/patient/primitives/button';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import { routePaths } from '@/app-layer/routes/paths';
import { patientInlineLinkClass } from '@/shared/ui/patient/patientVisual';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const CANCEL_MSG: Record<string, string> = {
  cancel_free: 'Отмена без штрафа',
  cancel_late_penalty: 'Поздняя отмена — возможен штраф',
  cancel_not_free_after_reschedule: 'Бесплатная отмена недоступна после переноса',
  cancel_not_allowed: 'Отмена недоступна',
};

type Props = {
  row: PatientBookingRecord;
};

export type PatientBookingRescheduleClassification =
  | 'legacy_only'
  | 'canonical_online'
  | 'canonical_in_person'
  | 'canonical_in_person_incomplete';

/**
 * Legacy `patient_bookings` catalog ids are an incompatible namespace. Only a
 * complete canonical appointment view model may open canonical in-person slots.
 */
export function classifyPatientBookingReschedule(
  row: PatientBookingRecord,
): PatientBookingRescheduleClassification {
  if (!row.canonicalAppointmentId) return 'legacy_only';
  if (row.bookingType === 'online') return 'canonical_online';
  return row.canonicalInPersonContext ? 'canonical_in_person' : 'canonical_in_person_incomplete';
}

export function buildRescheduleHref(row: PatientBookingRecord): string | null {
  const classification = classifyPatientBookingReschedule(row);
  if (classification === 'canonical_in_person') {
    const context = row.canonicalInPersonContext!;
    const qs = new URLSearchParams({
      type: 'in_person',
      branchId: context.branchId,
      serviceId: context.serviceId,
      rescheduleBookingId: row.id,
    });
    return `${routePaths.bookingNewSlot}?${qs}`;
  }
  if (classification === 'canonical_online') {
    const qs = new URLSearchParams({
      type: 'online',
      category: row.category,
      rescheduleBookingId: row.id,
    });
    return `${routePaths.bookingNewSlot}?${qs}`;
  }
  return null;
}

export function CabinetBookingActions({ row }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelHint, setCancelHint] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    const res = await fetch(`/api/booking/actions?bookingId=${encodeURIComponent(row.id)}`);
    const json = (await res.json()) as {
      ok?: boolean;
      cancel?: { ok?: boolean; messageKey?: string; allowed?: boolean };
    };
    if (json.ok && json.cancel?.ok) {
      setCancelHint(CANCEL_MSG[json.cancel.messageKey ?? ''] ?? null);
      return json.cancel.allowed !== false;
    }
    return true;
  }, [row.id]);

  const rescheduleHref = buildRescheduleHref(row);

  if (!row.canonicalAppointmentId) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {rescheduleHref ? (
        <Link href={rescheduleHref} className={cn(patientInlineLinkClass, 'text-sm font-medium')}>
          Перенести
        </Link>
      ) : null}
      <Button
        type="button"
        variant="link"
        className={cn(patientInlineLinkClass, 'h-auto min-h-0 px-0 py-0 text-sm')}
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const allowed = await loadPreview();
            if (!allowed) {
              toast.error(cancelHint ?? 'Отмена недоступна');
              return;
            }
            const msg = cancelHint ? `${cancelHint}. Отменить запись?` : 'Отменить запись?';
            if (!window.confirm(msg)) return;
            const res = await fetch('/api/booking/cancel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId: row.id }),
            });
            const json = (await res.json()) as Record<string, unknown> & {
              ok?: boolean;
              error?: string;
            };
            if (!res.ok || !json.ok) {
              toast.error(
                json.error === 'staff_confirmation_required'
                  ? 'Нужно согласование'
                  : 'Не удалось отменить',
              );
              return;
            }
            toast.success('Запись отменена');
            router.refresh();
          });
        }}
      >
        Отменить
      </Button>
    </div>
  );
}
