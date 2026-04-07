"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    /** Callback имя фиксировано виджетом Telegram (`data-onauth="onTelegramAuth(user)"`). */
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

type TelegramLoginButtonProps = {
  botUsername: string;
  nextParam: string | null;
  disabled?: boolean;
  className?: string;
};

/**
 * Загрузка `telegram-widget.js`, кнопка «Войти через Telegram» (primary).
 * Callback: POST `/api/auth/telegram-login`, затем редирект.
 */
export function TelegramLoginButton({ botUsername, nextParam, disabled, className }: TelegramLoginButtonProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!botUsername.trim() || disabled) return;
    const container = containerRef.current;
    if (!container) return;

    const handler = async (user: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/telegram-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(user),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          redirectTo?: string;
          role?: "client" | "doctor" | "admin";
          message?: string;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.redirectTo) {
          setError(data.message ?? "Не удалось войти через Telegram");
          return;
        }
        const role = data.role ?? "client";
        const target = getPostAuthRedirectTarget(role, nextParam, data.redirectTo);
        router.replace(target);
      } finally {
        setBusy(false);
      }
    };

    window.onTelegramAuth = handler;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername.replace(/^@/, ""));
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      if (window.onTelegramAuth === handler) {
        delete window.onTelegramAuth;
      }
      script.remove();
      container.innerHTML = "";
    };
  }, [botUsername, disabled, nextParam, router]);

  if (!botUsername.trim()) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        ref={containerRef}
        className={cn(
          "[&_.tgme_widget_login_button]:!w-full [&_iframe]:!max-w-none",
          busy || disabled ? "pointer-events-none opacity-60" : "",
        )}
        aria-busy={busy || disabled}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {busy ? <p className="text-muted-foreground text-sm">Вход…</p> : null}
    </div>
  );
}
