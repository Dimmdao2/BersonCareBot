'use client';

import { useEffect } from 'react';
import { getBrowserCalendarIanaForAuth } from '@/shared/lib/browserCalendarIana';

const timezoneSyncs = new Map<string, Promise<void>>();

function syncStaffCalendarTimezone(browserTz: string): Promise<void> {
  const existing = timezoneSyncs.get(browserTz);
  if (existing) return existing;

  const request = (async () => {
    const getRes = await fetch('/api/doctor/account/timezone');
    const data = (await getRes.json().catch(() => null)) as {
      ok?: boolean;
      timezone?: string | null;
    };
    if (!getRes.ok || !data?.ok || (data.timezone?.trim() ?? '') === browserTz) return;

    await fetch('/api/doctor/account/timezone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browserCalendarIana: browserTz }),
    });
  })().catch(() => undefined);

  const trackedRequest = request.finally(() => {
    if (timezoneSyncs.get(browserTz) === trackedRequest) {
      timezoneSyncs.delete(browserTz);
    }
  });

  timezoneSyncs.set(browserTz, trackedRequest);
  return trackedRequest;
}

/**
 * Пояс сотрудника определяется УСТРОЙСТВОМ, а не настраивается руками (§34 канона владельца,
 * `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`). Аналог `PatientCalendarTimezoneBootstrap` для
 * staff-каркаса: при каждом заходе сверяет сохранённый пояс с текущим поясом устройства и, если они
 * разошлись (первый вход или переезд), молча приводит сохранённый к устройству. Вопроса человеку нет:
 * владелец, 20.08 — «не спрашивать». Запись идёт, только когда значения разные.
 */
export function StaffCalendarTimezoneBootstrap() {
  useEffect(() => {
    void (async () => {
      try {
        const browserTz = getBrowserCalendarIanaForAuth();
        if (!browserTz) return;

        await syncStaffCalendarTimezone(browserTz);
      } catch {
        // ignore
      }
    })();
  }, []);

  return null;
}
