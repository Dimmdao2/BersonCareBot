'use client';

/**
 * Клиентский контекст итогового режима UI: bot | mobile | desktop.
 * serverHint приходит из cookie на сервере; в Mini App без cookie — fallback и запись cookie.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlatformEntry, PlatformMode, NativeRuntimeSnapshot } from '@/shared/lib/platform';
import { BROWSER_NATIVE_RUNTIME, DESKTOP_BREAKPOINT, serializePlatformCookie } from '@/shared/lib/platform';
import { isMessengerMiniAppHost } from '@/shared/lib/messengerMiniApp';
import { detectNativeRuntimeSnapshot, isNativeShellActive } from '@/shared/lib/nativeShellRuntime';
import { PATIENT_DEFAULT_SURFACE_NAME } from '@/config/productSurfaceNames';

export const PlatformContext = createContext<PlatformMode>('mobile');

/**
 * NativeRuntime (M3-01/M3-02) rides the same, single `PlatformProvider` mount point as `PlatformMode`
 * instead of a parallel global provider — `PlatformMode` (bot|mobile|desktop) stays orthogonal to native
 * kind (`AGENTS.md` §5 "один общий проход"). Safe default until the async adapter confirms native.
 */
export const NativeRuntimeContext = createContext<NativeRuntimeSnapshot>(BROWSER_NATIVE_RUNTIME);

/**
 * Видимое имя продукта для ТЕКУЩЕЙ поверхности запроса (TPB-08/TPB-09), протянутое в
 * `'use client'`-дерево через единственный провайдер, уже смонтированный один раз в корневом layout
 * (`RootLayout` в `app/layout.tsx` — проп `surfaceName` ниже). Значение решает
 * `config/surfaceRoutes.ts`: на patient-поверхности это env-переопределяемое имя пациентского
 * приложения, на staff-поверхности — `Therapysto`. Литерал здесь — только fallback для дерева,
 * отрендеренного без провайдера (изолированные тесты компонентов); реальный рендер всегда идёт
 * через `RootLayout`.
 */
export const SurfaceNameContext = createContext<string>(PATIENT_DEFAULT_SURFACE_NAME);

/** Client hook for the display name of the current request surface. */
export function useSurfaceName(): string {
  return useContext(SurfaceNameContext);
}

type Props = {
  serverHint: PlatformEntry;
  /** Имя поверхности, разрешённое на сервере (`shared/lib/surface/surfaceLayoutMetadata.ts`). */
  surfaceName: string;
  children: ReactNode;
};

function isSecureClient(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

function initialModeFromHint(hint: PlatformEntry): PlatformMode {
  return hint === 'bot' ? 'bot' : 'mobile';
}

export function PlatformProvider({ serverHint, surfaceName, children }: Props) {
  const [mode, setMode] = useState<PlatformMode>(() => initialModeFromHint(serverHint));
  const [nativeRuntime, setNativeRuntime] = useState<NativeRuntimeSnapshot>(BROWSER_NATIVE_RUNTIME);
  const syncedEntryRef = useRef<PlatformEntry | null>(null);

  useEffect(() => {
    if (!isNativeShellActive()) return;
    let cancelled = false;
    void detectNativeRuntimeSnapshot().then((snapshot) => {
      if (!cancelled) setNativeRuntime(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);

    const syncFromEnvironment = () => {
      if (cancelled) return;
      const inMini = isMessengerMiniAppHost();
      /** Не понижать cookie/mode с `bot`, пока клиент не увидел WebView (иначе гонка после middleware). */
      const desiredEntry: PlatformEntry = inMini || serverHint === 'bot' ? 'bot' : 'standalone';
      if (desiredEntry !== syncedEntryRef.current) {
        syncedEntryRef.current = desiredEntry;
        document.cookie = serializePlatformCookie(desiredEntry, { secure: isSecureClient() });
      }
      if (inMini || serverHint === 'bot') {
        setMode('bot');
        return;
      }
      setMode(mq.matches ? 'desktop' : 'mobile');
    };

    queueMicrotask(syncFromEnvironment);

    const onViewportChange = () => {
      if (isMessengerMiniAppHost()) return;
      setMode(mq.matches ? 'desktop' : 'mobile');
    };
    mq.addEventListener('change', onViewportChange);
    return () => {
      cancelled = true;
      mq.removeEventListener('change', onViewportChange);
    };
  }, [serverHint]);

  return (
    <SurfaceNameContext.Provider value={surfaceName}>
      <PlatformContext.Provider value={mode}>
        <NativeRuntimeContext.Provider value={nativeRuntime}>{children}</NativeRuntimeContext.Provider>
      </PlatformContext.Provider>
    </SurfaceNameContext.Provider>
  );
}
