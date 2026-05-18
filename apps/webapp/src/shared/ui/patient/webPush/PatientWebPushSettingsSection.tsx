"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import { restorePatientWebPushSubscription, subscribePatientWebPush } from "@/shared/lib/webPush/subscribePatientWebPush";
import type { WebPushUiStatus } from "@/shared/lib/webPush/pushOnboardingEligibility";
import { patientMutedTextClass, patientSectionSurfaceClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";
import { useWebPushClientState } from "@/shared/lib/webPush/useWebPushClientState";

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
      if (result.ok) {
        await state.refresh();
        setMessage("Уведомления включены");
        return;
      }
      if (result.reason === "permission_denied") {
        setMessage("Уведомления отключены. Включите их в настройках телефона.");
        await state.refresh();
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

  if (!state.mounted) return null;

  const showEnable = state.uiStatus === "pending_permission";
  const showRestore = state.uiStatus === "granted_no_subscription";

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
      {showEnable || showRestore ? (
        <Button type="button" disabled={busy} onClick={() => void runSubscribe()}>
          {showRestore ? "Восстановить уведомления" : "Включить уведомления"}
        </Button>
      ) : null}
    </section>
  );
}
