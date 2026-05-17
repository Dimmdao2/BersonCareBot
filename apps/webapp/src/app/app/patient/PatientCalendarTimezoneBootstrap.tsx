"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserCalendarIanaForAuth } from "@/shared/lib/browserCalendarIana";

/** Событие после записи в БД — чтобы экран профиля перечитал GET без полного remount. */
export const PATIENT_CALENDAR_TZ_BOOTSTRAP_EVENT = "patient-calendar-tz-bootstrapped";

/**
 * При первом заходе в кабинет: если `calendar_timezone` ещё `null`, подставляем IANA из `Intl` в браузере
 * (как при регистрации), не перезаписывая уже выбранный пояс.
 */
export function PatientCalendarTimezoneBootstrap() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      try {
        const getRes = await fetch("/api/patient/profile/calendar-timezone");
        const data = (await getRes.json().catch(() => null)) as {
          ok?: boolean;
          calendarTimezone?: string | null;
        };
        if (!getRes.ok || !data?.ok) return;

        const raw = data.calendarTimezone?.trim() ?? "";
        if (raw.length > 0) return;

        const browserTz = getBrowserCalendarIanaForAuth();
        if (!browserTz) return;

        const postRes = await fetch("/api/patient/profile/calendar-timezone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ browserCalendarIana: browserTz }),
        });
        const postData = (await postRes.json().catch(() => null)) as { ok?: boolean };
        if (!postRes.ok || !postData?.ok) return;

        router.refresh();
        window.dispatchEvent(new Event(PATIENT_CALENDAR_TZ_BOOTSTRAP_EVENT));
      } catch {
        // ignore
      }
    })();
  }, [router]);

  return null;
}
