"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type BootstrapState = "idle" | "loading" | "error";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: { initData?: string };
    };
  }
}

export function AuthBootstrap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? searchParams.get("token");
  const debug = searchParams.get("debug") === "1";
  const [state, setState] = useState<BootstrapState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ status?: number; message?: string } | null>(null);
  const initDataTried = useRef(false);

  // 1) Token in URL: exchange with integrator token
  useEffect(() => {
    if (!token) return;

    let active = true;
    setState("loading");

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
          setError("Скоро здесь будет много полезного");
          return;
        }
        if (!response.ok) throw new Error(`auth exchange failed: ${response.status}`);
        const payload = text ? (JSON.parse(text) as { redirectTo: string }) : null;
        if (!active || !payload) return;
        router.replace(payload.redirectTo);
      })
      .catch((e) => {
        if (active) {
          setState("error");
          setError("Скоро здесь будет много полезного");
          if (debug) setDebugInfo({ message: e instanceof Error ? e.message : String(e) });
        }
      });

    return () => {
      active = false;
    };
  }, [router, token, debug]);

  // 2) No token: try Telegram Web App initData (opened from menu/button inside Telegram)
  useEffect(() => {
    if (token || initDataTried.current || typeof window === "undefined") return;

    initDataTried.current = true;
    const initData =
      (typeof window !== "undefined" && window.Telegram?.WebApp?.initData?.trim()) || "";
    if (!initData) return;

    setState("loading");

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
          setError("Скоро здесь будет много полезного");
          return;
        }
        if (!response.ok) return;
        const payload = text ? (JSON.parse(text) as { redirectTo: string }) : null;
        if (!payload?.redirectTo) return;
        router.replace(payload.redirectTo);
      })
      .catch((e) => {
        setState("error");
        setError("Скоро здесь будет много полезного");
        if (debug) setDebugInfo({ message: e instanceof Error ? e.message : String(e) });
      });
  }, [router, token, debug]);

  if (debug && !token) {
    return (
      <p className="empty-state" style={{ fontSize: 14, wordBreak: "break-all" }}>
        [debug] Нет токена в URL. Ожидается ?t=... или ?token=... или вход через Telegram (initData).
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
