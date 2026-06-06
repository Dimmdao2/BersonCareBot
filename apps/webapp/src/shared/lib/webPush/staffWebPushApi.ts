import type { WebPushClientPlatform } from "@/shared/lib/webPush/pushPlatform";

export type StaffWebPushStatusResponse = {
  ok?: boolean;
  vapidConfigured?: boolean;
  publicKey?: string | null;
  hasSubscription?: boolean;
  globalWebPushEnabled?: boolean;
};

export async function unsubscribeAllStaffWebPush(): Promise<boolean> {
  const res = await fetch("/api/doctor/web-push/unsubscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ all: true }),
  });
  return res.ok;
}

export async function fetchStaffWebPushStatus(): Promise<StaffWebPushStatusResponse> {
  const res = await fetch("/api/doctor/web-push/status", { credentials: "include" });
  if (!res.ok) {
    return {
      ok: false,
      vapidConfigured: false,
      publicKey: null,
      hasSubscription: false,
      globalWebPushEnabled: false,
    };
  }
  return (await res.json()) as StaffWebPushStatusResponse;
}

export async function registerStaffWebPushSubscription(
  subscription: PushSubscriptionJSON,
  platform: WebPushClientPlatform,
): Promise<boolean> {
  const res = await fetch("/api/doctor/web-push/subscribe", {
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
