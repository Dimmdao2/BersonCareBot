'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { useNativeRuntime } from '@/shared/hooks/useNativeRuntime';
import { fetchStaffWebPushStatus } from '@/shared/lib/webPush/staffWebPushApi';
import {
  restoreStaffWebPushSubscription,
  subscribeStaffWebPush,
} from '@/shared/lib/webPush/subscribeStaffWebPush';
import { unsubscribeAllStaffWebPush } from '@/shared/lib/webPush/staffWebPushApi';
import { probePushSupported } from '@/shared/lib/webPush/pushCapability';
import { webPushSubscribeFailureMessage } from '@/shared/lib/webPush/webPushSubscribeFeedback';
import { fetchNativePushStatus } from '@/shared/lib/nativePush/nativePushApi';
import {
  disableNativePushSubscription,
  enableNativePushSubscription,
} from '@/shared/lib/nativePush/nativePushClient';

type Props = {
  initialHasSubscription: boolean;
  initialGlobalEnabled: boolean;
};

export function DoctorWebPushControls({ initialHasSubscription, initialGlobalEnabled }: Props) {
  const router = useRouter();
  const runtime = useNativeRuntime();
  const isNative = runtime.kind === 'therapysto_android';
  const [hasSubscription, setHasSubscription] = useState(initialHasSubscription);
  const [globalEnabled, setGlobalEnabled] = useState(initialGlobalEnabled);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHasSubscription(initialHasSubscription);
    setGlobalEnabled(initialGlobalEnabled);
  }, [initialHasSubscription, initialGlobalEnabled]);

  const refreshStatus = useCallback(async () => {
    if (isNative) {
      const status = await fetchNativePushStatus('therapysto_android');
      setHasSubscription(Boolean(status?.active));
      setGlobalEnabled(status?.runtime !== 'unavailable');
      return;
    }
    const status = await fetchStaffWebPushStatus();
    setHasSubscription(Boolean(status.hasSubscription));
    setGlobalEnabled(status.globalWebPushEnabled !== false);
  }, [isNative]);

  // Native runtime resolves asynchronously; re-check once confirmed instead of trusting server-rendered browser props.
  useEffect(() => {
    if (isNative) void refreshStatus();
  }, [isNative, refreshStatus]);

  const onEnable = useCallback(async () => {
    if (isNative) {
      setBusy(true);
      try {
        const result = await enableNativePushSubscription('therapysto_android');
        if (result.ok) {
          await refreshStatus();
          router.refresh();
          toast.success('Push включён');
          return;
        }
        toast.error(webPushSubscribeFailureMessage(result.reason));
      } catch {
        toast.error('Ошибка');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!(await probePushSupported())) {
      toast.error('Уведомления не поддерживаются');
      return;
    }
    setBusy(true);
    try {
      const result = await subscribeStaffWebPush();
      if (result.ok) {
        await refreshStatus();
        router.refresh();
        toast.success('Push включён');
        return;
      }
      toast.error(webPushSubscribeFailureMessage(result.reason));
    } catch {
      toast.error('Ошибка');
    } finally {
      setBusy(false);
    }
  }, [isNative, refreshStatus, router]);

  const onRestore = useCallback(async () => {
    if (isNative) {
      // Native token is already tracked by the resume/token listener (M3-03); re-run the same enable flow.
      return onEnable();
    }
    setBusy(true);
    try {
      const result = await restoreStaffWebPushSubscription();
      if (result.ok) {
        await refreshStatus();
        router.refresh();
        toast.success('Подписка восстановлена');
        return;
      }
      toast.error(webPushSubscribeFailureMessage(result.reason));
    } finally {
      setBusy(false);
    }
  }, [isNative, onEnable, refreshStatus, router]);

  const onDisable = useCallback(async () => {
    setBusy(true);
    try {
      const ok = isNative
        ? await disableNativePushSubscription('therapysto_android')
        : await unsubscribeAllStaffWebPush();
      if (ok) {
        await refreshStatus();
        router.refresh();
        toast.success('Push отключён');
      }
    } finally {
      setBusy(false);
    }
  }, [isNative, refreshStatus, router]);

  const pushActive = hasSubscription && globalEnabled;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">Push в приложении</p>
        <p className="text-xs text-muted-foreground">{pushActive ? 'Включено' : 'Не включено'}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {pushActive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onDisable()}
          >
            Отключить
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => void onEnable()}>
              Включить
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onRestore()}
            >
              Восстановить
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
