"use client";

import { useEffect, useState } from "react";

const ONLINE_INTAKE_NEW_LIST_URL = "/api/doctor/online-intake?status=new&limit=1";

/**
 * Число онлайн-заявок со статусом `new` для бейджа меню врача.
 * Использует тот же list API, что и экран заявок; `limit=1` минимизирует полезную нагрузку, счётчик берётся из `total`.
 */
export function useDoctorOnlineIntakeNewCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch(ONLINE_INTAKE_NEW_LIST_URL);
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
  }, []);
  return count;
}
