import type { WebPushClientPlatform } from "@/shared/lib/webPush/pushPlatform";

export type PatientWebPushStatusResponse = {
  ok?: boolean;
  vapidConfigured?: boolean;
  publicKey?: string | null;
  hasSubscription?: boolean;
  globalWebPushEnabled?: boolean;
};

/** Удалить все push-подписки пользователя на сервере (нет локальной PushSubscription). */
export async function unsubscribeAllPatientWebPush(): Promise<boolean> {
  const res = await fetch("/api/patient/web-push/unsubscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ all: true }),
  });
  return res.ok;
}

export async function fetchPatientWebPushStatus(): Promise<PatientWebPushStatusResponse> {
  const res = await fetch("/api/patient/web-push/status", { credentials: "include" });
  if (!res.ok) {
    return {
      ok: false,
      vapidConfigured: false,
      publicKey: null,
      hasSubscription: false,
      globalWebPushEnabled: false,
    };
  }
  return (await res.json()) as PatientWebPushStatusResponse;
}

export async function registerPatientWebPushSubscription(
  subscription: PushSubscriptionJSON,
  platform: WebPushClientPlatform,
): Promise<boolean> {
  const res = await fetch("/api/patient/web-push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...subscription,
      platform,
    }),
  });
  return res.ok;
}

export async function reportPwaLaunchSnapshot(body: {
  isStandalone: boolean;
  pushSupported: boolean;
  notificationPermission: "default" | "granted" | "denied" | "unsupported";
}): Promise<void> {
  try {
    await fetch("/api/patient/pwa/launch", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* analytics only */
  }
}
