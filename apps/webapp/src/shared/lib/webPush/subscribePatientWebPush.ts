import { detectWebPushClientPlatform } from "@/shared/lib/webPush/pushPlatform";
import { fetchPatientWebPushStatus, registerPatientWebPushSubscription } from "@/shared/lib/webPush/patientWebPushApi";
import { getExistingPushSubscription, getPushPermissionState, isPushSupported } from "@/shared/lib/webPush/pushCapability";
import { registerPatientServiceWorker } from "@/shared/lib/webPush/registerPatientServiceWorker";
import { urlBase64ToUint8Array } from "@/shared/lib/webPush/urlBase64ToUint8Array";

export type SubscribePatientWebPushResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "vapid_unavailable" | "permission_denied" | "permission_default" | "save_failed" | "error" };

/**
 * User-gesture flow: request permission, subscribe, persist on server.
 * Call only from click handlers — never on page load.
 */
export async function subscribePatientWebPush(): Promise<SubscribePatientWebPushResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const status = await fetchPatientWebPushStatus();
  if (!status.vapidConfigured || !status.publicKey) {
    return { ok: false, reason: "vapid_unavailable" };
  }

  await registerPatientServiceWorker();
  const perm = await Notification.requestPermission();
  if (perm === "denied") return { ok: false, reason: "permission_denied" };
  if (perm !== "granted") return { ok: false, reason: "permission_default" };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.publicKey) as BufferSource,
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "error" };
    }
    const saved = await registerPatientWebPushSubscription(json, detectWebPushClientPlatform());
    if (!saved) return { ok: false, reason: "save_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Re-subscribe when permission is already granted but PushSubscription is missing. */
export async function restorePatientWebPushSubscription(): Promise<SubscribePatientWebPushResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (getPushPermissionState() !== "granted") {
    return subscribePatientWebPush();
  }

  const status = await fetchPatientWebPushStatus();
  if (!status.vapidConfigured || !status.publicKey) {
    return { ok: false, reason: "vapid_unavailable" };
  }

  await registerPatientServiceWorker();

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await getExistingPushSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.publicKey) as BufferSource,
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "error" };
    }
    const saved = await registerPatientWebPushSubscription(json, detectWebPushClientPlatform());
    if (!saved) return { ok: false, reason: "save_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
