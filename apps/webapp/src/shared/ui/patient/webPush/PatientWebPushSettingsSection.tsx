"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import { useWebPushClientState } from "@/shared/lib/webPush/PatientWebPushContext";
import type { WebPushUiStatus } from "@/shared/lib/webPush/pushOnboardingEligibility";
import { restorePatientWebPushSubscription, subscribePatientWebPush } from "@/shared/lib/webPush/subscribePatientWebPush";
import { unsubscribePatientWebPush } from "@/shared/lib/webPush/unsubscribePatientWebPush";
import { patientMutedTextClass, patientSectionSurfaceClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";

const STATUS_LABEL: Record<WebPushUiStatus, string> = {
  unsupported: "Не поддерживаются на этом устройстве или в этом браузере",
  needs_pwa: "Доступны только в установленном приложении",
  pending_permission: "Ожидают разрешения",
  enabled: "Включены",
  denied_system: "Отключены в настройках устройства",
  granted_no_subscription: "Разрешение есть, подписка не активна",
};

export function PatientWebPushSettingsSection() {
  const state = useWebPushClientState();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runSubscribe = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result =
        state.uiStatus === "granted_no_subscription" ?
          await restorePatientWebPushSubscription()
        : await subscribePatientWebPush();
      await state.refresh();
      if (result.ok) {
        setMessage("Уведомления включены");
        return;
      }
      if (result.reason === "permission_denied") {
        setMessage("Уведомления отключены. Включите их в настройках телефона.");
        return;
      }
      if (result.reason === "vapid_unavailable") {
        setMessage("Push временно недоступен");
        return;
      }
      setMessage("Не удалось включить уведомления");
    } finally {
      setBusy(false);
    }
  }, [state]);

  const runUnsubscribe = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const ok = await unsubscribePatientWebPush();
      await state.refresh();
      setMessage(ok ? "Уведомления отключены" : "Не удалось отключить уведомления");
    } finally {
      setBusy(false);
    }
  }, [state]);

  if (!state.mounted) return null;

  const showEnable = state.uiStatus === "pending_permission";
  const showRestore = state.uiStatus === "granted_no_subscription";
  const showDisable = state.uiStatus === "enabled";

  return (
    <section className={patientSectionSurfaceClass}>
      <h2 className={patientSectionTitleClass}>Уведомления</h2>
      <p className={patientMutedTextClass}>{STATUS_LABEL[state.uiStatus]}</p>
      {state.uiStatus === "needs_pwa" ? (
        <p className={patientMutedTextClass}>
          Добавьте приложение на экран «Домой», затем включите уведомления.{" "}
          <Link href={routePaths.patientInstall} className="underline">
            Как установить
          </Link>
        </p>
      ) : null}
      {state.uiStatus === "denied_system" ? (
        <p className={patientMutedTextClass}>
          Откройте настройки телефона → уведомления для этого приложения и разрешите показ.
        </p>
      ) : null}
      {message ? <p className="text-sm text-[var(--patient-text-primary)]">{message}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {showEnable || showRestore ? (
          <Button type="button" disabled={busy} onClick={() => void runSubscribe()}>
            {showRestore ? "Восстановить уведомления" : "Включить уведомления"}
          </Button>
        ) : null}
        {showDisable ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void runUnsubscribe()}>
            Отключить уведомления
          </Button>
        ) : null}
      </div>
    </section>
  );
}
