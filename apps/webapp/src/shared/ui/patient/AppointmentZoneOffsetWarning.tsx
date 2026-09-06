'use client';

import { useEffect, useState } from 'react';
import { getBrowserCalendarIanaForAuth } from '@/shared/lib/browserCalendarIana';
import { resolveAppointmentZoneWarning } from '@/shared/lib/appointmentZoneOffset';
import { cn } from '@/lib/utils';

type Props = {
  /** ISO-момент записи (UTC или с offset). */
  iso: string;
  /** Канонический IANA-пояс филиала записи; `null`/`undefined` — предупреждение не показывается. */
  branchTimeZone: string | null | undefined;
  className?: string;
};

/**
 * Owner: `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §34, `PATIENT-OVERVIEW-09/10`. Компактный
 * красный `!` и подпись `UTC±N` — только когда UTC-смещение филиала на момент записи отличается
 * от смещения устройства пациента; иначе ничего не рендерит.
 *
 * Пояс устройства известен только в браузере: на сервере/до монтирования компонент не рендерит
 * ничего (не показывает ложное предупреждение и не создаёт hydration mismatch — та же строка
 * `null` на сервере и при первом клиентском рендере).
 */
export function AppointmentZoneOffsetWarning({ iso, branchTimeZone, className }: Props) {
  const [deviceTimeZone, setDeviceTimeZone] = useState<string | null>(null);

  useEffect(() => {
    // One-shot client-only detection of the device IANA zone; server/first-render value must stay
    // `null` to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeviceTimeZone(getBrowserCalendarIanaForAuth() ?? null);
  }, []);

  const warning = resolveAppointmentZoneWarning(iso, branchTimeZone, deviceTimeZone);
  if (!warning) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--patient-color-danger)]',
        className,
      )}
    >
      <span aria-hidden="true">!</span>
      <span>{warning.offsetLabel}</span>
    </span>
  );
}
