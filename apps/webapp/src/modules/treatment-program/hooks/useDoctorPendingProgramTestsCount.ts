"use client";

import { useEffect, useState } from "react";

const PENDING_PROGRAM_TESTS_SUMMARY_URL = "/api/doctor/pending-program-tests/summary";

/** Число попыток «К проверке» для бейджа пункта «Сегодня» в меню врача. */
export function useDoctorPendingProgramTestsCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch(PENDING_PROGRAM_TESTS_SUMMARY_URL);
        if (!res.ok) return;
        const j = (await res.json()) as { count?: unknown };
        if (!cancelled && typeof j.count === "number" && Number.isFinite(j.count) && j.count >= 0) {
          setCount(j.count);
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
