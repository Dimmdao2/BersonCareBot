'use client';

import { useCallback, useState } from 'react';
import { PatientModal } from '@/shared/ui/patient/PatientModal';
import { Button } from '@/shared/ui/patient/primitives/button';
import { cn } from '@/lib/utils';
import { useWebPushClientState } from '@/shared/lib/webPush/PatientWebPushContext';
import { subscribePatientWebPush } from '@/shared/lib/webPush/subscribePatientWebPush';
import { reportWebPushSubscribeFailure } from '@/shared/lib/webPush/webPushSubscribeFeedback';
import {
  patientButtonSecondaryClass,
  patientModalPortalPrimaryCtaClass,
  patientMutedTextClass,
} from '@/shared/ui/patient/patientVisual';

/** После свежего входа при system-denied — короткий призыв включить уведомления в настройках ОС. */
export function PatientWebPushFreshLoginDeniedDialog() {
  const state = useWebPushClientState();
  const [busy, setBusy] = useState(false);

  const onOpenSettings = useCallback(async () => {
    setBusy(true);
    try {
      const result = await subscribePatientWebPush();
      if (result.ok) {
        await state.refresh();
      } else {
        reportWebPushSubscribeFailure(result);
      }
    } finally {
      setBusy(false);
    }
  }, [state]);

  return (
    <PatientModal
      open={state.showFreshLoginDeniedPrompt}
      onClose={state.dismissFreshLoginDeniedPrompt}
      title="Уведомления отключены"
      size="sm"
      footer={
        <>
          <Button
            type="button"
            className={cn(
              patientButtonSecondaryClass,
              'border-[#e5e7eb] bg-[#ffffff] hover:bg-[#e8eefb]/40 active:bg-[#e8eefb]/60',
            )}
            disabled={busy}
            onClick={state.dismissFreshLoginDeniedPrompt}
          >
            Позже
          </Button>
          <Button
            type="button"
            className={cn(patientModalPortalPrimaryCtaClass, 'border-0')}
            disabled={busy}
            onClick={() => void onOpenSettings()}
          >
            Открыть настройки
          </Button>
        </>
      }
    >
      <p className={cn(patientMutedTextClass, 'text-sm leading-relaxed')}>
        Включите уведомления для приложения в настройках устройства, чтобы получать напоминания.
      </p>
    </PatientModal>
  );
}
