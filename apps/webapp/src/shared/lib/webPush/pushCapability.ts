import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";
import { isAndroidDevice, isIosTouchDevice } from "@/shared/lib/webPush/pushPlatform";
import { registerPatientServiceWorker } from "@/shared/lib/webPush/registerPatientServiceWorker";

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

const SW_READY_TIMEOUT_MS = 10_000;

export function hasNotificationAndServiceWorker(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window && "serviceWorker" in navigator;
}

/** Быстрая проверка до async-probe (может быть true на iOS PWA до появления pushManager). */
export function isPushSupportedSync(): boolean {
  if (!hasNotificationAndServiceWorker()) return false;
  if ("PushManager" in window) return true;
  if (isStandalonePwa() && (isIosTouchDevice() || isAndroidDevice())) return true;
  return false;
}

/** @deprecated alias */
export function isPushSupported(): boolean {
  return isPushSupportedSync();
}

export function getPushPermissionState(): PushPermissionState {
  if (!hasNotificationAndServiceWorker()) return "unsupported";
  const perm = Notification.permission;
  if (perm === "granted" || perm === "denied" || perm === "default") return perm;
  return "unsupported";
}

function registrationHasPushManager(reg: ServiceWorkerRegistration): boolean {
  return "pushManager" in reg && reg.pushManager != null;
}

/** Регистрация SW + probe pushManager (iOS PWA, Android). */
export async function probePushSupported(): Promise<boolean> {
  if (isMessengerMiniAppHost()) return false;
  if (!hasNotificationAndServiceWorker()) return false;
  if ("PushManager" in window) return true;
  const reg = await getServiceWorkerRegistration();
  return reg != null && registrationHasPushManager(reg);
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (isMessengerMiniAppHost()) return null;
  if (!("serviceWorker" in navigator)) return null;

  try {
    const existing = await navigator.serviceWorker.getRegistration("/app");
    if (existing?.active) return existing;
  } catch {
    /* continue */
  }

  const registered = await registerPatientServiceWorker();
  if (registered?.active) return registered;

  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("sw_ready_timeout")), SW_READY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return registered;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (isMessengerMiniAppHost()) return null;
  if (!hasNotificationAndServiceWorker()) return null;
  try {
    const reg = await getServiceWorkerRegistration();
    if (!reg || !registrationHasPushManager(reg)) return null;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}
