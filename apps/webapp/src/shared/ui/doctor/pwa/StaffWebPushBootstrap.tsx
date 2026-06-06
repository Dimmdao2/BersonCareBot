"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchStaffWebPushStatus } from "@/shared/lib/webPush/staffWebPushApi";
import { restoreStaffWebPushSubscription } from "@/shared/lib/webPush/subscribeStaffWebPush";

const SW_MESSAGE_TYPE = "WEB_PUSH_SUBSCRIPTION_CHANGE";

/** Auto-restore staff push subscription after pushsubscriptionchange (same SW as patient). */
export function StaffWebPushBootstrap() {
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type !== SW_MESSAGE_TYPE) return;
      void (async () => {
        const status = await fetchStaffWebPushStatus();
        if (status.globalWebPushEnabled === false) return;
        const result = await restoreStaffWebPushSubscription();
        if (result.ok) router.refresh();
      })();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
