"use client";

import { useEffect, useState } from "react";
import { fetchStaffWebPushStatus } from "@/shared/lib/webPush/staffWebPushApi";
import { DoctorWebPushControls } from "@/app/app/settings/DoctorWebPushControls";

/** Push opt-in на странице установки staff PWA (после установки). */
export function StaffPwaPushOptIn() {
  const [hasSubscription, setHasSubscription] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const status = await fetchStaffWebPushStatus();
        setHasSubscription(Boolean(status.hasSubscription));
        setGlobalEnabled(status.globalWebPushEnabled !== false);
      } catch {
        /* vitest/jsdom or offline — keep defaults */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded) return null;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm font-medium">Уведомления</p>
      <DoctorWebPushControls
        initialHasSubscription={hasSubscription}
        initialGlobalEnabled={globalEnabled}
      />
    </div>
  );
}
