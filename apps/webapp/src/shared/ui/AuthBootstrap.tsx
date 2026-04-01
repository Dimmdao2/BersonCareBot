"use client";

/**
 * Блок входа: обмен токена из ссылки на сессию, вход через Telegram initData или по номеру телефона (AuthFlowV2).
 * Если в адресе есть токен (t или token) — обмен на сессию. Если нет — пробует initData Telegram;
 * при отсутствии или ошибке — форма входа по номеру (check-phone, PIN, OTP).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSafeNext } from "@/modules/auth/redirectPolicy";
import { AuthFlowV2, type AuthFlowStep } from "@/shared/ui/auth/AuthFlowV2";

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
  const [initDataStatus, setInitDataStatus] = useState<"unknown" | "yes" | "no">("unknown");
  const initDataTried = useRef(false);

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

  // Определить наличие initData (для показа формы телефона, когда нет Telegram)
  useEffect(() => {
    if (token || typeof window === "undefined") return;
    const raw = window.Telegram?.WebApp?.initData?.trim() ?? "";
    queueMicrotask(() => setInitDataStatus(raw ? "yes" : "no"));
  }, [token]);

  const showPhoneFlow =
    !token && (initDataStatus === "no" || state === "error") && state !== "loading";

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

  if (showPhoneFlow) {
    return (
      <AuthFlowV2 nextParam={nextParam} supportContactHref={supportContactHref} onStepChange={onAuthStepChange} />
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
      <p className="break-all text-sm text-muted-foreground">
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
