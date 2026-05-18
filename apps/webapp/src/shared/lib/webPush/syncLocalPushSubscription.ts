import { detectWebPushClientPlatform } from "@/shared/lib/webPush/pushPlatform";
import { registerPatientWebPushSubscription } from "@/shared/lib/webPush/patientWebPushApi";
import { getExistingPushSubscription, getPushPermissionState } from "@/shared/lib/webPush/pushCapability";

/** Отправить локальную PushSubscription на backend, если permission уже granted. */
export async function syncLocalPushSubscriptionToServer(): Promise<boolean> {
  if (getPushPermissionState() !== "granted") return false;
  const sub = await getExistingPushSubscription();
  if (!sub) return false;
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  return registerPatientWebPushSubscription(json, detectWebPushClientPlatform());
}
