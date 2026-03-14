"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type BootstrapState = "idle" | "loading" | "error";

export function AuthBootstrap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? searchParams.get("token");
  const debug = searchParams.get("debug") === "1";
  const [state, setState] = useState<BootstrapState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ status?: number; message?: string } | null>(null);

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

  if (debug && !token) {
    return (
      <p className="empty-state" style={{ fontSize: 14, wordBreak: "break-all" }}>
        [debug] Нет токена в URL. Ожидается ?t=... или ?token=...
      </p>
    );
  }

  if (!token) return null;

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
      <p className="empty-state">Проверяем токен интегратора и создаем сессию...</p>
      {debug && <p className="empty-state" style={{ fontSize: 12 }}>[debug] state: {state}</p>}
    </>
  );
}
