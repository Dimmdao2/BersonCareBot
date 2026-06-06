"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { fetchStaffWebPushStatus } from "@/shared/lib/webPush/staffWebPushApi";
import { restoreStaffWebPushSubscription, subscribeStaffWebPush } from "@/shared/lib/webPush/subscribeStaffWebPush";
import { unsubscribeAllStaffWebPush } from "@/shared/lib/webPush/staffWebPushApi";
import { probePushSupported } from "@/shared/lib/webPush/pushCapability";
import { webPushSubscribeFailureMessage } from "@/shared/lib/webPush/webPushSubscribeFeedback";

type Props = {
  initialHasSubscription: boolean;
  initialGlobalEnabled: boolean;
};

export function DoctorWebPushControls({ initialHasSubscription, initialGlobalEnabled }: Props) {
  const router = useRouter();
  const [hasSubscription, setHasSubscription] = useState(initialHasSubscription);
  const [globalEnabled, setGlobalEnabled] = useState(initialGlobalEnabled);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHasSubscription(initialHasSubscription);
    setGlobalEnabled(initialGlobalEnabled);
  }, [initialHasSubscription, initialGlobalEnabled]);

  const refreshStatus = useCallback(async () => {
    const status = await fetchStaffWebPushStatus();
    setHasSubscription(Boolean(status.hasSubscription));
    setGlobalEnabled(status.globalWebPushEnabled !== false);
  }, []);

  const onEnable = useCallback(async () => {
    if (!(await probePushSupported())) {
      toast.error("Уведомления не поддерживаются");
      return;
    }
    setBusy(true);
    try {
      const result = await subscribeStaffWebPush();
      if (result.ok) {
        await refreshStatus();
        router.refresh();
        toast.success("Push включён");
        return;
      }
      toast.error(webPushSubscribeFailureMessage(result.reason));
    } catch {
      toast.error("Ошибка");
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, router]);

  const onRestore = useCallback(async () => {
    setBusy(true);
    try {
      const result = await restoreStaffWebPushSubscription();
      if (result.ok) {
        await refreshStatus();
        router.refresh();
        toast.success("Подписка восстановлена");
        return;
      }
      toast.error(webPushSubscribeFailureMessage(result.reason));
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, router]);

  const onDisable = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await unsubscribeAllStaffWebPush();
      if (ok) {
        await refreshStatus();
        router.refresh();
        toast.success("Push отключён");
      }
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, router]);

  const pushActive = hasSubscription && globalEnabled;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">Push в приложении</p>
        <p className="text-xs text-muted-foreground">
          {pushActive ? "Включено" : "Не включено"}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {pushActive ?
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onDisable()}>
            Отключить
          </Button>
        : <>
            <Button type="button" size="sm" disabled={busy} onClick={() => void onEnable()}>
              Включить
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onRestore()}>
              Восстановить
            </Button>
          </>
        }
      </div>
    </div>
  );
}
