"use client";

/**
 * Блок входа: обмен токена из ссылки на сессию, вход через initData Mini App (Telegram или MAX) или по номеру (AuthFlowV2).
 * Стратегия опроса и ожидания MAX bridge: `messengerAuthStrategy.ts`. URL-only классификация: `authEntryFlow.ts`.
 */

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  classifyAuthEntryFlowFromSearchParams,
  shouldSuppressQueryJwtForMaxCtx,
  type AuthEntryFlow,
} from "@/modules/auth/authEntryFlow";
import {
  MAX_INIT_DATA_TIMEOUT_USER_MESSAGE,
  MESSENGER_INIT_POLL_CAP_MS,
  isLikelyMaxMiniAppSurface,
  shouldDeferPhoneLoginWhileMaxBridgeMayLoad,
} from "@/modules/auth/messengerAuthStrategy";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { AuthFlowV2, type AuthFlowStep } from "@/shared/ui/auth/AuthFlowV2";
import { MaxBridgeScript } from "@/shared/ui/MaxBridgeScript";
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

const TOKEN_FALLBACK_MS = 1100;

function logAuthBootstrap(
  message: string,
  fields: { flow: AuthEntryFlow; correlationId: string; [k: string]: string | number | boolean | undefined },
): void {
  if (process.env.NODE_ENV === "test") return;
  const { flow, correlationId, ...rest } = fields;
  console.info(`[auth/bootstrap] ${message}`, { flow, correlationId, ...rest });
}

function parseJsonSafe(text: string): { redirectTo?: string; role?: "client" | "doctor" | "admin" } | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as { redirectTo?: string; role?: "client" | "doctor" | "admin" };
  } catch {
    return null;
  }
}

/** Запускает проверку токена или initData и при успехе перенаправляет в приложение (или по ?next=); иначе — AuthFlowV2. */
export function AuthBootstrap({ supportContactHref, onAuthStepChange }: AuthBootstrapProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const suppressQueryJwt = shouldSuppressQueryJwtForMaxCtx(searchParams);
  const rawToken = searchParams.get("t") ?? searchParams.get("token");
  const token = suppressQueryJwt ? null : rawToken;
  const nextParam = searchParams.get("next");
  const debug = searchParams.get("debug") === "1";
  const correlationId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `bc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }, []);

  const [state, setState] = useState<BootstrapState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ status?: number; message?: string } | null>(null);
  /** `unknown` — ждём Mini App (Telegram initData или MAX WebApp.initData), не показываем сразу OAuth. */
  const [initDataStatus, setInitDataStatus] = useState<"unknown" | "yes" | "no">("unknown");
  /** Один POST на монтирование (Strict Mode / повтор эффекта с тем же initData). */
  const telegramInitSentRef = useRef(false);
  const maxInitSentRef = useRef(false);
  const tokenExchangeSentRef = useRef(false);

  /**
   * Единый клиентский bootstrap: опрос initData (Telegram → MAX), затем отложенный обмен JWT;
   * при `ctx=max` JWT из query не используется (см. `shouldSuppressQueryJwtForMaxCtx`).
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const flowHint = classifyAuthEntryFlowFromSearchParams(searchParams);

    const POLL_MS_MAX = MESSENGER_INIT_POLL_CAP_MS;
    const TICK_MS = 100;
    const STABLE_EMPTY_TICKS = 10;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let stableWebAppEmptyTicks = 0;
    const t0 = Date.now();

    const authHeaders = (): Record<string, string> => ({
      "content-type": "application/json",
      "x-bc-auth-correlation-id": correlationId,
    });

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

      const entry = endpoint === "/api/auth/max-init" ? "max_initData" : "telegram_initData";
      if (endpoint === "/api/auth/max-init") {
        logAuthBootstrap("client max-init", {
          flow: flowHint,
          correlationId,
          initDataLength: initData.length,
          entry,
        });
      } else {
        logAuthBootstrap("client telegram-init", {
          flow: flowHint,
          correlationId,
          initDataLength: initData.length,
          entry,
        });
      }

      void fetch(endpoint, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ initData }),
      })
        .then(async (response) => {
          const text = await response.text();
          if (debug) setDebugInfo({ status: response.status, message: text.slice(0, 300) });
          if (!response.ok) {
            setState("error");
            if (response.status >= 500) {
              setError("Сервис временно недоступен. Попробуйте позже.");
            } else if (endpoint === "/api/auth/max-init" && response.status === 400) {
              setError("Некорректные данные для входа через MAX.");
            } else {
              setError("Не удалось войти");
            }
            logAuthBootstrap("messenger-init failed", {
              flow: flowHint,
              correlationId,
              entry,
              httpStatus: response.status,
            });
            return;
          }
          const payload = parseJsonSafe(text);
          if (!payload?.redirectTo) {
            setState("error");
            setError("Не удалось войти");
            return;
          }
          const role = payload.role ?? "client";
          const target = getPostAuthRedirectTarget(role, nextParam, payload.redirectTo);
          router.replace(target);
        })
        .catch((e) => {
          setState("error");
          setError("Не удалось войти");
          if (debug) setDebugInfo({ message: e instanceof Error ? e.message : String(e) });
          logAuthBootstrap("messenger-init network error", {
            flow: flowHint,
            correlationId,
            entry,
          });
        });
    };

    const runTelegramInit = (initData: string) =>
      postMessengerInit("/api/auth/telegram-init", initData, telegramInitSentRef);
    const runMaxInit = (initData: string) => postMessengerInit("/api/auth/max-init", initData, maxInitSentRef);

    const postTokenExchange = (t: string) => {
      if (tokenExchangeSentRef.current) return;
      tokenExchangeSentRef.current = true;
      stopPolling();
      queueMicrotask(() => setState("loading"));
      logAuthBootstrap("client auth/exchange (query jwt)", {
        flow: flowHint,
        correlationId,
        tokenLen: t.length,
        entry: "integrator_jwt",
      });

      void fetch("/api/auth/exchange", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ token: t }),
      })
        .then(async (response) => {
          const text = await response.text();
          if (debug) setDebugInfo({ status: response.status, message: text.slice(0, 300) });
          if (!response.ok) {
            setState("error");
            setError(response.status >= 500 ? "Сервис временно недоступен. Попробуйте позже." : "Не удалось войти");
            return;
          }
          const payload = parseJsonSafe(text);
          if (!payload?.redirectTo) {
            setState("error");
            setError("Не удалось войти");
            return;
          }
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

      const deferPhone = shouldDeferPhoneLoginWhileMaxBridgeMayLoad({
        token,
        elapsedMs: elapsed,
        telegramInitDataEmpty: true,
        maxInitDataEmpty: true,
        maxBridgeReady,
      });

      if (deferPhone) {
        setInitDataStatus("unknown");
      } else {
        const looksLikeMaxOnly = isLikelyMaxMiniAppSurface(true, maxBridgeReady);

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
      }

      if (
        token &&
        !telegramInitSentRef.current &&
        !maxInitSentRef.current &&
        !tokenExchangeSentRef.current
      ) {
        if (elapsed >= TOKEN_FALLBACK_MS && stableWebAppEmptyTicks >= STABLE_EMPTY_TICKS) {
          postTokenExchange(token);
        }
      }

      if (elapsed >= POLL_MS_MAX) {
        stopPolling();
        const maxR =
          typeof (window as Window & { WebApp?: { ready?: () => void } }).WebApp?.ready === "function";
        const stillNoInit = !getMaxWebAppInitDataForAuth().trim();
        const maxSurface = isLikelyMaxMiniAppSurface(true, maxR);
        if (
          !token &&
          maxSurface &&
          stillNoInit &&
          !telegramInitSentRef.current &&
          !maxInitSentRef.current
        ) {
          queueMicrotask(() => {
            setState("error");
            setError(MAX_INIT_DATA_TIMEOUT_USER_MESSAGE);
            logAuthBootstrap("max initData timeout", { flow: flowHint, correlationId, entry: "max_timeout" });
          });
        } else {
          queueMicrotask(() => setInitDataStatus((s) => (s === "unknown" ? "no" : s)));
        }
      }
    };

    intervalId = setInterval(tick, TICK_MS);
    tick();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [router, searchParams, token, debug, nextParam, correlationId]);

  const showPhoneFlow =
    !token && state !== "loading" && (state === "error" || initDataStatus === "no");

  /** Bridge MAX только без query JWT — см. `MaxBridgeScript`. */
  const loadMaxBridge = token == null;

  if (showPhoneFlow) {
    return (
      <>
        <MaxBridgeScript active={loadMaxBridge} />
        <AuthFlowV2 nextParam={nextParam} supportContactHref={supportContactHref} onStepChange={onAuthStepChange} />
      </>
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
      <>
        <MaxBridgeScript active={loadMaxBridge} />
        <p className="break-all text-sm text-muted-foreground">
          [debug] correlation: {correlationId}
          <br />
          Нет токена в URL. Ожидается ?t=..., Telegram initData или MAX WebApp.initData.
          <br />
          {initLabel}
          {suppressQueryJwt ? (
            <>
              <br />
              ctx=max — query JWT отключён; вход через initData или телефон.
            </>
          ) : null}
        </p>
      </>
    );
  }

  if (!token && state !== "loading" && state !== "error" && initDataStatus !== "unknown") return null;

  if (state === "error" && error) {
    return (
      <>
        <MaxBridgeScript active={loadMaxBridge} />
        <p className="text-muted-foreground">{error}</p>
        {debug && debugInfo && (
          <pre className="whitespace-pre-wrap text-left text-xs text-muted-foreground">
            [debug] correlation: {correlationId} status: {debugInfo.status ?? "—"} {debugInfo.message ?? ""}
          </pre>
        )}
      </>
    );
  }

  return (
    <>
      <MaxBridgeScript active={loadMaxBridge} />
      <p className="text-muted-foreground">
        {token ? "Проверяем токен интегратора и создаем сессию..." : "Проверяем вход..."}
      </p>
      {debug && (
        <p className="text-xs text-muted-foreground">
          [debug] state: {state} correlation: {correlationId}
        </p>
      )}
    </>
  );
}
