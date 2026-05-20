import type { PushPermissionState } from "@/shared/lib/webPush/pushCapability";
import { unsubscribeAllPatientWebPush } from "@/shared/lib/webPush/patientWebPushApi";

/**
 * Сброс серверных подписок, когда браузер уже не может доставлять push
 * (permission не granted или нет локальной подписки при «default»).
 */
export async function reconcileStalePatientWebPushSubscriptions(input: {
  permission: PushPermissionState;
  hasLocalSubscription: boolean;
  hasServerSubscription: boolean;
}): Promise<boolean> {
  if (!input.hasServerSubscription) return false;

  if (input.permission === "denied") {
    return unsubscribeAllPatientWebPush();
  }

  if (input.permission === "default" && !input.hasLocalSubscription) {
    return unsubscribeAllPatientWebPush();
  }

  return false;
}
