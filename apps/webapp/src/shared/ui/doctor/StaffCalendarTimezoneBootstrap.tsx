'use client';

import { useEffect } from 'react';
import { getBrowserCalendarIanaForAuth } from '@/shared/lib/browserCalendarIana';

/**
 * Пояс сотрудника определяется УСТРОЙСТВОМ, а не настраивается руками (§34 канона владельца,
 * `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`). Аналог `PatientCalendarTimezoneBootstrap` для
 * staff-каркаса: при первом заходе, если `calendar_timezone` ещё `null`, подставляет IANA из `Intl`.
 * Уже сохранённое значение не трогает — сервер пишет только по пустому полю.
 */
export function StaffCalendarTimezoneBootstrap() {
  useEffect(() => {
    void (async () => {
      try {
        const getRes = await fetch('/api/doctor/account/timezone');
        const data = (await getRes.json().catch(() => null)) as {
          ok?: boolean;
          timezone?: string | null;
        };
        if (!getRes.ok || !data?.ok) return;
        if ((data.timezone?.trim() ?? '').length > 0) return;

        const browserTz = getBrowserCalendarIanaForAuth();
        if (!browserTz) return;

        await fetch('/api/doctor/account/timezone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ browserCalendarIana: browserTz }),
        });
      } catch {
        // ignore
      }
    })();
  }, []);

  return null;
}
