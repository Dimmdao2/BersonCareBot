"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPatientWebPushStatus } from "@/shared/lib/webPush/patientWebPushApi";
import {
  getExistingPushSubscription,
  getPushPermissionState,
  isPushSupported,
} from "@/shared/lib/webPush/pushCapability";
import {
  PUSH_PROMPT_DISMISS_COOLDOWN_DAYS,
  readPushPromptDismissedAt,
  writePushPromptDismissedAt,
} from "@/shared/lib/webPush/pushPromptStorage";
import {
  resolveWebPushUiStatus,
  shouldShowPushOnboardingPrompt,
  type WebPushUiStatus,
} from "@/shared/lib/webPush/pushOnboardingEligibility";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";
import { registerPatientServiceWorker } from "@/shared/lib/webPush/registerPatientServiceWorker";

export type WebPushClientSnapshot = {
  mounted: boolean;
  standalone: boolean;
  pushSupported: boolean;
  permission: ReturnType<typeof getPushPermissionState>;
  hasLocalSubscription: boolean;
  hasServerSubscription: boolean;
  vapidConfigured: boolean;
  uiStatus: WebPushUiStatus;
  showOnboardingPrompt: boolean;
  refresh: () => Promise<void>;
  dismissOnboardingPrompt: () => void;
};

export function useWebPushClientState(): WebPushClientSnapshot {
  const [mounted, setMounted] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [permission, setPermission] = useState(getPushPermissionState);
  const [hasLocalSubscription, setHasLocalSubscription] = useState(false);
  const [hasServerSubscription, setHasServerSubscription] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [promptDismissedAt, setPromptDismissedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStandalone(isStandalonePwa());
    setPermission(getPushPermissionState());
    setPromptDismissedAt(readPushPromptDismissedAt());

    const localSub = await getExistingPushSubscription();
    setHasLocalSubscription(Boolean(localSub));

    const status = await fetchPatientWebPushStatus();
    setVapidConfigured(Boolean(status.vapidConfigured));
    setHasServerSubscription(Boolean(status.hasSubscription));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setMounted(true);
      void registerPatientServiceWorker();
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const pushSupported = isPushSupported();

  const hasSubscription = hasLocalSubscription || hasServerSubscription;

  const uiStatus = useMemo(
    () =>
      resolveWebPushUiStatus({
        pushSupported,
        standalone,
        permission,
        hasSubscription,
        vapidConfigured,
      }),
    [pushSupported, standalone, permission, hasSubscription, vapidConfigured],
  );

  const showOnboardingPrompt =
    mounted &&
    shouldShowPushOnboardingPrompt({
      standalone,
      pushSupported,
      permission,
      hasLocalSubscription,
      hasServerSubscription,
      promptDismissedAt,
      dismissedCooldownDays: PUSH_PROMPT_DISMISS_COOLDOWN_DAYS,
      vapidConfigured,
      now: new Date(),
    });

  const dismissOnboardingPrompt = useCallback(() => {
    const iso = new Date().toISOString();
    writePushPromptDismissedAt(iso);
    setPromptDismissedAt(iso);
  }, []);

  return {
    mounted,
    standalone,
    pushSupported,
    permission,
    hasLocalSubscription,
    hasServerSubscription,
    vapidConfigured,
    uiStatus,
    showOnboardingPrompt,
    refresh,
    dismissOnboardingPrompt,
  };
}
