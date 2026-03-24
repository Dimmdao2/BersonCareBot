"use client";

import { useEffect, useState } from "react";

/** Бейдж непрочитанных для пациента (`/api/patient/messages/unread-count`). */
export function usePatientSupportUnreadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/patient/messages/unread-count");
        const j = (await res.json()) as { ok?: boolean; unreadCount?: number };
        if (!cancelled && j.ok && typeof j.unreadCount === "number") setCount(j.unreadCount);
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

/** Бейдж непрочитанных от пользователей для врача (`/api/doctor/messages/unread-count`). */
export function useDoctorSupportUnreadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/doctor/messages/unread-count");
        const j = (await res.json()) as { ok?: boolean; unreadCount?: number };
        if (!cancelled && j.ok && typeof j.unreadCount === "number") setCount(j.unreadCount);
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
