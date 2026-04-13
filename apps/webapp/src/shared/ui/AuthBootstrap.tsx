"use client";

/**
 * Блок входа: обмен токена из ссылки на сессию, вход через initData Mini App (Telegram или MAX) или по номеру (AuthFlowV2).
 * Если в адресе есть токен (t или token) — обмен на сессию. Если нет — опрос `Telegram.WebApp.initData` и MAX WebApp bridge;
 * при отсутствии или ошибке — форма входа по номеру через AuthFlowV2 (check-phone, OTP; публичный flow без шага PIN — см. `modules/auth/auth.md`).
 */

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { AuthFlowV2, type AuthFlowStep } from "@/shared/ui/auth/AuthFlowV2";
import { getMaxWebAppInitDataForAuth } from "@/shared/lib/messengerMiniApp";

type BootstrapState = "idle" | "loading" | "error";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: { initData?: string };
    };
  }
}

type AuthBootstrapProps = {
  supportContactHref?: string;
  /** Только для потока по телефону: текущий шаг AuthFlowV2 (плашка на `/app`). */
  onAuthStepChange?: (step: AuthFlowStep) => void;
};

/** Запускает проверку токена или initData и при успехе перенаправляет в приложение (или по ?next=); иначе — AuthFlowV2. */
export function AuthBootstrap({ supportContactHref, onAuthStepChange }: AuthBootstrapProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? searchParams.get("token");
  const nextParam = searchParams.get("next");
  const debug = searchParams.get("debug") === "1";
  const [state, setState] = useState<BootstrapState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ status?: number; message?: string } | null>(null);
  /** `unknown` — ждём Mini App (Telegram initData или MAX WebApp.initData), не показываем сразу OAuth. */
  const [initDataStatus, setInitDataStatus] = useState<"unknown" | "yes" | "no">("unknown");
  /** Один POST на монтирование (Strict Mode / повтор эффекта с тем же initData). */
  const telegramInitSentRef = useRef(false);
  const maxInitSentRef = useRef(false);

  // Обмен токена из адреса на сессию и редирект
  useEffect(() => {
    if (!token) return;

    let active = true;
    queueMicrotask(() => setState("loading"));

    void fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const text = await response.text();
        if (debug && active) setDebugInfo({ status: response.status, message: text.slice(0, 300) });
        if (response.status === 403 || response.status === 401) {
          setState("error");
          setError("Не удалось войти");
          return;
        }
        if (!response.ok) throw new Error(`auth exchange failed: ${response.status}`);
        const payload = text
          ? (JSON.parse(text) as { redirectTo: string; role?: "client" | "doctor" | "admin" })
          : null;
        if (!active || !payload) return;
        const role = payload.role ?? "client";
        const target = getPostAuthRedirectTarget(role, nextParam, payload.redirectTo);
        router.replace(target);
      })
      .catch((e) => {
        if (active) {
          setState("error");
          setError("Не удалось войти");
          if (debug) setDebugInfo({ message: e instanceof Error ? e.message : String(e) });
        }
      });

    return () => {
      active = false;
    };
  }, [router, token, debug, nextParam]);

  const showPhoneFlow =
    !token && state !== "loading" && (state === "error" || initDataStatus === "no");

  /**
   * SDK — afterInteractive: пока нет `Telegram.WebApp`, сразу переводим в «веб» и монтируем AuthFlowV2
   * (OAuth / Telegram Login), но опрос не глушим — если позже появится initData (Mini App), шлём
   * telegram-init. Не останавливать опрос при первом же WebApp с пустым initData.
   */
  useEffect(() => {
    if (token || typeof window === "undefined") return;

    const POLL_MS_MAX = 15000;
    const TICK_MS = 100;
    const STABLE_EMPTY_TICKS = 10;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let stableWebAppEmptyTicks = 0;
    const t0 = Date.now();

    const stopPolling = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const postMessengerInit = (
      endpoint: "/api/auth/telegram-init" | "/api/auth/max-init",
      initData: string,
      sentRef: MutableRefObject<boolean>,
    ) => {
      if (sentRef.current) return;
      sentRef.current = true;
      stopPolling();
      queueMicrotask(() => setState("loading"));

      void fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData }),
      })
        .then(async (response) => {
          const text = await response.text();
          if (debug) setDebugInfo({ status: response.status, message: text.slice(0, 300) });
          if (response.status === 403 || response.status === 401) {
            setState("error");
            setError("Не удалось войти");
            return;
          }
          if (!response.ok) return;
          const payload = text
            ? (JSON.parse(text) as { redirectTo: string; role?: "client" | "doctor" | "admin" })
            : null;
          if (!payload?.redirectTo) return;
          const role = payload.role ?? "client";
          const target = getPostAuthRedirectTarget(role, nextParam, payload.redirectTo);
          router.replace(target);
        })
        .catch((e) => {
          setState("error");
          setError("Не удалось войти");
          if (debug) setDebugInfo({ message: e instanceof Error ? e.message : String(e) });
        });
    };

    const runTelegramInit = (initData: string) =>
      postMessengerInit("/api/auth/telegram-init", initData, telegramInitSentRef);
    const runMaxInit = (initData: string) => postMessengerInit("/api/auth/max-init", initData, maxInitSentRef);

    const tick = () => {
      if (cancelled) return;
      const elapsed = Date.now() - t0;
      const webApp = window.Telegram?.WebApp;
      const rawTg = webApp?.initData?.trim() ?? "";

      if (rawTg) {
        setInitDataStatus("yes");
        runTelegramInit(rawTg);
        return;
      }

      const rawMax = getMaxWebAppInitDataForAuth();
      if (rawMax) {
        setInitDataStatus("yes");
        runMaxInit(rawMax);
        return;
      }

      const maxBridgeReady =
        typeof (window as Window & { WebApp?: { ready?: () => void } }).WebApp?.ready === "function";
      const looksLikeMaxOnly = maxBridgeReady && !rawTg;

      if (!webApp) {
        stableWebAppEmptyTicks = 0;
        setInitDataStatus((prev) => (prev === "unknown" ? "no" : prev));
      } else if (looksLikeMaxOnly) {
        stableWebAppEmptyTicks = 0;
        setInitDataStatus("unknown");
      } else {
        setInitDataStatus("no");
        stableWebAppEmptyTicks++;
        if (stableWebAppEmptyTicks >= STABLE_EMPTY_TICKS) {
          stopPolling();
        }
      }

      if (elapsed >= POLL_MS_MAX) {
        stopPolling();
        queueMicrotask(() => setInitDataStatus((s) => (s === "unknown" ? "no" : s)));
      }
    };

    intervalId = setInterval(tick, TICK_MS);
    tick();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [router, token, debug, nextParam]);

  if (showPhoneFlow) {
    return (
      <AuthFlowV2 nextParam={nextParam} supportContactHref={supportContactHref} onStepChange={onAuthStepChange} />
    );
  }

  if (debug && !token) {
    const initLabel =
      initDataStatus === "yes"
        ? "initData: да (запрос на вход отправлен — Telegram или MAX WebApp)"
        : initDataStatus === "no"
          ? "initData: нет (не Mini App или мессенджер не передал данные)"
          : "initData: проверяем…";
    return (
      <p className="break-all text-sm text-muted-foreground">
        [debug] Нет токена в URL. Ожидается ?t=..., Telegram initData или MAX WebApp.initData.
        <br />
        {initLabel}
      </p>
    );
  }

  if (!token && state !== "loading" && state !== "error" && initDataStatus !== "unknown") return null;

  if (state === "error" && error) {
    return (
      <>
        <p className="text-muted-foreground">{error}</p>
        {debug && debugInfo && (
          <pre className="whitespace-pre-wrap text-left text-xs text-muted-foreground">
            [debug] status: {debugInfo.status ?? "—"} {debugInfo.message ?? ""}
          </pre>
        )}
      </>
    );
  }

  return (
    <>
      <p className="text-muted-foreground">
        {token ? "Проверяем токен интегратора и создаем сессию..." : "Проверяем вход..."}
      </p>
      {debug && <p className="text-xs text-muted-foreground">[debug] state: {state}</p>}
    </>
  );
}
