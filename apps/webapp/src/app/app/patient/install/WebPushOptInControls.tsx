"use client";

import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function WebPushOptInControls() {
  const [busy, setBusy] = useState(false);

  const onEnable = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast.error("Уведомления не поддерживаются");
      return;
    }
    setBusy(true);
    try {
      const st = await fetch("/api/patient/web-push/status", { credentials: "include" });
      const j = (await st.json()) as {
        vapidConfigured?: boolean;
        publicKey?: string | null;
      };
      if (!st.ok || !j.vapidConfigured || !j.publicKey) {
        toast.error("Push недоступен");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Разрешение не выдано");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/app" });
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(j.publicKey),
      });
      const r = await fetch("/api/patient/web-push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!r.ok) {
        toast.error("Не удалось сохранить подписку");
        return;
      }
      toast.success("Готово");
    } catch {
      toast.error("Ошибка");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Button type="button" variant="secondary" disabled={busy} onClick={() => void onEnable()}>
      Включить уведомления в браузере
    </Button>
  );
}
