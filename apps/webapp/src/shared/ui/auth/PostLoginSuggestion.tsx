"use client";

/**
 * Подсказка после входа: настроить PIN / мессенджеры. Не блокирует навигацию.
 * Локальное скрытие: bc_post_login_nudge_v1 (7 дней).
 */

import { useEffect, useState } from "react";
import Link from "next/link";

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          security?: { hasPin?: boolean };
        };
        if (cancelled || !res.ok || !data.ok) {
          setLoading(false);
          return;
        }
        const hasPin = data.security?.hasPin === true;
        const nudge = readState();
        setVisible(!hasPin && shouldShow(nudge));
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
      className="border-border bg-muted/40 mb-6 rounded-lg border p-4"
      role="region"
      aria-label="Настройки безопасности"
    >
      <p className="mb-2 text-sm font-medium">Усильте вход без SMS</p>
      <p className="text-muted-foreground mb-3 text-sm">
        Задайте PIN-код в профиле — тогда вход по номеру будет быстрее.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/app/patient/profile" className="button">
          Задать PIN
        </Link>
        <button type="button" className="button" onClick={dismiss}>
          Напомнить через 7 дней
        </button>
      </div>
    </section>
  );
}
