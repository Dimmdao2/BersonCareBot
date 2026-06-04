"use client";

import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/shared/ui/patient/primitives/button";
import { probePushSupported } from "@/shared/lib/webPush/pushCapability";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";
import { subscribePatientWebPush } from "@/shared/lib/webPush/subscribePatientWebPush";
import { webPushSubscribeFailureMessage } from "@/shared/lib/webPush/webPushSubscribeFeedback";

export function WebPushOptInControls() {
  const [busy, setBusy] = useState(false);

  const onEnable = useCallback(async () => {
    if (!(await probePushSupported()) && !isStandalonePwa()) {
      toast.error("Сначала откройте приложение с иконки на главном экране");
      return;
    }
    if (!(await probePushSupported())) {
      toast.error("Уведомления не поддерживаются");
      return;
    }
    setBusy(true);
    try {
      const result = await subscribePatientWebPush();
      if (result.ok) {
        toast.success("Готово");
        return;
      }
      toast.error(webPushSubscribeFailureMessage(result.reason));
    } catch {
      toast.error("Ошибка");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Button type="button" variant="secondary" disabled={busy} onClick={() => void onEnable()}>
      Включить уведомления
    </Button>
  );
}
