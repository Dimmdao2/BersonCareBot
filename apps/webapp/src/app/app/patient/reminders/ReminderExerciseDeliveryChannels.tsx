"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { routePaths } from "@/app-layer/routes/paths";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWebPushClientState } from "@/shared/lib/webPush/PatientWebPushContext";
import { restorePatientWebPushSubscription, subscribePatientWebPush } from "@/shared/lib/webPush/subscribePatientWebPush";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

type Props = {
  deliveryChannelLabels: string[];
};

export function ReminderExerciseDeliveryChannels({ deliveryChannelLabels }: Props) {
  const pushState = useWebPushClientState();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const deliveryLine =
    deliveryChannelLabels.length > 0 ?
      deliveryChannelLabels.join(", ")
    : "нет активных каналов";

  const runEnablePush = useCallback(async () => {
    setBusy(true);
    try {
      const result =
        pushState.uiStatus === "granted_no_subscription" ?
          await restorePatientWebPushSubscription()
        : await subscribePatientWebPush();
      if (result.ok) {
        await pushState.refresh();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [pushState, router]);

  const showPushWarning =
    pushState.mounted &&
    pushState.standalone &&
    pushState.uiStatus !== "enabled" &&
    pushState.uiStatus !== "unsupported" &&
    pushState.uiStatus !== "needs_pwa";

  const showEnablePushButton =
    pushState.uiStatus === "pending_permission" ||
    pushState.uiStatus === "granted_no_subscription" ||
    pushState.uiStatus === "denied_system";

  useEffect(() => {
    if (!pushState.mounted) return;
    void pushState.refresh();
  }, [pushState.mounted, pushState.refresh]);

  return (
    <div className="space-y-2">
      <p className={cn(patientMutedTextClass, "text-xs")}>
        Куда отправляется:{" "}
        <span className="text-[var(--patient-text-primary)]">{deliveryLine}</span>
        {deliveryChannelLabels.length === 0 ?
          <>
            {" "}
            <Link href={routePaths.notifications} className="text-primary underline">
              Настроить
            </Link>
          </>
        : null}
      </p>

      {showPushWarning ?
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            {pushState.uiStatus === "denied_system" ?
              "Push-уведомления отключены в настройках устройства."
            : "Push-уведомления не включены — напоминания могут не доходить в приложение."}
          </p>
          {showEnablePushButton ?
            <Button
              type="button"
              size="sm"
              className="mt-2"
              disabled={busy}
              onClick={() => void runEnablePush()}
            >
              {pushState.uiStatus === "denied_system" ? "Открыть настройки" : "Включить Push"}
            </Button>
          : null}
        </div>
      : null}
    </div>
  );
}
