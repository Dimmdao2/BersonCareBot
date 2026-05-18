"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import { useWebPushClientState } from "@/shared/lib/webPush/PatientWebPushContext";
import type { WebPushUiStatus } from "@/shared/lib/webPush/pushOnboardingEligibility";
import { restorePatientWebPushSubscription, subscribePatientWebPush } from "@/shared/lib/webPush/subscribePatientWebPush";
import { unsubscribePatientWebPush } from "@/shared/lib/webPush/unsubscribePatientWebPush";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

const PUSH_STATUS: Record<WebPushUiStatus, string> = {
  unsupported: "Не поддерживается на этом устройстве",
  needs_pwa: "Доступно после установки приложения на экран «Домой»",
  pending_permission: "Не включено",
  enabled: "Включено",
  denied_system: "Уведомления отключены в настройках устройства",
  granted_no_subscription: "Разрешение есть, подписка не активна",
};

type Props = {
  hasTelegram: boolean;
  hasMax: boolean;
  hasEmail: boolean;
  emailVerified: boolean;
};

function ChannelRow({ label, status, action }: { label: string; status: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--patient-border)]/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--patient-text-primary)]">{label}</p>
        <p className={patientMutedTextClass}>{status}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function PushChannelRow() {
  const state = useWebPushClientState();
  const [busy, setBusy] = useState(false);

  const runSubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const result =
        state.uiStatus === "granted_no_subscription" ?
          await restorePatientWebPushSubscription()
        : await subscribePatientWebPush();
      await state.refresh();
    } finally {
      setBusy(false);
    }
  }, [state]);

  const runUnsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      await unsubscribePatientWebPush();
      await state.refresh();
    } finally {
      setBusy(false);
    }
  }, [state]);

  if (!state.mounted) return null;

  let action: ReactNode = null;
  if (state.uiStatus === "pending_permission" || state.uiStatus === "granted_no_subscription") {
    action = (
      <Button type="button" size="sm" disabled={busy} onClick={() => void runSubscribe()}>
        {state.uiStatus === "granted_no_subscription" ? "Восстановить" : "Включить уведомления"}
      </Button>
    );
  } else if (state.uiStatus === "enabled") {
    action = (
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void runUnsubscribe()}>
        Отключить
      </Button>
    );
  } else if (state.uiStatus === "needs_pwa") {
    action = (
      <Link href={routePaths.patientInstall} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Установить
      </Link>
    );
  }

  return <ChannelRow label="Push в приложении" status={PUSH_STATUS[state.uiStatus]} action={action} />;
}

export function PatientNotificationChannelsStatus({ hasTelegram, hasMax, hasEmail, emailVerified }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <PushChannelRow />
      {hasTelegram ? <ChannelRow label="Telegram" status="Подключён" /> : null}
      {hasMax ? <ChannelRow label="MAX" status="Подключён" /> : null}
      {hasEmail ?
        emailVerified ?
          <ChannelRow label="Email" status="Подтверждён" />
        : <ChannelRow
            label="Email"
            status="Не подтверждён"
            action={
              <Link href={routePaths.profile} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Подтвердить
              </Link>
            }
          />
      : null}
    </div>
  );
}
