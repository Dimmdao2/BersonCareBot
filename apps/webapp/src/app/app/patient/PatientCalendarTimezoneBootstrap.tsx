'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserCalendarIanaForAuth } from '@/shared/lib/browserCalendarIana';

/** Событие после записи в БД — чтобы экран профиля перечитал GET без полного remount. */
export const PATIENT_CALENDAR_TZ_BOOTSTRAP_EVENT = 'patient-calendar-tz-bootstrapped';

/**
 * При каждом заходе в кабинет сверяем сохранённый `calendar_timezone` с поясом устройства (`Intl`) и,
 * если они разошлись — первый вход или человек переехал, — молча приводим сохранённый к устройству.
 * Ручной настройки пояса у человека нет и вопрос ему не задаётся (§34 канона владельца; владелец,
 * 20.08 — «не спрашивать»). Запись уходит, только когда значения разные.
 */
export function PatientCalendarTimezoneBootstrap() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      try {
        const browserTz = getBrowserCalendarIanaForAuth();
        if (!browserTz) return;

        const getRes = await fetch('/api/patient/profile/calendar-timezone');
        const data = (await getRes.json().catch(() => null)) as {
          ok?: boolean;
          calendarTimezone?: string | null;
        };
        if (!getRes.ok || !data?.ok) return;

        if ((data.calendarTimezone?.trim() ?? '') === browserTz) return;

        const postRes = await fetch('/api/patient/profile/calendar-timezone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
