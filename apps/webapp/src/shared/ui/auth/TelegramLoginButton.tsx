"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { LOGIN_CTA_WIDTH_CLASS } from "@/shared/ui/auth/loginChrome";
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
  /** Вызывается при успешном старте входа через виджет (до редиректа). */
  onAuthEngaged?: () => void;
};

/**
 * Загрузка `telegram-widget.js` по viewport (IntersectionObserver) или фокусу — не блокирует первый paint.
 * Callback: POST `/api/auth/telegram-login`, затем редирект.
 */
export function TelegramLoginButton({
  botUsername,
  nextParam,
  disabled,
  className,
  onAuthEngaged,
}: TelegramLoginButtonProps) {
  const router = useRouter();
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetRequested, setWidgetRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!botUsername.trim() || disabled || widgetRequested) return;
    const el = outerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setWidgetRequested(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setWidgetRequested(true);
        }
      },
      { rootMargin: "120px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [botUsername, disabled, widgetRequested]);

  useEffect(() => {
    if (!widgetRequested || !botUsername.trim() || disabled) return;
    const container = containerRef.current;
    if (!container) return;

    const handler = async (user: Record<string, unknown>) => {
      onAuthEngaged?.();
      setBusy(true);
      setError(null);
      try {
        const entryT =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("t")?.trim() ?? ""
            : "";
        const body =
          entryT.length > 0 ? { ...user, webappEntryToken: entryT } : user;
        const res = await fetch("/api/auth/telegram-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
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
  }, [widgetRequested, botUsername, disabled, nextParam, router, onAuthEngaged]);

  if (!botUsername.trim()) {
    return null;
  }

  return (
    <div className={cn("mx-auto flex w-[242px] max-w-full flex-col items-center gap-2", className)}>
      <div
        ref={outerRef}
        tabIndex={0}
        className={cn(
          "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          LOGIN_CTA_WIDTH_CLASS,
          "max-w-full",
        )}
        onFocus={() => setWidgetRequested(true)}
      >
        <div
          ref={containerRef}
          className={cn(
            "max-w-full [&_.tgme_widget_login_button]:!w-full [&_iframe]:!h-10 [&_iframe]:!min-h-[40px] [&_iframe]:!w-[242px] [&_iframe]:!max-w-none",
            busy || disabled ? "pointer-events-none opacity-60" : "",
          )}
          aria-busy={busy || disabled}
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {busy ? <p className="text-muted-foreground text-sm">Вход…</p> : null}
    </div>
  );
}
