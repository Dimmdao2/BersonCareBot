"use client";

import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { probePushSupported } from "@/shared/lib/webPush/pushCapability";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";
import { subscribePatientWebPush } from "@/shared/lib/webPush/subscribePatientWebPush";

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
      if (result.reason === "permission_denied") {
        toast.error("Разрешение не выдано");
        return;
      }
      if (result.reason === "vapid_unavailable") {
        toast.error("Push недоступен");
        return;
      }
      toast.error("Не удалось включить уведомления");
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
