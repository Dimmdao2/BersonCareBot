"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchPatientWebPushStatus } from "@/shared/lib/webPush/patientWebPushApi";
import {
  getExistingPushSubscription,
  getPushPermissionState,
  probePushSupported,
} from "@/shared/lib/webPush/pushCapability";
import { consumeFreshLoginFlag } from "@/shared/lib/webPush/freshLoginStorage";
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
import { reconcileStalePatientWebPushSubscriptions } from "@/shared/lib/webPush/reconcilePatientWebPush";
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
  globalWebPushEnabled: boolean;
  vapidConfigured: boolean;
  uiStatus: WebPushUiStatus;
  showOnboardingPrompt: boolean;
  showFreshLoginDeniedPrompt: boolean;
  dismissFreshLoginDeniedPrompt: () => void;
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
  globalWebPushEnabled: false,
  vapidConfigured: false,
  uiStatus: "unsupported",
  showOnboardingPrompt: false,
  showFreshLoginDeniedPrompt: false,
  dismissFreshLoginDeniedPrompt: () => {},
  refresh: async () => {},
  dismissOnboardingPrompt: () => {},
};

const WebPushContext = createContext<WebPushClientSnapshot>(idleSnapshot);

const REFRESH_DEBOUNCE_MS = 300;

export function PatientWebPushProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [permission, setPermission] = useState(getPushPermissionState);
  const [hasLocalSubscription, setHasLocalSubscription] = useState(false);
  const [hasServerSubscription, setHasServerSubscription] = useState(false);
  const [globalWebPushEnabled, setGlobalWebPushEnabled] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [promptDismissedAt, setPromptDismissedAt] = useState<string | null>(null);
  const [showFreshLoginDeniedPrompt, setShowFreshLoginDeniedPrompt] = useState(false);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushNeedsPwaInstall = isPushLikelyAfterPwaInstall();

  const refresh = useCallback(async () => {
    setStandalone(isStandalonePwa());
    const perm = getPushPermissionState();
    setPermission(perm);
    setPromptDismissedAt(readPushPromptDismissedAt());

    const probed = await probePushSupported();
    setPushSupported(probed);

    const localSub = await getExistingPushSubscription();
    const hasLocal = Boolean(localSub);
    setHasLocalSubscription(hasLocal);

    const status = await fetchPatientWebPushStatus();
    setVapidConfigured(Boolean(status.vapidConfigured));
    let serverSub = Boolean(status.hasSubscription);
    const globalEnabled = status.globalWebPushEnabled !== false;
    setGlobalWebPushEnabled(globalEnabled);

    if (serverSub) {
      const reconciled = await reconcileStalePatientWebPushSubscriptions({
        permission: perm,
        hasLocalSubscription: hasLocal,
        hasServerSubscription: serverSub,
        globalWebPushEnabled: globalEnabled,
      });
      if (reconciled) {
        serverSub = false;
        setGlobalWebPushEnabled(false);
      }
    }

    if (!serverSub && localSub && perm === "granted" && globalEnabled) {
      const synced = await syncLocalPushSubscriptionToServer();
      if (synced) {
        serverSub = true;
        setGlobalWebPushEnabled(true);
      }
    }
    setHasServerSubscription(serverSub);
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = window.setTimeout(() => {
      refreshDebounceRef.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setMounted(true);
      void registerPatientServiceWorker();
      void refresh().then(() => {
        if (!isStandalonePwa()) return;
        const freshLogin = consumeFreshLoginFlag();
        if (!freshLogin) return;
        const perm = getPushPermissionState();
        if (perm === "denied") {
          setShowFreshLoginDeniedPrompt(true);
        }
      });
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    const onFocus = () => scheduleRefresh();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current);
    };
  }, [scheduleRefresh]);

  const uiStatus = useMemo(
    () =>
      resolveWebPushUiStatus({
        pushSupported,
        pushNeedsPwaInstall,
        standalone,
        permission,
        hasLocalSubscription,
        hasServerSubscription,
        globalWebPushEnabled,
        vapidConfigured,
      }),
    [
      pushSupported,
      pushNeedsPwaInstall,
      standalone,
      permission,
      hasLocalSubscription,
      hasServerSubscription,
      globalWebPushEnabled,
      vapidConfigured,
    ],
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

  const dismissFreshLoginDeniedPrompt = useCallback(() => {
    setShowFreshLoginDeniedPrompt(false);
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
      globalWebPushEnabled,
      vapidConfigured,
      uiStatus,
      showOnboardingPrompt,
      showFreshLoginDeniedPrompt,
      dismissFreshLoginDeniedPrompt,
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
      globalWebPushEnabled,
      vapidConfigured,
      uiStatus,
      showOnboardingPrompt,
      showFreshLoginDeniedPrompt,
      dismissFreshLoginDeniedPrompt,
      refresh,
      dismissOnboardingPrompt,
    ],
  );

  return <WebPushContext.Provider value={value}>{children}</WebPushContext.Provider>;
}

export function useWebPushClientState(): WebPushClientSnapshot {
  return useContext(WebPushContext);
}
