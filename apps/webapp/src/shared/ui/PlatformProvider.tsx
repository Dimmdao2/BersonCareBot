"use client";

/**
 * Клиентский контекст итогового режима UI: bot | mobile | desktop.
 * serverHint приходит из cookie на сервере; в Mini App без cookie — fallback и запись cookie.
 */

import {
  createContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { PlatformEntry, PlatformMode } from "@/shared/lib/platform";
import {
  DESKTOP_BREAKPOINT,
  serializePlatformCookie,
} from "@/shared/lib/platform";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";

export const PlatformContext = createContext<PlatformMode>("mobile");

type Props = {
  serverHint: PlatformEntry;
  children: ReactNode;
};

function isSecureClient(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

function initialModeFromHint(hint: PlatformEntry): PlatformMode {
  return hint === "bot" ? "bot" : "mobile";
}

export function PlatformProvider({ serverHint, children }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<PlatformMode>(() => initialModeFromHint(serverHint));
  const syncedEntryRef = useRef<PlatformEntry | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);

    const syncFromEnvironment = () => {
      if (cancelled) return;
      const inMini = isMessengerMiniAppHost();
      /** Не понижать cookie/mode с `bot`, пока клиент не увидел WebView (иначе гонка после middleware). */
      const desiredEntry: PlatformEntry = inMini || serverHint === "bot" ? "bot" : "standalone";
      if (serverHint !== desiredEntry) {
        document.cookie = serializePlatformCookie(desiredEntry, { secure: isSecureClient() });
        if (syncedEntryRef.current !== desiredEntry) {
          syncedEntryRef.current = desiredEntry;
          router.refresh();
        }
      }
      if (inMini || serverHint === "bot") {
        setMode("bot");
        return;
      }
      setMode(mq.matches ? "desktop" : "mobile");
    };

    // Отложить setState из эффекта (eslint react-hooks/set-state-in-effect).
    queueMicrotask(syncFromEnvironment);

    const onViewportChange = () => {
      if (isMessengerMiniAppHost()) return;
      setMode(mq.matches ? "desktop" : "mobile");
    };
    mq.addEventListener("change", onViewportChange);
    return () => {
      cancelled = true;
      mq.removeEventListener("change", onViewportChange);
    };
  }, [router, serverHint]);

  return (
    <PlatformContext.Provider value={mode}>{children}</PlatformContext.Provider>
  );
}
