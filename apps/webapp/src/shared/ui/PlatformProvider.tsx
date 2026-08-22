'use client';

/**
 * Клиентский контекст итогового режима UI: bot | mobile | desktop.
 * serverHint приходит из cookie на сервере; в Mini App без cookie — fallback и запись cookie.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlatformEntry, PlatformMode } from '@/shared/lib/platform';
import { DESKTOP_BREAKPOINT, serializePlatformCookie } from '@/shared/lib/platform';
import { isMessengerMiniAppHost } from '@/shared/lib/messengerMiniApp';
import { PATIENT_DEFAULT_SURFACE_NAME } from '@/config/productSurfaceNames';

export const PlatformContext = createContext<PlatformMode>('mobile');

/**
 * TPB-09: server-resolved (env-overridable) standard patient app display name, threaded to
 * `'use client'` components through the one provider already mounted once at the root layout
 * (`RootLayout` in `app/layout.tsx` — see `patientSurfaceName` prop below). The literal here is
 * only the fallback for a tree rendered without this provider (isolated component tests); real
 * app render always goes through `RootLayout`, so this default never masks an unset env override.
 */
export const PatientSurfaceNameContext = createContext<string>(PATIENT_DEFAULT_SURFACE_NAME);

/** Client hook for the env-overridable standard patient app display name (TPB-09). */
export function usePatientSurfaceName(): string {
  return useContext(PatientSurfaceNameContext);
}

type Props = {
  serverHint: PlatformEntry;
  /** Server-resolved standard patient app name (`config/productSurfaces.ts`, TPB-09). */
  patientSurfaceName: string;
  children: ReactNode;
};

function isSecureClient(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

function initialModeFromHint(hint: PlatformEntry): PlatformMode {
  return hint === 'bot' ? 'bot' : 'mobile';
}

export function PlatformProvider({ serverHint, patientSurfaceName, children }: Props) {
  const [mode, setMode] = useState<PlatformMode>(() => initialModeFromHint(serverHint));
  const syncedEntryRef = useRef<PlatformEntry | null>(null);

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
    <PatientSurfaceNameContext.Provider value={patientSurfaceName}>
      <PlatformContext.Provider value={mode}>{children}</PlatformContext.Provider>
    </PatientSurfaceNameContext.Provider>
  );
}
