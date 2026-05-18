export type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export function getPushPermissionState(): PushPermissionState {
  if (!isPushSupported()) return "unsupported";
  const perm = Notification.permission;
  if (perm === "granted" || perm === "denied" || perm === "default") return perm;
  return "unsupported";
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}
