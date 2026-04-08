"use client";

/**
 * Telegram Mini App: если сессия по initData есть, но в webapp ещё нет телефона (ждём контакт в боте → contact.linked),
 * показываем полноэкранную подсказку и опрос /api/me, пока номер не появится или не истечёт таймаут.
 * Страница привязки телефона вручную (/bind-phone) не блокируется.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isTelegramMiniAppWithInitData } from "@/shared/lib/telegramMiniApp";

const POLL_MS = 2000;
const MAX_POLLS = 45;

type GateMode = "inactive" | "loading" | "blocked" | "timed_out";

async function meNeedsContactGate(): Promise<boolean> {
  const res = await fetch("/api/me", { credentials: "include" });
  if (!res.ok) return false;
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    user?: { phone?: string | null; bindings?: { telegramId?: string | null } };
  };
  if (!data.ok || !data.user) return false;
  const phone = data.user.phone?.trim();
  if (phone) return false;
  const hasTg = Boolean((data.user.bindings?.telegramId ?? "").trim());
  return hasTg;
}

export function MiniAppShareContactGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<GateMode>("inactive");
  const [botHref, setBotHref] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const prevPathnameRef = useRef<string | null>(null);

  const clearPoll = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const releaseGate = useCallback(() => {
    clearPoll();
    startTransition(() => setMode("inactive"));
    router.refresh();
  }, [clearPoll, router]);

  /**
   * До paint на первом монтировании: в Telegram Mini App сразу «loading», без мелькания контента.
   * Зависимость только [] — иначе при смене /app/patient/* экран бы снова уходил в «Загрузка…».
   */
  useLayoutEffect(() => {
    if (!isTelegramMiniAppWithInitData()) {
      startTransition(() => setMode("inactive"));
      return;
    }
    if (window.location.pathname.includes("/bind-phone")) {
      startTransition(() => setMode("inactive"));
      return;
    }
    startTransition(() => setMode("loading"));
  }, []);

  /** Переход на/с страницы привязки телефона вручную. */
  useEffect(() => {
    if (pathname?.includes("/bind-phone")) {
      startTransition(() => setMode("inactive"));
    }
  }, [pathname]);

  /** Уход с bind-phone обратно в раздел пациента: кратко «loading», чтобы не мелькал контент до проверки гейта. */
  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname ?? null;
    if (prev?.includes("/bind-phone") && !pathname?.includes("/bind-phone") && isTelegramMiniAppWithInitData()) {
      startTransition(() => setMode("loading"));
    }
  }, [pathname]);

  useEffect(() => {
    if (!isTelegramMiniAppWithInitData()) {
      return;
    }
    if (pathname?.includes("/bind-phone")) {
      return;
    }

    let cancelled = false;

    const pollOnce = async (): Promise<void> => {
      pollCountRef.current += 1;
      const need = await meNeedsContactGate();
      if (!need) {
        releaseGate();
        return;
      }
      if (pollCountRef.current >= MAX_POLLS) {
        clearPoll();
        startTransition(() => setMode("timed_out"));
      }
    };

    void (async () => {
      const need = await meNeedsContactGate();
      if (cancelled) return;
      if (!need) {
        startTransition(() => setMode("inactive"));
        return;
      }

      const cfg = (await fetch("/api/auth/telegram-login/config")
        .then((r) => r.json())
        .catch(() => ({}))) as { botUsername?: string | null };
      const u = typeof cfg.botUsername === "string" ? cfg.botUsername.trim().replace(/^@/, "") : "";
      startTransition(() => {
        setBotHref(u ? `https://t.me/${u}` : null);
        setMode("blocked");
      });
      pollCountRef.current = 0;
      void pollOnce();
      intervalRef.current = setInterval(() => void pollOnce(), POLL_MS);
    })();

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [pathname, clearPoll, releaseGate]);

  const onRetry = useCallback(() => {
    void (async () => {
      startTransition(() => setMode("loading"));
      const need = await meNeedsContactGate();
      if (!need) {
        releaseGate();
        return;
      }
      const cfg = (await fetch("/api/auth/telegram-login/config")
        .then((r) => r.json())
        .catch(() => ({}))) as { botUsername?: string | null };
      const u = typeof cfg.botUsername === "string" ? cfg.botUsername.trim().replace(/^@/, "") : "";
      startTransition(() => {
        setBotHref(u ? `https://t.me/${u}` : null);
        setMode("blocked");
      });
      pollCountRef.current = 0;
      const pollOnce = async (): Promise<void> => {
        pollCountRef.current += 1;
        const stillNeed = await meNeedsContactGate();
        if (!stillNeed) {
          releaseGate();
          return;
        }
        if (pollCountRef.current >= MAX_POLLS) {
          clearPoll();
          startTransition(() => setMode("timed_out"));
        }
      };
      clearPoll();
      void pollOnce();
      intervalRef.current = setInterval(() => void pollOnce(), POLL_MS);
    })();
  }, [clearPoll, releaseGate]);

  if (mode === "inactive") {
    return <>{children}</>;
  }

  if (mode === "loading") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        Загрузка…
      </div>
    );
  }

  return (
    <div
      id="mini-app-share-contact-gate"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center"
      role="alertdialog"
      aria-labelledby="mini-app-contact-gate-title"
      aria-describedby="mini-app-contact-gate-desc"
    >
      <h1 id="mini-app-contact-gate-title" className="text-lg font-semibold">
        Нужен номер телефона
      </h1>
      <p id="mini-app-contact-gate-desc" className="max-w-md text-sm text-muted-foreground">
        {mode === "timed_out"
          ? "Не удалось подтвердить номер автоматически за отведённое время. Откройте бота и нажмите «Поделиться контактом», затем снова «Проверить снова». Если номер уже привязан в боте, подождите минуту и повторите — возможна задержка синхронизации."
          : "Откройте чат с ботом и нажмите кнопку с запросом контакта. Когда номер привяжется, приложение продолжит работу."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {botHref ? (
          <Link href={botHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants())}>
            Открыть бота
          </Link>
        ) : null}
        <Button type="button" variant="outline" onClick={onRetry}>
          Проверить снова
        </Button>
      </div>
    </div>
  );
}
