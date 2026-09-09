'use client';

import { Suspense, useEffect } from 'react';
import { isMessengerMiniAppHost } from '@/shared/lib/messengerMiniApp';
import { isNativeShellActive } from '@/shared/lib/nativeShellRuntime';
import { AppAccessDeniedToastEffect } from '@/shared/ui/AppAccessDeniedToastEffect';

/**
 * Регистрация `public/sw.js` с главной `/` (scope = /app). Не в Capacitor native shell (M1-07).
 * Не импортирует routePaths — клиентский бандл не тянет серверные модули.
 */
export function LandingPwaClientBootstrap() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!isMessengerMiniAppHost() && !isNativeShellActive() && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.register('/sw.js', { scope: '/app' }).catch(() => {});
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <Suspense fallback={null}>
      <AppAccessDeniedToastEffect />
    </Suspense>
  );
}
