'use client';

import { useCallback, useState } from 'react';
import { Bell } from 'lucide-react';
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

export function PatientWebPushOnboardingCard() {
  const state = useWebPushClientState();
  const [busy, setBusy] = useState(false);

  const onEnable = useCallback(async () => {
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

  const onDismiss = useCallback(() => {
    state.dismissOnboardingPrompt();
  }, [state]);

  return (
    <PatientModal
      open={state.showOnboardingPrompt}
      onClose={onDismiss}
      title="Включите уведомления"
      size="sm"
      headerAction={
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--patient-color-primary-soft)] text-[var(--patient-color-primary)]"
          aria-hidden
        >
          <Bell className="size-5" />
        </span>
      }
      footer={<PushOnboardingActions busy={busy} onEnable={onEnable} onDismiss={onDismiss} />}
    >
      <p className={cn(patientMutedTextClass, 'text-sm leading-relaxed')}>
        Так вы сможете получать напоминания о тренировках, обновления плана и важные сообщения по
        программе.
      </p>
    </PatientModal>
  );
}

function PushOnboardingActions({
  busy,
  onEnable,
  onDismiss,
}: {
  busy: boolean;
  onEnable: () => void | Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        className={cn(
          patientButtonSecondaryClass,
          'border-[var(--patient-border)] bg-[var(--patient-card-bg)] hover:bg-[var(--patient-color-primary-soft)]/40 active:bg-[var(--patient-color-primary-soft)]/60',
        )}
        disabled={busy}
        onClick={onDismiss}
      >
        Не сейчас
      </Button>
      <Button
        type="button"
        className={cn(patientModalPortalPrimaryCtaClass, 'border-0')}
        disabled={busy}
        onClick={() => void onEnable()}
      >
        Включить уведомления
      </Button>
    </>
  );
}
