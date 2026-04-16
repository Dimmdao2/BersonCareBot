"use client";

/**
 * Блок входа: обмен токена из ссылки на сессию, вход через initData Mini App (Telegram или MAX) или по номеру (AuthFlowV2).
 * Стратегия опроса и ожидания MAX bridge: `messengerAuthStrategy.ts`. URL-only классификация: `authEntryFlow.ts`.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BOT_ENTRY_CTX_QUERY,
  MAX_ENTRY_CTX_QUERY,
  classifyAuthEntryFlowFromSearchParams,
  readMessengerCtxParam,
  shouldSuppressQueryJwtForMessengerMiniApp,
  type AuthEntryFlow,
} from "@/modules/auth/authEntryFlow";
import { emitAuthFlowEvent } from "@/modules/auth/authFlowObservability";
import {
  BROWSER_SOFT_TIMEOUT_MS,
  MAX_INIT_DATA_TIMEOUT_USER_MESSAGE,
  MESSENGER_INIT_POLL_CAP_MS,
  MESSENGER_MINIAPP_INIT_TIMEOUT_USER_MESSAGE,
  MESSENGER_SOFT_TIMEOUT_MS,
  MINIAPP_ACTIVATE_BOT_AND_AUTH_MESSAGE,
  isAuthBootstrapEarlyUiV2Enabled,
  isLikelyMaxMiniAppSurface,
  isSuspectedMessengerContext,
  shouldDeferPhoneLoginWhileMaxBridgeMayLoad,
  shouldExposeInteractiveLogin,
} from "@/modules/auth/messengerAuthStrategy";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { Button } from "@/components/ui/button";
import { AuthFlowV2, type AuthFlowStep, type PrefetchedPublicAuthConfig } from "@/shared/ui/auth/AuthFlowV2";
import { MaxBridgeScript } from "@/shared/ui/MaxBridgeScript";
import { persistMessengerBindingCandidate } from "@/shared/lib/messengerBindingCandidate";
import {
  getMaxWebAppInitDataForAuth,
  isTelegramWebAppExternalBrowserSurface,
  readPlatformCookieBot,
  readTelegramInitDataForAuth,
} from "@/shared/lib/messengerMiniApp";
import { PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

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

function parseMessengerInitErrorBody(text: string): { error?: string } | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as { error?: string };
  } catch {
    return null;
  }
}

/** Подсказки «открыть бота» при access_denied в miniapp (публичные конфиги). */
async function loadMiniappAuthHelpLinks(
  signal?: AbortSignal,
  correlationId?: string | null,
): Promise<{ telegramHref: string | null; maxHref: string | null }> {
  const id = correlationId?.trim();
  const headers = id ? { "x-bc-auth-correlation-id": id } : undefined;
  const reqInit = signal || headers ? { ...(signal ? { signal } : {}), ...(headers ? { headers } : {}) } : undefined;
  try {
    const [tgRes, altRes] = await Promise.all([
      fetch("/api/auth/telegram-login/config", reqInit),
      fetch("/api/auth/login/alternatives-config", reqInit),
    ]);
    const tgJson = (await tgRes.json().catch(() => ({}))) as { ok?: boolean; botUsername?: string | null };
    const altJson = (await altRes.json().catch(() => ({}))) as {
      ok?: boolean;
      maxBotOpenUrl?: unknown;
    };
    const tgU =
      tgJson?.ok === true && typeof tgJson.botUsername === "string"
        ? tgJson.botUsername.trim().replace(/^@/, "")
        : "";
    const telegramHref = tgU.length > 0 ? `https://t.me/${tgU}` : null;
    const maxU =
      altJson?.ok === true && typeof altJson.maxBotOpenUrl === "string" && altJson.maxBotOpenUrl.trim().length > 0
        ? altJson.maxBotOpenUrl.trim()
        : null;
    return { telegramHref, maxHref: maxU };
  } catch {
    return { telegramHref: null, maxHref: null };
  }
}

function clearStaleBotPlatformCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PLATFORM_COOKIE_NAME}=; path=/; max-age=0`;
}

function classifyUaClassForAuthObservability(): "mobile" | "desktop" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/Mobi|Android/i.test(ua)) return "mobile";
  return ua.length > 0 ? "desktop" : "unknown";
}

/** Запускает проверку токена или initData и при успехе перенаправляет в приложение (или по ?next=); иначе — AuthFlowV2. */
export function AuthBootstrap({ supportContactHref, onAuthStepChange }: AuthBootstrapProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const suppressQueryJwt = shouldSuppressQueryJwtForMessengerMiniApp(searchParams);
  const rawToken = searchParams.get("t") ?? searchParams.get("token");
  const token = suppressQueryJwt ? null : rawToken;
  const nextParam = searchParams.get("next");
  const debug = searchParams.get("debug") === "1";
  const ctxParam = readMessengerCtxParam(searchParams);
  const [messengerEntryFromClient, setMessengerEntryFromClient] = useState(false);
  /** После сброса устаревшего bot-cookie: показываем miniapp-стиль error+retry без телефонного `AuthFlowV2`. */
  const [messengerRetryNoPhone, setMessengerRetryNoPhone] = useState(false);
  const messengerRetryNoPhoneRef = useRef(messengerRetryNoPhone);
  messengerRetryNoPhoneRef.current = messengerRetryNoPhone;
  const [retryKey, setRetryKey] = useState(0);
  const isMessengerMiniAppEntry =
    messengerEntryFromClient ||
    ctxParam === BOT_ENTRY_CTX_QUERY ||
    ctxParam === MAX_ENTRY_CTX_QUERY;

  const earlyUi = isAuthBootstrapEarlyUiV2Enabled();
  const [browserSoftOk, setBrowserSoftOk] = useState(false);
  const [messengerSoftOk, setMessengerSoftOk] = useState(false);
  const [prefetchedAuth, setPrefetchedAuth] = useState<PrefetchedPublicAuthConfig | null>(null);

  const authEpochRef = useRef(0);
  const primaryAbortRef = useRef<AbortController | null>(null);
  const interactiveEngagedRef = useRef(false);
  const contextDetectedEmittedRef = useRef(false);
  const initDataDetectedEmittedRef = useRef(false);
  /** Одна запись late initData (persist + `late_initData_received`) на стабильную строку за эпоху bootstrap — без спама каждые 100ms. */
  const lateBindingDedupeKeyRef = useRef<string | null>(null);
  const prevShowPhoneFlowRef = useRef(false);
  const mountStartedAtRef = useRef(typeof performance !== "undefined" ? performance.now() : Date.now());

  useLayoutEffect(() => {
    const fromNext = readMessengerCtxParam(searchParams);
    if (fromNext === BOT_ENTRY_CTX_QUERY || fromNext === MAX_ENTRY_CTX_QUERY) {
      setMessengerEntryFromClient(true);
      setMessengerRetryNoPhone(false);
      return;
    }
    if (typeof document === "undefined") return;
    setMessengerEntryFromClient(readPlatformCookieBot());
  }, [searchParams]);

  const correlationId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `bc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }, []);

  const [state, setState] = useState<BootstrapState>("idle");
  const [error, setError] = useState<string | null>(null);
  /** Ссылки на ботов при `access_denied` miniapp init (публичные конфиги). */
  const [miniappHelpLinks, setMiniappHelpLinks] = useState<{ telegram: string | null; max: string | null }>({
    telegram: null,
    max: null,
  });
  const [debugInfo, setDebugInfo] = useState<{ status?: number; message?: string } | null>(null);
  /** `unknown` — ждём Mini App (Telegram initData или MAX WebApp.initData), не показываем сразу OAuth. */
  const [initDataStatus, setInitDataStatus] = useState<"unknown" | "yes" | "no">("unknown");
  /** Один POST на монтирование (Strict Mode / повтор эффекта с тем же initData). */
  const telegramInitSentRef = useRef(false);
  const maxInitSentRef = useRef(false);
  const tokenExchangeSentRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    emitAuthFlowEvent("auth_bootstrap_started", {
      correlationId,
      path: window.location.pathname,
      queryCtx: ctxParam ?? null,
      hasToken: Boolean(token),
      platformCookie: readPlatformCookieBot() ? "bot" : "none",
      earlyUi,
      uaClass: classifyUaClassForAuthObservability(),
    });
  }, [correlationId, ctxParam, token, earlyUi]);

  useEffect(() => {
    if (!earlyUi) return;
    if (!isMessengerMiniAppEntry) {
      const t = window.setTimeout(() => setBrowserSoftOk(true), BROWSER_SOFT_TIMEOUT_MS);
      return () => window.clearTimeout(t);
    }
    return;
  }, [earlyUi, isMessengerMiniAppEntry]);

  useEffect(() => {
    if (!earlyUi || !isMessengerMiniAppEntry) return;
    const t = window.setTimeout(() => setMessengerSoftOk(true), MESSENGER_SOFT_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [earlyUi, isMessengerMiniAppEntry, retryKey]);

  const exposeInteractive = shouldExposeInteractiveLogin({
    earlyUiEnabled: earlyUi,
    isMessengerMiniAppEntry,
    messengerSoftOk,
    browserSoftOk,
    initDataStatus,
    state,
  });

  const showPhoneFlow =
    !messengerRetryNoPhone &&
    !token &&
    state !== "loading" &&
    exposeInteractive;

  useEffect(() => {
    if (!showPhoneFlow) {
      prevShowPhoneFlowRef.current = false;
      return;
    }
    if (prevShowPhoneFlowRef.current) return;
    prevShowPhoneFlowRef.current = true;
    const elapsedMs =
      typeof performance !== "undefined" ? performance.now() - mountStartedAtRef.current : undefined;
    let reason: string = "manual";
    if (state === "error") reason = "error";
    else if (initDataStatus === "no") reason = "initData_no";
    else if (earlyUi && isMessengerMiniAppEntry && messengerSoftOk) reason = "messenger_soft_timeout";
    else if (earlyUi && !isMessengerMiniAppEntry && browserSoftOk) reason = "browser_soft_timeout";
    emitAuthFlowEvent("fallback_to_interactive", {
      correlationId,
      reason,
      elapsedMs: elapsedMs != null ? Math.round(elapsedMs) : undefined,
    });
  }, [showPhoneFlow, state, initDataStatus, earlyUi, isMessengerMiniAppEntry, messengerSoftOk, browserSoftOk, correlationId]);

  const handleInteractiveEngaged = () => {
    if (interactiveEngagedRef.current) return;
    interactiveEngagedRef.current = true;
    emitAuthFlowEvent("auth_attempt_started", {
      correlationId,
      attemptType: "interactive",
      epoch: authEpochRef.current,
    });
  };

  /**
   * Единый клиентский bootstrap: опрос initData (Telegram → MAX), затем отложенный обмен JWT;
   * при `ctx=bot` / `ctx=max` JWT из query не используется (см. `shouldSuppressQueryJwtForMessengerMiniApp`).
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    authEpochRef.current += 1;
    const epoch = authEpochRef.current;
    interactiveEngagedRef.current = false;
    contextDetectedEmittedRef.current = false;
    initDataDetectedEmittedRef.current = false;
    lateBindingDedupeKeyRef.current = null;
    mountStartedAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    telegramInitSentRef.current = false;
    maxInitSentRef.current = false;
    tokenExchangeSentRef.current = false;

    const flowHint = classifyAuthEntryFlowFromSearchParams(searchParams);

    const messengerEntryFromUrlOrCookie = (): boolean => {
      const fromNext = readMessengerCtxParam(searchParams);
      if (fromNext === BOT_ENTRY_CTX_QUERY || fromNext === MAX_ENTRY_CTX_QUERY) return true;
      return readPlatformCookieBot();
    };

    const POLL_MS_MAX = MESSENGER_INIT_POLL_CAP_MS;
    const TICK_MS = 100;
    const STABLE_EMPTY_TICKS = 10;

    let cancelled = false;
    const prefetchAc = new AbortController();
    const prefetchHeaders: Record<string, string> = { "x-bc-auth-correlation-id": correlationId };
    /** Следующий macrotask: не смешивать сразу с первым `tick()` (fake timers в тестах, Strict Mode). */
    const prefetchKick = window.setTimeout(() => {
      if (cancelled || epoch !== authEpochRef.current) return;
      void Promise.all([
        fetch("/api/auth/oauth/providers", { signal: prefetchAc.signal, headers: prefetchHeaders })
          .then((r) => r.json().catch(() => ({})))
          .catch(() => ({})),
        fetch("/api/auth/telegram-login/config", { signal: prefetchAc.signal, headers: prefetchHeaders })
          .then((r) => r.json().catch(() => ({})))
          .catch(() => ({})),
        fetch("/api/auth/login/alternatives-config", { signal: prefetchAc.signal, headers: prefetchHeaders })
          .then((r) => r.json().catch(() => ({})))
          .catch(() => ({})),
      ]).then(([oauthData, tgData, altData]) => {
        if (cancelled || epoch !== authEpochRef.current) return;
        const oauth = oauthData as { ok?: boolean; yandex?: boolean; google?: boolean; apple?: boolean };
        const oauthProviders = {
          yandex: oauth?.ok === true && Boolean(oauth.yandex),
          google: oauth?.ok === true && Boolean(oauth.google),
          apple: oauth?.ok === true && Boolean(oauth.apple),
        };
        const tgJson = tgData as { ok?: boolean; botUsername?: string | null };
        const u =
          tgJson?.ok === true && typeof tgJson.botUsername === "string" ? String(tgJson.botUsername).trim() : "";
        const telegramBotUsername = u.length > 0 ? u : null;
        const alt = altData as { ok?: boolean; maxBotOpenUrl?: unknown };
        const maxBotOpenUrl =
          alt?.ok === true && typeof alt.maxBotOpenUrl === "string" && alt.maxBotOpenUrl.trim().length > 0
            ? alt.maxBotOpenUrl.trim()
            : null;
        setPrefetchedAuth({
          oauthProviders,
          telegramBotUsername,
          maxBotOpenUrl,
          fetchedAt: Date.now(),
        });
      });
    }, 0);

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

    const applyStaleBotCookieResolvedToWeb = () => {
      stopPolling();
      clearStaleBotPlatformCookie();
      setMessengerEntryFromClient(false);
      setMessengerRetryNoPhone(false);
      setMiniappHelpLinks({ telegram: null, max: null });
      setState("idle");
      setError(null);
      setInitDataStatus("no");
      logAuthBootstrap("stale platform bot cookie cleared → web auth", {
        flow: flowHint,
        correlationId,
        entry: "stale_bot_cookie_web_auth",
      });
      queueMicrotask(() => router.refresh());
    };

    const postMessengerInit = (
      endpoint: "/api/auth/telegram-init" | "/api/auth/max-init",
      initData: string,
      sentRef: MutableRefObject<boolean>,
    ) => {
      if (sentRef.current) return;
      sentRef.current = true;
      stopPolling();
      primaryAbortRef.current?.abort();
      const ac = new AbortController();
      primaryAbortRef.current = ac;
      const epochAtSend = authEpochRef.current;
      queueMicrotask(() => {
        if (!cancelled) setState("loading");
      });

      const entry = endpoint === "/api/auth/max-init" ? "max_initData" : "telegram_initData";
      const attemptType = endpoint === "/api/auth/max-init" ? "max_init" : "telegram_init";
      emitAuthFlowEvent("auth_attempt_started", {
        correlationId,
        attemptType,
        epoch: epochAtSend,
        elapsedMs: Date.now() - t0,
      });

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

      const startedAt = Date.now();
      void fetch(endpoint, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ initData }),
        signal: ac.signal,
      })
        .then(async (response) => {
          if (cancelled || epochAtSend !== authEpochRef.current) {
            sentRef.current = false;
            return;
          }
          const text = await response.text();
          if (cancelled || epochAtSend !== authEpochRef.current) {
            sentRef.current = false;
            return;
          }
          if (debug) setDebugInfo({ status: response.status, message: text.slice(0, 300) });
          emitAuthFlowEvent("auth_attempt_finished", {
            correlationId,
            attemptType,
            epoch: epochAtSend,
            ok: response.ok,
            httpStatus: response.status,
            elapsedMs: Date.now() - startedAt,
          });
          if (!response.ok) {
            setState("error");
            const errBody = parseMessengerInitErrorBody(text);
            const accessDenied = response.status === 403 && errBody?.error === "access_denied";
            if (response.status >= 500) {
              setError("Сервис временно недоступен. Попробуйте позже.");
              setMiniappHelpLinks({ telegram: null, max: null });
            } else if (endpoint === "/api/auth/max-init" && response.status === 400) {
              setError("Некорректные данные для входа через MAX.");
              setMiniappHelpLinks({ telegram: null, max: null });
            } else if (accessDenied) {
              setError(MINIAPP_ACTIVATE_BOT_AND_AUTH_MESSAGE);
              void loadMiniappAuthHelpLinks(ac.signal, correlationId).then((links) => {
                if (epochAtSend !== authEpochRef.current) return;
                setMiniappHelpLinks({ telegram: links.telegramHref, max: links.maxHref });
              });
            } else {
              setError("Не удалось войти");
              setMiniappHelpLinks({ telegram: null, max: null });
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
          if (cancelled || epochAtSend !== authEpochRef.current) {
            sentRef.current = false;
            return;
          }
          if (e instanceof DOMException && e.name === "AbortError") {
            sentRef.current = false;
            return;
          }
          setState("error");
          setError("Не удалось войти");
          setMiniappHelpLinks({ telegram: null, max: null });
          if (debug) setDebugInfo({ message: e instanceof Error ? e.message : String(e) });
          emitAuthFlowEvent("auth_attempt_finished", {
            correlationId,
            attemptType,
            epoch: epochAtSend,
            ok: false,
            httpStatus: undefined,
            errorCode: "network",
            elapsedMs: Date.now() - startedAt,
          });
          logAuthBootstrap("messenger-init network error", {
            flow: flowHint,
            correlationId,
            entry,
          });
        });
    };

    const runTelegramInit = (initData: string) => {
      if (interactiveEngagedRef.current) {
        const dedupeKey = `telegram:${initData}`;
        if (lateBindingDedupeKeyRef.current === dedupeKey) return;
        lateBindingDedupeKeyRef.current = dedupeKey;
        persistMessengerBindingCandidate({ channel: "telegram", initData, correlationId });
        emitAuthFlowEvent("late_initData_received", {
          correlationId,
          channel: "telegram",
          epoch: authEpochRef.current,
          interactiveActive: true,
          actionTaken: "store_binding_candidate_skip_auto_auth",
          initDataLength: initData.length,
          isLate: true,
        });
        return;
      }
      postMessengerInit("/api/auth/telegram-init", initData, telegramInitSentRef);
    };

    const runMaxInit = (initData: string) => {
      if (interactiveEngagedRef.current) {
        const dedupeKey = `max:${initData}`;
        if (lateBindingDedupeKeyRef.current === dedupeKey) return;
        lateBindingDedupeKeyRef.current = dedupeKey;
        persistMessengerBindingCandidate({ channel: "max", initData, correlationId });
        emitAuthFlowEvent("late_initData_received", {
          correlationId,
          channel: "max",
          epoch: authEpochRef.current,
          interactiveActive: true,
          actionTaken: "store_binding_candidate_skip_auto_auth",
          initDataLength: initData.length,
          isLate: true,
        });
        return;
      }
      postMessengerInit("/api/auth/max-init", initData, maxInitSentRef);
    };

    const postTokenExchange = (t: string) => {
      if (tokenExchangeSentRef.current) return;
      tokenExchangeSentRef.current = true;
      stopPolling();
      primaryAbortRef.current?.abort();
      const ac = new AbortController();
      primaryAbortRef.current = ac;
      const epochAtSend = authEpochRef.current;
      queueMicrotask(() => {
        if (!cancelled) setState("loading");
      });
      logAuthBootstrap("client auth/exchange (query jwt)", {
        flow: flowHint,
        correlationId,
        tokenLen: t.length,
        entry: "integrator_jwt",
      });
      emitAuthFlowEvent("auth_attempt_started", {
        correlationId,
        attemptType: "exchange",
        epoch: epochAtSend,
        elapsedMs: Date.now() - t0,
      });

      const startedAt = Date.now();
      void fetch("/api/auth/exchange", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ token: t }),
        signal: ac.signal,
      })
        .then(async (response) => {
          if (cancelled || epochAtSend !== authEpochRef.current) {
            tokenExchangeSentRef.current = false;
            return;
          }
          const text = await response.text();
          if (cancelled || epochAtSend !== authEpochRef.current) {
            tokenExchangeSentRef.current = false;
            return;
          }
          if (debug) setDebugInfo({ status: response.status, message: text.slice(0, 300) });
          emitAuthFlowEvent("auth_attempt_finished", {
            correlationId,
            attemptType: "exchange",
            epoch: epochAtSend,
            ok: response.ok,
            httpStatus: response.status,
            elapsedMs: Date.now() - startedAt,
          });
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
          if (cancelled || epochAtSend !== authEpochRef.current) {
            tokenExchangeSentRef.current = false;
            return;
          }
          if (e instanceof DOMException && e.name === "AbortError") {
            tokenExchangeSentRef.current = false;
            return;
          }
          setState("error");
          setError("Не удалось войти");
          if (debug) setDebugInfo({ message: e instanceof Error ? e.message : String(e) });
          emitAuthFlowEvent("auth_attempt_finished", {
            correlationId,
            attemptType: "exchange",
            epoch: epochAtSend,
            ok: false,
            httpStatus: undefined,
            errorCode: "network",
            elapsedMs: Date.now() - startedAt,
          });
        });
    };

    const tick = () => {
      if (cancelled) return;
      const elapsed = Date.now() - t0;
      const webApp = window.Telegram?.WebApp;
      const rawTg = readTelegramInitDataForAuth();
      const rawMax = getMaxWebAppInitDataForAuth();

      const maxBridgeReady =
        typeof (window as Window & { WebApp?: { ready?: () => void } }).WebApp?.ready === "function";

      if (!contextDetectedEmittedRef.current) {
        contextDetectedEmittedRef.current = true;
        const suspected = isSuspectedMessengerContext({
          messengerFromUrlOrCookie: messengerEntryFromUrlOrCookie(),
          maxBridgeReady,
          telegramWebAppPresent: typeof window.Telegram?.WebApp !== "undefined",
        });
        const ctxFromUrl = readMessengerCtxParam(searchParams);
        let source: "ctx" | "cookie" | "bridge" | "tg_init" | "max_init" = "bridge";
        if (rawTg) source = "tg_init";
        else if (rawMax) source = "max_init";
        else if (ctxFromUrl === BOT_ENTRY_CTX_QUERY || ctxFromUrl === MAX_ENTRY_CTX_QUERY) source = "ctx";
        else if (readPlatformCookieBot()) source = "cookie";
        emitAuthFlowEvent("context_detected", {
          correlationId,
          suspected,
          confirmed: Boolean(rawTg || rawMax),
          source,
          elapsedMs: elapsed,
        });
      }

      if (rawTg) {
        if (!initDataDetectedEmittedRef.current) {
          initDataDetectedEmittedRef.current = true;
          emitAuthFlowEvent("initData_detected", {
            correlationId,
            channel: "telegram",
            initDataLength: rawTg.length,
            elapsedMs: elapsed,
            isLate: interactiveEngagedRef.current,
          });
        }
        setInitDataStatus("yes");
        runTelegramInit(rawTg);
        return;
      }

      if (rawMax) {
        if (!initDataDetectedEmittedRef.current) {
          initDataDetectedEmittedRef.current = true;
          emitAuthFlowEvent("initData_detected", {
            correlationId,
            channel: "max",
            initDataLength: rawMax.length,
            elapsedMs: elapsed,
            isLate: interactiveEngagedRef.current,
          });
        }
        setInitDataStatus("yes");
        runMaxInit(rawMax);
        return;
      }

      const ctxEarly = readMessengerCtxParam(searchParams);
      const cookieOnlyMessenger =
        readPlatformCookieBot() &&
        ctxEarly !== BOT_ENTRY_CTX_QUERY &&
        ctxEarly !== MAX_ENTRY_CTX_QUERY;
      const maxSurfaceEarly = isLikelyMaxMiniAppSurface(true, maxBridgeReady);
      /** Как при `POLL_MS_MAX`: внешний браузер с TG-скриптом (`platform=web`) или полное отсутствие `Telegram.WebApp` — не ждать poll до конца. */
      const staleBotStandaloneBrowser =
        isTelegramWebAppExternalBrowserSurface() || typeof window.Telegram?.WebApp === "undefined";
      const staleBotCookieToWebAuth =
        cookieOnlyMessenger &&
        messengerEntryFromUrlOrCookie() &&
        !maxSurfaceEarly &&
        !maxBridgeReady &&
        !rawTg &&
        !rawMax.trim() &&
        staleBotStandaloneBrowser;

      if (staleBotCookieToWebAuth) {
        applyStaleBotCookieResolvedToWeb();
        return;
      }

      const deferPhone = shouldDeferPhoneLoginWhileMaxBridgeMayLoad({
        token,
        elapsedMs: elapsed,
        telegramInitDataEmpty: true,
        maxInitDataEmpty: true,
        maxBridgeReady,
        messengerMiniAppContext: messengerEntryFromUrlOrCookie(),
      });

      if (deferPhone) {
        setInitDataStatus("unknown");
      } else {
        const looksLikeMaxOnly = isLikelyMaxMiniAppSurface(true, maxBridgeReady);
        const messengerEntry = messengerEntryFromUrlOrCookie();

        if (!webApp) {
          stableWebAppEmptyTicks = 0;
          if (!messengerEntry) {
            setInitDataStatus((prev) => (prev === "unknown" ? "no" : prev));
            if (!messengerRetryNoPhoneRef.current) {
              setMessengerRetryNoPhone(false);
            }
          } else {
            setInitDataStatus("unknown");
          }
        } else if (looksLikeMaxOnly && messengerEntry) {
          stableWebAppEmptyTicks = 0;
          setInitDataStatus("unknown");
        } else if (messengerEntry) {
          // `ctx=bot` / `ctx=max` или cookie `bot`: не переводим в `no` раньше POLL_CAP
          // (иначе опрос останавливается ~1s и таймаут/stale-cookie не срабатывают).
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
        const tgInit = readTelegramInitDataForAuth();
        const stillNoInit = !tgInit && !getMaxWebAppInitDataForAuth().trim();
        const maxSurface = isLikelyMaxMiniAppSurface(true, maxR);
        const messengerEntry = messengerEntryFromUrlOrCookie();
        if (
          !token &&
          stillNoInit &&
          !telegramInitSentRef.current &&
          !maxInitSentRef.current
        ) {
          queueMicrotask(() => {
            if (epoch !== authEpochRef.current) return;
            const ctxFromUrl = readMessengerCtxParam(searchParams);
            const cookieOnlyMessengerEntry =
              readPlatformCookieBot() &&
              ctxFromUrl !== BOT_ENTRY_CTX_QUERY &&
              ctxFromUrl !== MAX_ENTRY_CTX_QUERY;
            const staleBotCookieInExternalBrowser =
              messengerEntry &&
              cookieOnlyMessengerEntry &&
              !maxSurface &&
              !maxR &&
              (isTelegramWebAppExternalBrowserSurface() || typeof window.Telegram?.WebApp === "undefined");

            if (staleBotCookieInExternalBrowser) {
              applyStaleBotCookieResolvedToWeb();
              return;
            }

            if (messengerEntry) {
              setState("error");
              setError(maxSurface ? MAX_INIT_DATA_TIMEOUT_USER_MESSAGE : MESSENGER_MINIAPP_INIT_TIMEOUT_USER_MESSAGE);
              logAuthBootstrap("messenger initData timeout", {
                flow: flowHint,
                correlationId,
                entry: maxSurface ? "max_timeout" : "messenger_timeout",
              });
            } else {
              setInitDataStatus((s) => (s === "unknown" ? "no" : s));
              setMessengerRetryNoPhone(false);
            }
          });
        } else {
          queueMicrotask(() => {
            if (epoch !== authEpochRef.current) return;
            setInitDataStatus((s) => (s === "unknown" ? "no" : s));
          });
        }
      }
    };

    intervalId = setInterval(tick, TICK_MS);
    tick();

    return () => {
      cancelled = true;
      window.clearTimeout(prefetchKick);
      prefetchAc.abort();
      stopPolling();
      primaryAbortRef.current?.abort();
    };
  }, [router, searchParams, token, debug, nextParam, correlationId, retryKey]);

  const handleMessengerAuthRetry = () => {
    primaryAbortRef.current?.abort();
    telegramInitSentRef.current = false;
    maxInitSentRef.current = false;
    tokenExchangeSentRef.current = false;
    setState("idle");
    setError(null);
    setMiniappHelpLinks({ telegram: null, max: null });
    setInitDataStatus("unknown");
    setDebugInfo(null);
    setBrowserSoftOk(false);
    setMessengerSoftOk(false);
    setRetryKey((k) => k + 1);
  };

  /** Bridge MAX только без query JWT — см. `MaxBridgeScript`. */
  const loadMaxBridge = token == null;

  if (showPhoneFlow) {
    return (
      <>
        <MaxBridgeScript active={loadMaxBridge} />
        <AuthFlowV2
          nextParam={nextParam}
          supportContactHref={supportContactHref}
          onStepChange={onAuthStepChange}
          prefetchedAuthConfig={prefetchedAuth}
          onInteractiveLoginEngaged={handleInteractiveEngaged}
          observabilityCorrelationId={correlationId}
        />
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
              ctx=bot / ctx=max — query JWT отключён; вход только через initData (мини-приложение).
            </>
          ) : null}
        </p>
      </>
    );
  }

  if (
    !isMessengerMiniAppEntry &&
    !token &&
    state !== "loading" &&
    state !== "error" &&
    initDataStatus !== "unknown" &&
    !messengerRetryNoPhone
  )
    return null;

  if (state === "error" && error) {
    const showHelpLinks = Boolean(miniappHelpLinks.telegram || miniappHelpLinks.max);
    return (
      <>
        <MaxBridgeScript active={loadMaxBridge} />
        <p className="text-muted-foreground">{error}</p>
        {showHelpLinks ? (
          <div className="mt-3 flex flex-col items-center gap-2 text-sm">
            {miniappHelpLinks.telegram ? (
              <a
                className="text-primary underline"
                href={miniappHelpLinks.telegram}
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть бота в Telegram
              </a>
            ) : null}
            {miniappHelpLinks.max ? (
              <a
                className="text-primary underline"
                href={miniappHelpLinks.max}
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть бота в Max
              </a>
            ) : null}
          </div>
        ) : null}
        {isMessengerMiniAppEntry || messengerRetryNoPhone || error === MINIAPP_ACTIVATE_BOT_AND_AUTH_MESSAGE ? (
          <div className="mt-4">
            <Button type="button" variant="secondary" onClick={handleMessengerAuthRetry}>
              Повторить
            </Button>
          </div>
        ) : null}
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
