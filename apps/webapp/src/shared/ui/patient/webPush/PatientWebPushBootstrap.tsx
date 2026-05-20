"use client";

import { useEffect } from "react";
import { getPushPermissionState, probePushSupported } from "@/shared/lib/webPush/pushCapability";
import { fetchPatientWebPushStatus, reportPwaLaunchSnapshot } from "@/shared/lib/webPush/patientWebPushApi";
import { useWebPushClientState } from "@/shared/lib/webPush/PatientWebPushContext";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";
import { restorePatientWebPushSubscription } from "@/shared/lib/webPush/subscribePatientWebPush";
import { PatientWebPushFreshLoginDeniedDialog } from "@/shared/ui/patient/webPush/PatientWebPushFreshLoginDeniedDialog";
import { PatientWebPushOnboardingCard } from "@/shared/ui/patient/webPush/PatientWebPushOnboardingCard";

const SW_MESSAGE_TYPE = "WEB_PUSH_SUBSCRIPTION_CHANGE";

/** Registers SW, launch analytics, onboarding card, pushsubscriptionchange relay. */
export function PatientWebPushBootstrap() {
  const state = useWebPushClientState();

  useEffect(() => {
    if (!state.mounted) return;
    const standalone = isStandalonePwa();
    if (!standalone) return;
    void (async () => {
      await reportPwaLaunchSnapshot({
        isStandalone: true,
        pushSupported: await probePushSupported(),
        notificationPermission: getPushPermissionState(),
      });
    })();
  }, [state.mounted]);

  const { refresh } = state;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type !== SW_MESSAGE_TYPE) return;
      void (async () => {
        const status = await fetchPatientWebPushStatus();
        if (status.globalWebPushEnabled === false) return;
        const result = await restorePatientWebPushSubscription();
        if (result.ok) await refresh();
      })();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [refresh]);

  return (
    <>
      <PatientWebPushOnboardingCard />
      <PatientWebPushFreshLoginDeniedDialog />
    </>
  );
}
