"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  isStaffPwaInstallComplete,
  markStaffPwaInstalled,
} from "@/shared/lib/pwa/staffPwaInstallState";
import { StaffPwaPushOptIn } from "@/shared/ui/doctor/pwa/StaffPwaPushOptIn";

type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  return navigator.platform === "MacIntel" && maxTouchPoints > 1;
}

function isLikelySafariNotChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Chrome|CriOS|Edg|OPR|Opera|FxiOS|Firefox/i.test(ua)) return false;
  return /Safari/i.test(ua);
}

export function StaffPwaInstallSection() {
  const [mounted, setMounted] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEventLike | null>(null);
  const [installedAck, setInstalledAck] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEventLike);
    };
    const onAppInstalled = () => {
      markStaffPwaInstalled();
      setInstalledAck(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const t = window.setTimeout(() => {
      setMounted(true);
      setIsIos(isIosTouchDevice());
      setIsSafari(isLikelySafariNotChromium());
    }, 0);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const onInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    void deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const done = isStaffPwaInstallComplete(installedAck);

  if (!mounted) return <div className="min-h-[5.5rem]" aria-hidden />;

  if (done) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-800">
          Приложение на устройстве — открывайте кабинет с домашнего экрана.
        </p>
        <StaffPwaPushOptIn />
      </div>
    );
  }

  if (isIos) {
    return (
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p>
          Меню <strong className="text-foreground">Поделиться</strong> →{" "}
          <strong className="text-foreground">На экран «Домой»</strong>.
        </p>
        <p>После установки ярлык откроет кабинет специалиста.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deferredPrompt ? (
        <Button type="button" size="sm" onClick={() => void onInstallClick()}>
          Установить
        </Button>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {isSafari ? (
          <>
            На Mac — <strong className="text-foreground">Файл</strong> →{" "}
            <strong className="text-foreground">Добавить в Dock</strong>. Либо откройте в Chrome или Edge.
          </>
        ) : (
          <>Меню браузера (⋮) → «Установить приложение…».</>
        )}
      </p>
    </div>
  );
}
