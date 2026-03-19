"use client";

/**
 * Блок входа: обмен токена из ссылки на сессию, вход через Telegram initData или по номеру телефона (SMS).
 * Если в адресе есть токен (t или token) — обмен на сессию. Если нет — пробует initData Telegram;
 * при отсутствии или ошибке — показывает форму входа по номеру и коду из SMS.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSafeNext } from "@/modules/auth/redirectPolicy";
import { PhoneAuthForm } from "@/shared/ui/auth/PhoneAuthForm";
import { SmsCodeForm } from "@/shared/ui/auth/SmsCodeForm";

type BootstrapState = "idle" | "loading" | "error";
type PhoneStep = "phone" | "code";

const WEB_CHAT_ID_KEY = "bersoncare_web_chat_id";

function getWebChatId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(WEB_CHAT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(WEB_CHAT_ID_KEY, id);
  }
  return id;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: { initData?: string };
    };
  }
}

/** Запускает проверку токена или initData и при успехе перенаправляет в приложение (или по ?next=); иначе — форма по SMS. */
export function AuthBootstrap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? searchParams.get("token");
  const nextParam = searchParams.get("next");
  const debug = searchParams.get("debug") === "1";
  const [state, setState] = useState<BootstrapState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ status?: number; message?: string } | null>(null);
  const [initDataStatus, setInitDataStatus] = useState<"unknown" | "yes" | "no">("unknown");
  const initDataTried = useRef(false);

  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [phoneForResend, setPhoneForResend] = useState<string>("");

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
        const payload = text ? (JSON.parse(text) as { redirectTo: string }) : null;
        if (!active || !payload) return;
        const target = isSafeNext(nextParam) ? nextParam : payload.redirectTo;
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

  // Определить наличие initData (для показа формы по SMS, когда нет Telegram)
  useEffect(() => {
    if (token || typeof window === "undefined") return;
    const raw = window.Telegram?.WebApp?.initData?.trim() ?? "";
    queueMicrotask(() => setInitDataStatus(raw ? "yes" : "no"));
  }, [token]);

  const showPhoneFlow =
    !token &&
    (initDataStatus === "no" || state === "error") &&
    state !== "loading" &&
    !!nextParam;
  const redirectToGuestMenu =
    !token && (initDataStatus === "no" || state === "error") && state !== "loading" && !nextParam;

  // Без токена и без next= — увести в гостевое меню, не показывать форму телефона
  useEffect(() => {
    if (redirectToGuestMenu) router.replace("/app/patient");
  }, [router, redirectToGuestMenu]);

  // Если токена в URL нет — пробуем войти по данным Mini App Telegram (открыто из бота)
  useEffect(() => {
    if (token || initDataTried.current || typeof window === "undefined") return;

    initDataTried.current = true;
    const initData =
      (typeof window !== "undefined" && window.Telegram?.WebApp?.initData?.trim()) || "";
    if (!initData) return;

    queueMicrotask(() => setState("loading"));

    void fetch("/api/auth/telegram-init", {
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
        const payload = text ? (JSON.parse(text) as { redirectTo: string }) : null;
        if (!payload?.redirectTo) return;
        const target = isSafeNext(nextParam) ? nextParam : payload.redirectTo;
        router.replace(target);
      })
      .catch((e) => {
        setState("error");
        setError("Не удалось войти");
        if (debug) setDebugInfo({ message: e instanceof Error ? e.message : String(e) });
      });
  }, [router, token, debug, nextParam]);

  if (redirectToGuestMenu) return null;

  if (showPhoneFlow && phoneStep === "code" && challengeId) {
    return (
      <div id="auth-bootstrap-code-step" className="stack">
        <p className="eyebrow">Вход по номеру телефона</p>
        <SmsCodeForm
          challengeId={challengeId}
          retryAfterSeconds={retryAfterSeconds}
          onConfirm={async (code) => {
            const chatId = getWebChatId();
            const res = await fetch("/api/auth/phone/confirm", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                challengeId,
                code,
                channel: "web",
                chatId,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              redirectTo?: string;
              message?: string;
            };
            if (data.ok && data.redirectTo) {
              const target = isSafeNext(nextParam) ? nextParam : data.redirectTo;
              router.replace(target);
              return { ok: true as const, redirectTo: target };
            }
            return { ok: false as const, message: data.message ?? "Ошибка входа" };
          }}
          onResend={async () => {
            if (!phoneForResend) return;
            const chatId = getWebChatId();
            const res = await fetch("/api/auth/phone/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ phone: phoneForResend, channel: "web", chatId }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              challengeId?: string;
              retryAfterSeconds?: number;
              message?: string;
            };
            if (data.ok && data.challengeId) {
              setChallengeId(data.challengeId);
              setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
            }
          }}
          onBack={() => {
            setPhoneStep("phone");
            setChallengeId(null);
          }}
        />
      </div>
    );
  }

  if (showPhoneFlow) {
    return (
      <div id="auth-bootstrap-phone-step" className="stack">
        <p className="eyebrow">Вход по номеру телефона</p>
        {state === "error" && error && (
          <p className="empty-state" style={{ fontSize: 14, color: "#9c4242" }}>{error}</p>
        )}
        <PhoneAuthForm
          onSubmit={async (phone) => {
            const chatId = getWebChatId();
            const res = await fetch("/api/auth/phone/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ phone, channel: "web", chatId }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              challengeId?: string;
              retryAfterSeconds?: number;
              error?: string;
              message?: string;
            };
            if (data.ok && data.challengeId) {
              return { ok: true as const, challengeId: data.challengeId, retryAfterSeconds: data.retryAfterSeconds };
            }
            return { ok: false as const, message: data.message ?? "Не удалось отправить код" };
          }}
          onSuccess={(cid, retry, phone) => {
            if (phone) setPhoneForResend(phone);
            setChallengeId(cid);
            setRetryAfterSeconds(retry ?? 60);
            setPhoneStep("code");
          }}
        />
      </div>
    );
  }

  if (debug && !token) {
    const initLabel =
      initDataStatus === "yes"
        ? "initData: да (есть, запрос на вход отправлен)"
        : initDataStatus === "no"
          ? "initData: нет (открыто не в Mini App или Telegram не передал)"
          : "initData: проверяем…";
    return (
      <p className="empty-state" style={{ fontSize: 14, wordBreak: "break-all" }}>
        [debug] Нет токена в URL. Ожидается ?t=... или вход через Telegram (initData).
        <br />
        {initLabel}
      </p>
    );
  }

  if (!token && state !== "loading" && state !== "error") return null;

  if (state === "error" && error) {
    return (
      <>
        <p className="empty-state">{error}</p>
        {debug && debugInfo && (
          <pre className="empty-state" style={{ fontSize: 12, textAlign: "left", whiteSpace: "pre-wrap" }}>
            [debug] status: {debugInfo.status ?? "—"} {debugInfo.message ?? ""}
          </pre>
        )}
      </>
    );
  }

  return (
    <>
      <p className="empty-state">
        {token ? "Проверяем токен интегратора и создаем сессию..." : "Проверяем вход..."}
      </p>
      {debug && <p className="empty-state" style={{ fontSize: 12 }}>[debug] state: {state}</p>}
    </>
  );
}
