"use client";

import { useEffect, useState } from "react";

const REGISTRATION_SYSTEM_FAILURES_URL =
  "/api/admin/auth-registration-events?preset=week&eventType=auth_register_failure&errorClass=system&page=1&limit=1";

/**
 * Число системных сбоев регистрации за неделю — бейдж «Журнал операций» (admin mode).
 */
export function useDoctorRegistrationSystemFailureCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const run = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch(REGISTRATION_SYSTEM_FAILURES_URL);
        if (!res.ok) return;
        const j = (await res.json()) as { total?: unknown };
        if (!cancelled && typeof j.total === "number" && Number.isFinite(j.total) && j.total >= 0) {
          setCount(j.total);
        }
      } catch {
        /* ignore */
      }
    };
    void run();
    const t = setInterval(run, 20000);
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);

  return enabled ? count : 0;
}
