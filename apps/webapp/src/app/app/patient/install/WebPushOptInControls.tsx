'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/patient/primitives/button';
import { useNativeRuntime } from '@/shared/hooks/useNativeRuntime';
import { probePushSupported } from '@/shared/lib/webPush/pushCapability';
import { isStandalonePwa } from '@/shared/lib/webPush/pwaDisplay';
import { subscribePatientWebPush } from '@/shared/lib/webPush/subscribePatientWebPush';
import { webPushSubscribeFailureMessage } from '@/shared/lib/webPush/webPushSubscribeFeedback';
import { enableNativePushSubscription } from '@/shared/lib/nativePush/nativePushClient';
import { notificationText } from '@/shared/notifications/notificationText';

export function WebPushOptInControls() {
  const runtime = useNativeRuntime();
  const [busy, setBusy] = useState(false);

  const onEnable = useCallback(async () => {
    if (runtime.kind === 'therapygo_android') {
      setBusy(true);
      try {
        const result = await enableNativePushSubscription(runtime.kind);
        if (result.ok) {
          toast.success(notificationText.commonDone);
          return;
        }
        toast.error(webPushSubscribeFailureMessage(result.reason));
      } catch {
        toast.error(notificationText.commonGenericError);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!(await probePushSupported()) && !isStandalonePwa()) {
      toast.error(notificationText.patientPwaOpenFromHomeScreenFirst);
      return;
    }
    if (!(await probePushSupported())) {
      toast.error(notificationText.commonPushNotSupported);
      return;
    }
    setBusy(true);
    try {
      const result = await subscribePatientWebPush();
      if (result.ok) {
        toast.success(notificationText.commonDone);
        return;
      }
      toast.error(webPushSubscribeFailureMessage(result.reason));
    } catch {
      toast.error(notificationText.commonGenericError);
    } finally {
      setBusy(false);
    }
  }, [runtime.kind]);

  return (
    <Button type="button" variant="secondary" disabled={busy} onClick={() => void onEnable()}>
      Включить уведомления
    </Button>
  );
}
