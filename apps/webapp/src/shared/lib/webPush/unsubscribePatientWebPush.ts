import { getExistingPushSubscription } from "@/shared/lib/webPush/pushCapability";

export async function unsubscribePatientWebPush(): Promise<boolean> {
  const sub = await getExistingPushSubscription();
  if (!sub) return true;

  const endpoint = sub.endpoint;
  const res = await fetch("/api/patient/web-push/unsubscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) return false;

  try {
    await sub.unsubscribe();
  } catch {
    /* endpoint already removed server-side */
  }
  return true;
}
