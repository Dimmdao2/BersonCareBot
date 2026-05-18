"use client";

/**
 * Подсказка после входа: PIN / привязка Telegram. Не блокирует навигацию.
 * Локальное скрытие: bc_post_login_nudge_v1 (7 дней).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { patientCardClass, patientMutedTextClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";

const STORAGE_KEY = "bc_post_login_nudge_v1";
const DISMISS_DAYS = 7;

type NudgeState = { dismissedUntil: string };

function readState(): NudgeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NudgeState;
  } catch {
    return null;
  }
}

function shouldShow(nudge: NudgeState | null): boolean {
  if (!nudge?.dismissedUntil) return true;
  const until = Date.parse(nudge.dismissedUntil);
  if (Number.isNaN(until)) return true;
  return Date.now() > until;
}

export function PostLoginSuggestion() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinLine, setPinLine] = useState(false);
  const [telegramLine, setTelegramLine] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          security?: { hasPin?: boolean };
          user?: { bindings?: { telegramId?: string } };
          postLoginHints?: { phoneOtpChannel?: string };
        };
        if (cancelled || !res.ok || !data.ok) {
          setLoading(false);
          return;
        }
        const hasPin = data.security?.hasPin === true;
        const smsOtpLogin = data.postLoginHints?.phoneOtpChannel === "sms";
        const pinLineShould = smsOtpLogin && !hasPin;
        /** EXEC H.1.5: только после входа по SMS и при отсутствии привязки Telegram */
        const telegramLineShould = smsOtpLogin && !data.user?.bindings?.telegramId;
        const nudge = readState();
        const showBox = shouldShow(nudge);
        setPinLine(showBox && pinLineShould);
        setTelegramLine(showBox && telegramLineShould);
        setVisible(showBox && (pinLineShould || telegramLineShould));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    const until = new Date(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissedUntil: until }));
    setVisible(false);
  };

  if (loading || !visible) return null;

  return (
    <section
      id="post-login-suggestion"
      className={cn(patientCardClass, "mb-6")}
      role="region"
      aria-label="Рекомендации после входа"
    >
      <p className={cn(patientSectionTitleClass, "mb-2")}>Усильте безопасность аккаунта</p>
      <ul className={cn(patientMutedTextClass, "mb-3 list-inside list-disc space-y-1")}>
        {pinLine ? <li>Создайте PIN-код для быстрого входа.</li> : null}
        {telegramLine ? <li>Привяжите Telegram для восстановления доступа.</li> : null}
      </ul>
      <div className="flex flex-wrap gap-2">
        {pinLine ? (
          <Link href="/app/patient/profile" className={cn(buttonVariants({ size: "sm" }))}>
            Задать PIN
          </Link>
        ) : null}
        {telegramLine ? (
          <Link href="/app/patient/profile" className={cn(buttonVariants({ size: "sm" }))}>
            Привязать Telegram
          </Link>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={dismiss}>
          Напомнить через 7 дней
        </Button>
      </div>
    </section>
  );
}
