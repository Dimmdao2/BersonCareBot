'use client';

import { useCallback, useEffect, useState } from 'react';
import { routePaths } from '@/app-layer/routes/paths';
import { Button } from '@/shared/ui/patient/primitives/button';
import { isMessengerMiniAppHost } from '@/shared/lib/messengerMiniApp';
import { isStandalonePwa } from '@/shared/lib/webPush/pwaDisplay';
import { useSurfaceName } from '@/shared/ui/PlatformProvider';
import { usePatientTerms } from '@/shared/ui/patient/organization/PatientOrganizationContext';

/** Chromium install prompt (не все конфигурации `tsc` подтягивают тип из DOM lib). */
type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isIosTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  return navigator.platform === 'MacIntel' && maxTouchPoints > 1;
}

/** Safari / WebKit без Chromium: у Safari нет меню «⋯» как в Chrome. */
function isLikelySafariNotChromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Chrome|CriOS|Edg|OPR|Opera|FxiOS|Firefox/i.test(ua)) return false;
  return /Safari/i.test(ua);
}

/** Блок установки PWA: Chrome (`beforeinstallprompt`), iOS (текст), без SW в Mini App. */
export function PwaInstallSection() {
  const surfaceName = useSurfaceName();
  const { patientGenitive } = usePatientTerms();
  const [mounted, setMounted] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEventLike | null>(null);
  const [installedAck, setInstalledAck] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEventLike);
    };

    const onAppInstalled = () => {
      setInstalledAck(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    // Defer setState out of the effect body (react-hooks/set-state-in-effect).
    const t = window.setTimeout(() => {
      setMounted(true);
      setIsIos(isIosTouchDevice());
      setIsSafari(isLikelySafariNotChromium());
      setStandalone(isStandalonePwa());
      if (!isMessengerMiniAppHost() && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.register('/sw.js', { scope: routePaths.root }).catch(() => {});
      }
    }, 0);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const onInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    void deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const done = standalone || installedAck;

  return (
    <section
      className="rounded-[12px] border border-[#dce4f5] bg-white/95 p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur-[2px]"
      aria-labelledby="pwa-install-heading"
    >
      <h2
        id="pwa-install-heading"
        className="patient-type-section-title patient-text-accent"
      >
        Установить приложение
      </h2>

      {!mounted ? <div className="mt-4 min-h-[5.5rem]" aria-hidden /> : null}

      {mounted && done ? (
        <p className="mt-3 patient-type-secondary patient-text-success">
          Приложение на устройстве — открывайте с домашнего экрана.
        </p>
      ) : null}

      {mounted && !done && isIos ? (
        <div className="mt-3 space-y-2 patient-type-secondary">
          <p>
            Меню <strong>Поделиться</strong> → <strong>На экран «Домой»</strong> (в Safari шаги
            такие; в Chrome на iOS названия могут отличаться — ищите добавление на домашний экран).
          </p>
          <p className="text-muted-foreground">После установки ярлык откроет кабинет {patientGenitive}.</p>
        </div>
      ) : null}

      {mounted && !done && !isIos ? (
        <div className="mt-4 space-y-3">
          {deferredPrompt ? (
            <Button
              type="button"
              onClick={() => void onInstallClick()}
              className="bg-[var(--patient-color-primary)] hover:bg-[var(--patient-color-primary-hover)]"
            >
              Установить
            </Button>
          ) : null}
          <p className="patient-type-secondary">
            {isSafari ? (
              <>
                На Mac — <strong>Файл</strong> → <strong>Добавить в Dock</strong>. Либо откройте эту
                страницу в Chrome или Edge — там установка в меню браузера (⋮).
              </>
            ) : (
              <>
                Если кнопки нет: меню браузера (⋮) → «Установить приложение…» или «Приложение
                {` ${surfaceName}…».`}
              </>
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}
