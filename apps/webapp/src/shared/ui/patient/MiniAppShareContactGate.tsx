"use client";

/**
 * Мессенджерный Mini App (Telegram / MAX): сессия есть, телефона в webapp ещё нет — ждём контакт в боте → contact.linked.
 * Перед проверкой: при 401 на `/api/me` — `POST /api/auth/telegram-init` (Telegram) или `POST /api/auth/exchange` (параметр `?t=` / `?token=`).
 * `/app/patient/bind-phone` гейт не блокирует (там встроенная подсказка «через бота» для Mini App).
 */

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ensureMessengerMiniAppWebappSession } from "@/shared/lib/miniAppSessionRecovery";
import {
  getPatientMessengerContactGateDetail,
  resolveBotHrefAfterMessengerSessionLoss,
  resolveMessengerContactGateBotHref,
} from "@/shared/lib/patientMessengerContactGate";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { PatientSharePhoneViaBotPanel } from "./PatientSharePhoneViaBotPanel";

const POLL_MS = 2000;
const MAX_POLLS = 45;

type GateMode = "inactive" | "loading" | "blocked" | "timed_out" | "session_lost";

export function MiniAppShareContactGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<GateMode>("inactive");
  const [botHref, setBotHref] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const prevPathnameRef = useRef<string | null>(null);

  const clearPoll = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const releaseGate = useCallback(() => {
    clearPoll();
    startTransition(() => setMode("inactive"));
    router.refresh();
  }, [clearPoll, router]);

  useLayoutEffect(() => {
    if (!isMessengerMiniAppHost()) {
      startTransition(() => setMode("inactive"));
      return;
    }
    if (window.location.pathname.includes("/bind-phone")) {
      startTransition(() => setMode("inactive"));
      return;
    }
    startTransition(() => setMode("loading"));
  }, []);

  useEffect(() => {
    if (pathname?.includes("/bind-phone")) {
      startTransition(() => setMode("inactive"));
    }
  }, [pathname]);

  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname ?? null;
    if (prev?.includes("/bind-phone") && !pathname?.includes("/bind-phone") && isMessengerMiniAppHost()) {
      startTransition(() => setMode("loading"));
    }
  }, [pathname]);

  useEffect(() => {
    if (!isMessengerMiniAppHost()) {
      return;
    }
    if (pathname?.includes("/bind-phone")) {
      return;
    }

    let cancelled = false;

    const pollOnce = async (): Promise<void> => {
      pollCountRef.current += 1;
      await ensureMessengerMiniAppWebappSession(router);
      if (cancelled) return;
      const detail = await getPatientMessengerContactGateDetail();
      if (cancelled) return;
      if (detail.kind === "no_gate") {
        releaseGate();
        return;
      }
      if (detail.kind === "unauthenticated") {
        clearPoll();
        const href = await resolveBotHrefAfterMessengerSessionLoss();
        if (!cancelled) {
          startTransition(() => {
            setBotHref(href);
            setMode("session_lost");
          });
        }
        return;
      }
      if (pollCountRef.current >= MAX_POLLS) {
        clearPoll();
        startTransition(() => setMode("timed_out"));
      }
    };

    void (async () => {
      await ensureMessengerMiniAppWebappSession(router);
      if (cancelled) return;
      const detail = await getPatientMessengerContactGateDetail();
      if (cancelled) return;
      if (detail.kind === "unauthenticated") {
        const href = await resolveBotHrefAfterMessengerSessionLoss();
        startTransition(() => {
          setBotHref(href);
          setMode("session_lost");
        });
        return;
      }
      if (detail.kind === "no_gate") {
        startTransition(() => setMode("inactive"));
        return;
      }

      const href = await resolveMessengerContactGateBotHref(detail.hasTelegram, detail.hasMax);
      startTransition(() => {
        setBotHref(href);
        setMode("blocked");
      });
      pollCountRef.current = 0;
      void pollOnce();
      intervalRef.current = setInterval(() => void pollOnce(), POLL_MS);
    })();

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [pathname, clearPoll, releaseGate, router]);

  const onRetry = useCallback(() => {
    void (async () => {
      startTransition(() => setMode("loading"));
      await ensureMessengerMiniAppWebappSession(router);
      const detail = await getPatientMessengerContactGateDetail();
      if (detail.kind === "no_gate") {
        releaseGate();
        return;
      }
      if (detail.kind === "unauthenticated") {
        const href = await resolveBotHrefAfterMessengerSessionLoss();
        startTransition(() => {
          setBotHref(href);
          setMode("session_lost");
        });
        return;
      }
      const href = await resolveMessengerContactGateBotHref(detail.hasTelegram, detail.hasMax);
      startTransition(() => {
        setBotHref(href);
        setMode("blocked");
      });
      pollCountRef.current = 0;
      const pollOnce = async (): Promise<void> => {
        pollCountRef.current += 1;
        await ensureMessengerMiniAppWebappSession(router);
        const d = await getPatientMessengerContactGateDetail();
        if (d.kind === "no_gate") {
          releaseGate();
          return;
        }
        if (d.kind === "unauthenticated") {
          clearPoll();
          const h = await resolveBotHrefAfterMessengerSessionLoss();
          startTransition(() => {
            setBotHref(h);
            setMode("session_lost");
          });
          return;
        }
        if (pollCountRef.current >= MAX_POLLS) {
          clearPoll();
          startTransition(() => setMode("timed_out"));
        }
      };
      clearPoll();
      void pollOnce();
      intervalRef.current = setInterval(() => void pollOnce(), POLL_MS);
    })();
  }, [clearPoll, releaseGate, router]);

  if (mode === "inactive") {
    return <>{children}</>;
  }

  if (mode === "loading") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        Загрузка…
      </div>
    );
  }

  return (
    <PatientSharePhoneViaBotPanel
      mode={mode === "blocked" ? "blocked" : mode === "timed_out" ? "timed_out" : "session_lost"}
      botHref={botHref}
      onRetry={onRetry}
      variant="overlay"
    />
  );
}
