"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchPatientWebPushStatus } from "@/shared/lib/webPush/patientWebPushApi";
import {
  getExistingPushSubscription,
  getPushPermissionState,
  probePushSupported,
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
import { isPushLikelyAfterPwaInstall } from "@/shared/lib/webPush/pushPlatform";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";
import { registerPatientServiceWorker } from "@/shared/lib/webPush/registerPatientServiceWorker";
import { syncLocalPushSubscriptionToServer } from "@/shared/lib/webPush/syncLocalPushSubscription";

export type WebPushClientSnapshot = {
  mounted: boolean;
  standalone: boolean;
  pushSupported: boolean;
  pushNeedsPwaInstall: boolean;
  permission: ReturnType<typeof getPushPermissionState>;
  hasLocalSubscription: boolean;
  hasServerSubscription: boolean;
  vapidConfigured: boolean;
  uiStatus: WebPushUiStatus;
  showOnboardingPrompt: boolean;
  refresh: () => Promise<void>;
  dismissOnboardingPrompt: () => void;
};

const idleSnapshot: WebPushClientSnapshot = {
  mounted: false,
  standalone: false,
  pushSupported: false,
  pushNeedsPwaInstall: false,
  permission: "unsupported",
  hasLocalSubscription: false,
  hasServerSubscription: false,
  vapidConfigured: false,
  uiStatus: "unsupported",
  showOnboardingPrompt: false,
  refresh: async () => {},
  dismissOnboardingPrompt: () => {},
};

const WebPushContext = createContext<WebPushClientSnapshot>(idleSnapshot);

export function PatientWebPushProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [permission, setPermission] = useState(getPushPermissionState);
  const [hasLocalSubscription, setHasLocalSubscription] = useState(false);
  const [hasServerSubscription, setHasServerSubscription] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [promptDismissedAt, setPromptDismissedAt] = useState<string | null>(null);

  const pushNeedsPwaInstall = isPushLikelyAfterPwaInstall();

  const refresh = useCallback(async () => {
    setStandalone(isStandalonePwa());
    setPermission(getPushPermissionState());
    setPromptDismissedAt(readPushPromptDismissedAt());

    const probed = await probePushSupported();
    setPushSupported(probed);

    const localSub = await getExistingPushSubscription();
    setHasLocalSubscription(Boolean(localSub));

    const status = await fetchPatientWebPushStatus();
    setVapidConfigured(Boolean(status.vapidConfigured));
    let serverSub = Boolean(status.hasSubscription);

    if (!serverSub && localSub && getPushPermissionState() === "granted") {
      const synced = await syncLocalPushSubscriptionToServer();
      if (synced) serverSub = true;
    }
    setHasServerSubscription(serverSub);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setMounted(true);
      void registerPatientServiceWorker();
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const uiStatus = useMemo(
    () =>
      resolveWebPushUiStatus({
        pushSupported,
        pushNeedsPwaInstall,
        standalone,
        permission,
        hasServerSubscription,
        vapidConfigured,
      }),
    [pushSupported, pushNeedsPwaInstall, standalone, permission, hasServerSubscription, vapidConfigured],
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

  const value = useMemo<WebPushClientSnapshot>(
    () => ({
      mounted,
      standalone,
      pushSupported,
      pushNeedsPwaInstall,
      permission,
      hasLocalSubscription,
      hasServerSubscription,
      vapidConfigured,
      uiStatus,
      showOnboardingPrompt,
      refresh,
      dismissOnboardingPrompt,
    }),
    [
      mounted,
      standalone,
      pushSupported,
      pushNeedsPwaInstall,
      permission,
      hasLocalSubscription,
      hasServerSubscription,
      vapidConfigured,
      uiStatus,
      showOnboardingPrompt,
      refresh,
      dismissOnboardingPrompt,
    ],
  );

  return <WebPushContext.Provider value={value}>{children}</WebPushContext.Provider>;
}

export function useWebPushClientState(): WebPushClientSnapshot {
  return useContext(WebPushContext);
}
