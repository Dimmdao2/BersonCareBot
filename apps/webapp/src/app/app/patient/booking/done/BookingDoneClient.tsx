'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { usePatientSurfaceName } from '@/shared/ui/PlatformProvider';
import { Button } from '@/shared/ui/patient/primitives/button';
import {
  patientButtonPrimaryClass,
  patientButtonSecondaryClass,
  patientCardClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';
import {
  buildGoogleCalendarUrl,
  buildYandexCalendarUrl,
  buildIcsContent,
} from '@/shared/lib/buildCalendarLinks';
import {
  formatBookingDateLongRu,
  formatBookingTimeShortRu,
} from '@/shared/lib/formatBusinessDateTime';

export type BookingDoneParams = {
  /** ISO начала (UTC или с offset). */
  slotStart: string;
  /** ISO конца. */
  slotEnd: string;
  /** Краткое название услуги (snapshot). */
  serviceTitle: string;
  /** «Онлайн» или название/город филиала. */
  locationLabel: string;
  /** Стабильный ID записи из БД (для UID ICS). */
  bookingId: string;
  /** Куда вернуться после (обычно bookingNewHref(cityCode)). */
  backToHubHref: string;
  /** IANA-таймзона для отображения. */
  appDisplayTimeZone: string;
  /** Server-resolved public origin from deployment `APP_BASE_URL`. */
  appBaseUrl: string;
};

/** Формирует summary для Google/Яндекс и ICS. */
function buildSummary(serviceTitle: string, locationLabel: string): string {
  if (locationLabel && locationLabel !== 'Онлайн') return serviceTitle;
  return serviceTitle;
}

export function BookingDoneClient({
  slotStart,
  slotEnd,
  serviceTitle,
  locationLabel,
  bookingId,
  backToHubHref,
  appDisplayTimeZone,
  appBaseUrl,
}: BookingDoneParams) {
  const patientSurfaceName = usePatientSurfaceName();
  const summary = buildSummary(serviceTitle, locationLabel);
  const location = locationLabel || undefined;
  const description = `Запись через ${patientSurfaceName}`;

  const calendarParams = useMemo(
    () => ({ startAt: slotStart, endAt: slotEnd, summary, location, description, bookingId }),
    [slotStart, slotEnd, summary, location, description, bookingId],
  );

  const googleUrl = buildGoogleCalendarUrl(calendarParams);
  const yandexUrl = buildYandexCalendarUrl(calendarParams);

  const handleDownloadIcs = useCallback(() => {
    const ics = buildIcsContent(calendarParams, appBaseUrl, patientSurfaceName);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bersoncare-booking-${bookingId}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [calendarParams, appBaseUrl, bookingId, patientSurfaceName]);

  const dateLabel = formatBookingDateLongRu(slotStart, appDisplayTimeZone);
  const timeStart = formatBookingTimeShortRu(slotStart, appDisplayTimeZone);
  const timeEnd = formatBookingTimeShortRu(slotEnd, appDisplayTimeZone);

  return (
    <div className="flex flex-col gap-4">
      {/* Success header */}
      <div className={cn(patientCardClass, 'flex flex-col gap-2 text-center')}>
        <p className="text-2xl">✓</p>
        <p className={cn(patientSectionTitleClass, 'text-center')}>Запись подтверждена</p>
        <ul className={cn(patientMutedTextClass, 'mt-1 list-none text-center')}>
          <li className="font-medium">{serviceTitle}</li>
          <li>
            {dateLabel} · {timeStart} — {timeEnd}
          </li>
          {locationLabel ? <li>{locationLabel}</li> : null}
        </ul>
      </div>

      {/* Calendar actions */}
      <div className={cn(patientCardClass, 'flex flex-col gap-3')}>
        <p className={cn(patientMutedTextClass, 'text-xs font-semibold uppercase tracking-wide')}>
          Добавить в календарь
        </p>

        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            patientButtonSecondaryClass,
            'flex items-center justify-center gap-2 text-sm',
          )}
        >
          <span>Google Календарь</span>
        </a>

        <a
          href={yandexUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            patientButtonSecondaryClass,
            'flex items-center justify-center gap-2 text-sm',
          )}
        >
          <span>Яндекс Календарь</span>
        </a>

        <Button
          type="button"
          onClick={handleDownloadIcs}
          className={cn(
            patientButtonSecondaryClass,
            'flex items-center justify-center gap-2 text-sm',
          )}
        >
          <span>Скачать .ics (Apple, Outlook…)</span>
        </Button>
      </div>

      {/* Back to hub */}
      <Link href={backToHubHref} className={patientButtonPrimaryClass}>
        Готово
      </Link>
    </div>
  );
}
