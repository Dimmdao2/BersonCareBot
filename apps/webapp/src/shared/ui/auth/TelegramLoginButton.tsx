"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { AUTH_LOGIN_ACCENT_TEXT_CLASS, AUTH_LOGIN_PRIMARY_BUTTON_CLASS, LOGIN_CTA_HEIGHT_CLASS, LOGIN_CTA_WIDTH_CLASS } from "@/shared/ui/auth/loginChrome";
import { cn } from "@/lib/utils";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

/** Пока виджет Telegram не вставил iframe / не пришёл `load` (CDN заблокирован, нет сети и т.д.) — тот же тёмно-синий текст, слегка приглушённый. */
const TELEGRAM_WIDGET_PENDING_CHROME = cn(
  LOGIN_CTA_HEIGHT_CLASS,
  LOGIN_CTA_WIDTH_CLASS,
  "inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--patient-color-primary,#284da0)] bg-white px-4 text-sm font-normal shadow-none",
  AUTH_LOGIN_ACCENT_TEXT_CLASS,
  "opacity-70",
);

/** `load` на iframe срабатывает и при пустом/ошибочном документе — не считаем виджет готовым без ожидаемого src и геометрии. */
function verifyTelegramEmbedLooksReady(iframe: HTMLIFrameElement): boolean {
  if (!iframe.isConnected) return false;
  const src = (iframe.getAttribute("src") ?? "").trim();
  if (!src || src === "about:blank" || src.startsWith("javascript:")) return false;
  let host = "";
  try {
    host = new URL(src, "https://telegram.org/").hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host.endsWith("telegram.org") && !host.endsWith("telegram.me") && !host.endsWith("t.me")) return false;
  const { height, width } = iframe.getBoundingClientRect();
  return height >= 22 && width >= 100;
}

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
  const [iframeReady, setIframeReady] = useState(false);
  const [widgetScriptBroken, setWidgetScriptBroken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const interactive = iframeReady && !busy && !disabled && !widgetScriptBroken;
  const chromeMuted = !iframeReady || disabled || widgetScriptBroken;

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
    script.setAttribute("data-radius", "6");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    const onScriptError = () => {
      setWidgetScriptBroken(true);
      setIframeReady(false);
    };
    script.addEventListener("error", onScriptError, { once: true });
    container.appendChild(script);

    return () => {
      script.removeEventListener("error", onScriptError);
      if (window.onTelegramAuth === handler) {
        delete window.onTelegramAuth;
      }
      script.remove();
      container.innerHTML = "";
      setIframeReady(false);
      setWidgetScriptBroken(false);
    };
  }, [widgetRequested, botUsername, disabled, nextParam, router, onAuthEngaged]);

  useEffect(() => {
    if (!widgetRequested || disabled) {
      setIframeReady(false);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let poll: number | undefined;
    let pollStop: number | undefined;
    const seenIframes = new WeakSet<HTMLIFrameElement>();

    const clearPoll = () => {
      if (poll !== undefined) {
        clearInterval(poll);
        poll = undefined;
      }
      if (pollStop !== undefined) {
        clearTimeout(pollStop);
        pollStop = undefined;
      }
    };

    const tryPublishReady = (iframe: HTMLIFrameElement) => {
      if (cancelled) return false;
      if (!verifyTelegramEmbedLooksReady(iframe)) return false;
      setIframeReady(true);
      clearPoll();
      return true;
    };

    const attachToIframe = (iframe: HTMLIFrameElement) => {
      if (seenIframes.has(iframe)) return;
      seenIframes.add(iframe);
      const onLoad = () => {
        if (cancelled) return;
        const tick = () => tryPublishReady(iframe);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled) return;
            if (tick()) return;
            poll = window.setInterval(() => {
              if (tick()) return;
            }, 130);
            pollStop = window.setTimeout(() => clearPoll(), 8000);
          });
        });
      };
      iframe.addEventListener("load", onLoad, { once: true });
    };

    const tryAttach = () => {
      const iframe = container.querySelector("iframe");
      if (!iframe || cancelled) return;
      attachToIframe(iframe);
    };

    tryAttach();
    const mo = new MutationObserver(() => tryAttach());
    mo.observe(container, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      clearPoll();
      mo.disconnect();
      setIframeReady(false);
    };
  }, [widgetRequested, disabled, botUsername]);

  if (!botUsername.trim()) {
    return null;
  }

  return (
    <div className={cn("mx-auto flex w-[242px] max-w-full flex-col items-center gap-2", className)}>
      <div
        ref={outerRef}
        tabIndex={disabled || widgetScriptBroken ? -1 : 0}
        role="button"
        aria-label="Войти через Telegram"
        aria-disabled={disabled || widgetScriptBroken}
        aria-busy={busy || Boolean(widgetRequested && !iframeReady && !disabled && !widgetScriptBroken)}
        className={cn(
          "relative shrink-0 select-none caret-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          LOGIN_CTA_WIDTH_CLASS,
          LOGIN_CTA_HEIGHT_CLASS,
          "max-w-full overflow-hidden rounded-md",
          interactive ? "cursor-pointer" : "cursor-default",
        )}
        onFocus={() => setWidgetRequested(true)}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center !w-auto select-none transition-colors duration-150",
            chromeMuted ? TELEGRAM_WIDGET_PENDING_CHROME : cn(AUTH_LOGIN_PRIMARY_BUTTON_CLASS, "opacity-100"),
          )}
        >
          Войти через Telegram
        </div>
        <div
          ref={containerRef}
          className={cn(
            "relative min-h-10 w-full",
            "[&_.tgme_widget_login_button]:!block [&_.tgme_widget_login_button]:!min-h-10 [&_.tgme_widget_login_button]:!w-full",
            "[&_iframe]:!absolute [&_iframe]:!inset-0 [&_iframe]:!h-full [&_iframe]:!min-h-10 [&_iframe]:!w-full [&_iframe]:!max-w-none [&_iframe]:!opacity-0",
            interactive ? "[&_iframe]:!cursor-pointer" : "[&_iframe]:!cursor-default",
            interactive ? "" : "pointer-events-none",
            busy || disabled ? "pointer-events-none opacity-60" : "",
          )}
        />
      </div>
      {error ? <p className="text-sm text-[var(--patient-color-danger)]">{error}</p> : null}
      {busy ? <p className={patientMutedTextClass}>Вход…</p> : null}
    </div>
  );
}
