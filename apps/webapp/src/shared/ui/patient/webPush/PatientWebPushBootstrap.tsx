"use client";

import { useEffect } from "react";
import { getPushPermissionState, isPushSupported } from "@/shared/lib/webPush/pushCapability";
import { reportPwaLaunchSnapshot } from "@/shared/lib/webPush/patientWebPushApi";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";
import { useWebPushClientState } from "@/shared/lib/webPush/useWebPushClientState";
import { PatientWebPushOnboardingCard } from "@/shared/ui/patient/webPush/PatientWebPushOnboardingCard";

/** Registers SW, optional launch analytics, standalone push onboarding card. */
export function PatientWebPushBootstrap() {
  const state = useWebPushClientState();

  useEffect(() => {
    if (!state.mounted) return;
    const standalone = isStandalonePwa();
    if (!standalone) return;
    void reportPwaLaunchSnapshot({
      isStandalone: true,
      pushSupported: isPushSupported(),
      notificationPermission: getPushPermissionState(),
    });
  }, [state.mounted]);

  return <PatientWebPushOnboardingCard state={state} />;
}
