"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type BootstrapState = "idle" | "loading" | "error";

export function AuthBootstrap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? searchParams.get("token");
  const [state, setState] = useState<BootstrapState>("idle");
  const [error, setError] = useState<string | null>(null);

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
        if (!response.ok) throw new Error("auth exchange failed");
        return response.json() as Promise<{ redirectTo: string }>;
      })
      .then((payload) => {
        if (!active) return;
        router.replace(payload.redirectTo);
      })
      .catch(() => {
        if (!active) return;
        setState("error");
        setError("Не удалось обменять входной токен на веб-сессию.");
      });

    return () => {
      active = false;
    };
  }, [router, token]);

  if (!token) return null;

  if (state === "error") {
    return <p className="empty-state">{error}</p>;
  }

  return <p className="empty-state">Проверяем токен интегратора и создаем сессию...</p>;
}
