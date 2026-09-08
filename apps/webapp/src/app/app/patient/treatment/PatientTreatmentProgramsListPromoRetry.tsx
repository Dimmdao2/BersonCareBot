'use client';

import { useRouter } from 'next/navigation';
import {
  patientInlineLinkClass,
  patientMutedTextClass,
} from '@/shared/ui/patient/patientVisual';
import { cn } from '@/lib/utils';

/** Повтор загрузки promo/active после сбоя ensure на сервере. */
export function PatientTreatmentProgramsListPromoRetry() {
  const router = useRouter();
  return (
    <p className={cn(patientMutedTextClass, 'text-[var(--patient-color-danger)]')} role="alert">
      Не удалось открыть программу.{' '}
      <button
        type="button"
        className={cn(patientInlineLinkClass, 'text-[var(--patient-color-danger)]')}
        onClick={() => router.refresh()}
      >
        Повторить
      </button>
    </p>
  );
}
