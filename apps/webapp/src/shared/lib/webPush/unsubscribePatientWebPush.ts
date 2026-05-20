import { unsubscribeAllPatientWebPush } from "@/shared/lib/webPush/patientWebPushApi";
import { getExistingPushSubscription } from "@/shared/lib/webPush/pushCapability";

/** Снимает все server-подписки и локальную PushSubscription (кнопка «Отключить» в кабинете). */
export async function unsubscribePatientWebPush(): Promise<boolean> {
  const sub = await getExistingPushSubscription();
  const serverOk = await unsubscribeAllPatientWebPush();
  if (!serverOk) return false;

  if (!sub) return true;

  try {
    await sub.unsubscribe();
  } catch {
    /* endpoint already removed server-side */
  }
  return true;
}
