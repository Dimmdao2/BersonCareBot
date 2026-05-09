"use client";

import { useEffect } from "react";

const REHAB_ID = "patient-reminders-rehab";
const WARMUPS_ID = "patient-reminders-warmups";

function scrollHashTargetIntoView(): void {
  const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
  if (!hash || (hash !== REHAB_ID && hash !== WARMUPS_ID)) return;
  const el = document.getElementById(hash);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Scroll to `#patient-reminders-rehab` / `#patient-reminders-warmups` when opening /reminders with hash. */
export function RemindersHashScroll() {
  useEffect(() => {
    const run = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollHashTargetIntoView());
      });
    };
    run();
    const t = window.setTimeout(run, 320);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
