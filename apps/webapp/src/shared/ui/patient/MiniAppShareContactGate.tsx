"use client";

/**
 * Страховочный слой Mini App (Telegram / MAX): WebApp уже открыт, tier пациента ещё не `patient` —
 * ждём контакт в боте → привязка в БД (TX integrator + `public`). Основной контроль — в integrator (меню без номера не отдаётся).
 *
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
import { closeMessengerMiniApp, isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { postPatientMessengerRequestContact } from "@/shared/lib/patientMessengerContactClient";
import toast from "react-hot-toast";
import { usePatientPhonePromptChrome } from "@/shared/ui/patient/PatientPhonePromptChromeContext";
import { PatientSharePhoneViaBotPanel } from "./PatientSharePhoneViaBotPanel";

const POLL_MS = 2000;
const MAX_POLLS = 45;

type GateMode = "inactive" | "loading" | "blocked" | "timed_out" | "session_lost" | "me_unavailable";

export function MiniAppShareContactGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const phoneChrome = usePatientPhonePromptChrome();
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

  const onProvideContact = useCallback(async () => {
    const r = await postPatientMessengerRequestContact();
    if (!r.ok) {
      if (r.error === "not_required") {
        closeMessengerMiniApp();
        releaseGate();
        return;
      }
      const msg =
        r.error === "no_messenger_binding"
          ? "Нет привязки к мессенджеру. Откройте приложение из бота."
          : r.error === "rate_limited"
            ? "Запрос уже недавно отправляли. Подождите минуту или откройте чат с ботом."
            : "Не удалось запросить контакт. Попробуйте позже.";
      toast.error(msg);
      return;
    }
    router.refresh();
    closeMessengerMiniApp();
  }, [releaseGate, router]);

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
    if (!phoneChrome || !isMessengerMiniAppHost()) {
      return;
    }
    /** На `/bind-phone` suppress выставляет `PatientBindPhoneClient`; не трогаем — иначе при `mode === "inactive"` перезапишем true → false (родительский эффект после дочернего). */
    if (pathname?.includes("/bind-phone")) {
      return;
    }
    const suppress = mode !== "inactive";
    phoneChrome.setSuppressPatientHeader(suppress);
    return () => phoneChrome.setSuppressPatientHeader(false);
  }, [mode, phoneChrome, pathname]);

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
      if (detail.kind === "me_unavailable") {
        const href = await resolveMessengerContactGateBotHref(detail.hasTelegram, detail.hasMax);
        if (!cancelled) {
          startTransition(() => {
            setBotHref(href);
            setMode("me_unavailable");
          });
        }
        return;
      }
      if (detail.kind === "need_contact") {
        const href = await resolveMessengerContactGateBotHref(detail.hasTelegram, detail.hasMax);
        if (!cancelled) {
          startTransition(() => {
            setBotHref(href);
            setMode("blocked");
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
      if (detail.kind === "me_unavailable") {
        const href = await resolveMessengerContactGateBotHref(detail.hasTelegram, detail.hasMax);
        startTransition(() => {
          setBotHref(href);
          setMode("me_unavailable");
        });
        pollCountRef.current = 0;
        void pollOnce();
        intervalRef.current = setInterval(() => void pollOnce(), POLL_MS);
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
      if (detail.kind === "me_unavailable") {
        const href = await resolveMessengerContactGateBotHref(detail.hasTelegram, detail.hasMax);
        startTransition(() => {
          setBotHref(href);
          setMode("me_unavailable");
        });
        pollCountRef.current = 0;
        const pollOnceRetry = async (): Promise<void> => {
          pollCountRef.current += 1;
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
          if (d.kind === "me_unavailable") {
            const h = await resolveMessengerContactGateBotHref(d.hasTelegram, d.hasMax);
            startTransition(() => {
              setBotHref(h);
              setMode("me_unavailable");
            });
            return;
          }
          if (d.kind === "need_contact") {
            const h = await resolveMessengerContactGateBotHref(d.hasTelegram, d.hasMax);
            startTransition(() => {
              setBotHref(h);
              setMode("blocked");
            });
            return;
          }
          if (pollCountRef.current >= MAX_POLLS) {
            clearPoll();
            startTransition(() => setMode("timed_out"));
            return;
          }
        };
        clearPoll();
        void pollOnceRetry();
        intervalRef.current = setInterval(() => void pollOnceRetry(), POLL_MS);
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
        if (d.kind === "me_unavailable") {
          const h = await resolveMessengerContactGateBotHref(d.hasTelegram, d.hasMax);
          startTransition(() => {
            setBotHref(h);
            setMode("me_unavailable");
          });
          return;
        }
        if (d.kind === "need_contact") {
          const h = await resolveMessengerContactGateBotHref(d.hasTelegram, d.hasMax);
          startTransition(() => {
            setBotHref(h);
            setMode("blocked");
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
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        Загрузка…
      </div>
    );
  }

  return (
    <PatientSharePhoneViaBotPanel
      mode={
        mode === "blocked"
          ? "blocked"
          : mode === "timed_out"
            ? "timed_out"
            : mode === "me_unavailable"
              ? "me_unavailable"
              : "session_lost"
      }
      botHref={botHref}
      onRetry={onRetry}
      variant="overlay"
      onProvideContact={onProvideContact}
    />
  );
}
