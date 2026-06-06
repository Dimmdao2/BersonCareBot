import { detectWebPushClientPlatform } from "@/shared/lib/webPush/pushPlatform";
import { fetchStaffWebPushStatus, registerStaffWebPushSubscription } from "@/shared/lib/webPush/staffWebPushApi";
import {
  getExistingPushSubscription,
  getPushPermissionState,
  getServiceWorkerRegistration,
  hasNotificationAndServiceWorker,
  probePushSupported,
} from "@/shared/lib/webPush/pushCapability";
import { registerPatientServiceWorker } from "@/shared/lib/webPush/registerPatientServiceWorker";
import { urlBase64ToUint8Array } from "@/shared/lib/webPush/urlBase64ToUint8Array";

export type SubscribeStaffWebPushResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unsupported"
        | "vapid_unavailable"
        | "permission_denied"
        | "permission_default"
        | "save_failed"
        | "error";
    };

async function subscribeOnRegistration(
  publicKey: string,
  reg: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  if (!("pushManager" in reg)) return null;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  return sub;
}

export async function subscribeStaffWebPush(): Promise<SubscribeStaffWebPushResult> {
  if (!(await probePushSupported())) return { ok: false, reason: "unsupported" };

  const status = await fetchStaffWebPushStatus();
  if (!status.vapidConfigured || !status.publicKey) {
    return { ok: false, reason: "vapid_unavailable" };
  }

  await registerPatientServiceWorker();
  const perm = await Notification.requestPermission();
  if (perm === "denied") return { ok: false, reason: "permission_denied" };
  if (perm !== "granted") return { ok: false, reason: "permission_default" };

  try {
    const reg = await getServiceWorkerRegistration();
    if (!reg) return { ok: false, reason: "error" };
    const sub = await subscribeOnRegistration(status.publicKey, reg);
    if (!sub) return { ok: false, reason: "error" };
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "error" };
    }
    const saved = await registerStaffWebPushSubscription(json, detectWebPushClientPlatform());
    if (!saved) return { ok: false, reason: "save_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function restoreStaffWebPushSubscription(): Promise<SubscribeStaffWebPushResult> {
  if (!(await probePushSupported())) return { ok: false, reason: "unsupported" };
  if (getPushPermissionState() !== "granted") {
    return subscribeStaffWebPush();
  }

  const status = await fetchStaffWebPushStatus();
  if (!status.vapidConfigured || !status.publicKey) {
    return { ok: false, reason: "vapid_unavailable" };
  }

  await registerPatientServiceWorker();

  try {
    const reg = await getServiceWorkerRegistration();
    if (!reg) return { ok: false, reason: "error" };
    let sub = await getExistingPushSubscription();
    if (!sub) {
      sub = await subscribeOnRegistration(status.publicKey, reg);
    }
    if (!sub) return { ok: false, reason: "error" };
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "error" };
    }
    const saved = await registerStaffWebPushSubscription(json, detectWebPushClientPlatform());
    if (!saved) return { ok: false, reason: "save_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** @internal for tests */
export function canAttemptStaffPushSubscribe(): boolean {
  return hasNotificationAndServiceWorker();
}
