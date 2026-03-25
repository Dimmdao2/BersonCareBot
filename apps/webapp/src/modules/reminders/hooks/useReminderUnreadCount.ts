"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 60_000;

/** Кол-во непросмотренных напоминаний, polling каждые 60 сек, пауза при скрытом вкладке. */
export function useReminderUnreadCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/patient/reminders/unread-count");
        const j = (await res.json()) as { ok?: boolean; count?: number };
        if (!cancelled && j.ok && typeof j.count === "number") setCount(j.count);
      } catch {
        /* ignore network errors */
      }
    };

    void run();
    const t = setInterval(run, POLL_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return count;
}
