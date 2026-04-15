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
import {
  MAX_INIT_DATA_TIMEOUT_USER_MESSAGE,
  MESSENGER_INIT_POLL_CAP_MS,
  MESSENGER_MINIAPP_INIT_TIMEOUT_USER_MESSAGE,
  MINIAPP_ACTIVATE_BOT_AND_AUTH_MESSAGE,
  isLikelyMaxMiniAppSurface,
  shouldDeferPhoneLoginWhileMaxBridgeMayLoad,
} from "@/modules/auth/messengerAuthStrategy";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { Button } from "@/components/ui/button";
import { AuthFlowV2, type AuthFlowStep } from "@/shared/ui/auth/AuthFlowV2";
import { MaxBridgeScript } from "@/shared/ui/MaxBridgeScript";
import {
  getMaxWebAppInitDataForAuth,
  isTelegramWebAppExternalBrowserSurface,
  readPlatformCookieBot,
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
async function loadMiniappAuthHelpLinks(): Promise<{ telegramHref: string | null; maxHref: string | null }> {
  try {
    const [tgRes, altRes] = await Promise.all([
      fetch("/api/auth/telegram-login/config"),
      fetch("/api/auth/login/alternatives-config"),
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

  /**
   * Единый клиентский bootstrap: опрос initData (Telegram → MAX), затем отложенный обмен JWT;
   * при `ctx=bot` / `ctx=max` JWT из query не используется (см. `shouldSuppressQueryJwtForMessengerMiniApp`).
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

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
              void loadMiniappAuthHelpLinks().then((links) => {
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
          setState("error");
          setError("Не удалось войти");
          setMiniappHelpLinks({ telegram: null, max: null });
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
        !rawMax &&
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

        if (!webApp) {
          stableWebAppEmptyTicks = 0;
          if (!messengerEntryFromUrlOrCookie()) {
            setInitDataStatus((prev) => (prev === "unknown" ? "no" : prev));
            if (!messengerRetryNoPhoneRef.current) {
              setMessengerRetryNoPhone(false);
            }
          } else {
            setInitDataStatus("unknown");
          }
        } else if (looksLikeMaxOnly) {
          stableWebAppEmptyTicks = 0;
          setInitDataStatus("unknown");
        } else if (messengerEntryFromUrlOrCookie()) {
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
        const tgInit = window.Telegram?.WebApp?.initData?.trim() ?? "";
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
  }, [router, searchParams, token, debug, nextParam, correlationId, retryKey]);

  const handleMessengerAuthRetry = () => {
    telegramInitSentRef.current = false;
    maxInitSentRef.current = false;
    tokenExchangeSentRef.current = false;
    setState("idle");
    setError(null);
    setMiniappHelpLinks({ telegram: null, max: null });
    setInitDataStatus("unknown");
    setDebugInfo(null);
    setRetryKey((k) => k + 1);
  };

  const showPhoneFlow =
    !isMessengerMiniAppEntry &&
    !messengerRetryNoPhone &&
    !token &&
    state !== "loading" &&
    (state === "error" || initDataStatus === "no");

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
