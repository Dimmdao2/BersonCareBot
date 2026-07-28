'use client';

import Link from 'next/link';
import { Building2, Dna, Dumbbell } from 'lucide-react';
import type { BookingCity } from '@/modules/booking-catalog/types';
import type { OnlineBookingLocationOption } from '@/modules/patient-booking/inPersonServicesCatalog';
import { publicBookPaths } from '@/shared/publicBook/paths';
import {
  bookingChoiceRowClass,
  bookingChoiceRowIconClass,
  bookingChoiceSectionClass,
} from '@/app/app/patient/booking/bookingChoiceStyles';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import { cn } from '@/lib/utils';

type Props = {
  cities: BookingCity[];
  onlineLocation: OnlineBookingLocationOption | null;
  catalogError: string | null;
  /** Present only on the canonical per-clinic entry `/book/{slug}`; threaded to keep the org
   * context through the wizard (re-resolved server-side at every step, never trusted as-is). */
  orgSlug?: string;
};

export function PublicFormatStepClient({ cities, onlineLocation, catalogError, orgSlug }: Props) {
  const sorted = [...cities].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'ru'),
  );
  const orgSlugQuery = orgSlug ? `&orgSlug=${encodeURIComponent(orgSlug)}` : '';

  return (
    <div className={bookingChoiceSectionClass}>
      <div className="flex flex-col gap-2">
        <p className={cn(patientMutedTextClass, 'text-xs font-medium uppercase tracking-wide')}>
          Очный приём
        </p>
        {catalogError ? <p className="text-sm text-destructive">{catalogError}</p> : null}
        {!catalogError ? (
          <div className="flex flex-col gap-2">
            {sorted.map((c) => (
              <Link
                key={c.id}
                href={`${publicBookPaths.newService}?cityCode=${encodeURIComponent(c.code)}&cityTitle=${encodeURIComponent(c.title)}${orgSlugQuery}`}
                prefetch={false}
                className={bookingChoiceRowClass}
              >
                <Building2 className={bookingChoiceRowIconClass} aria-hidden />
                {c.title}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {onlineLocation || !orgSlug ? (
        <div className="flex flex-col gap-2">
          <p className={cn(patientMutedTextClass, 'text-xs font-medium uppercase tracking-wide')}>
            Онлайн
          </p>
          {onlineLocation ? (
            <Link
              href={`${publicBookPaths.newService}?cityCode=${encodeURIComponent(onlineLocation.cityCode)}&cityTitle=${encodeURIComponent(onlineLocation.title)}${orgSlugQuery}`}
              prefetch={false}
              className={bookingChoiceRowClass}
            >
              <Building2 className={bookingChoiceRowIconClass} aria-hidden />
              Онлайн-приём
            </Link>
          ) : null}
          {!orgSlug ? (
            <>
              <Link
                href={`${publicBookPaths.newSlot}?type=online&category=rehab_lfk`}
                prefetch={false}
                className={cn(bookingChoiceRowClass, 'text-left')}
              >
                <Dumbbell className={bookingChoiceRowIconClass} aria-hidden />
                Реабилитация онлайн
              </Link>
              <Link
                href={`${publicBookPaths.newSlot}?type=online&category=nutrition`}
                prefetch={false}
                className={cn(bookingChoiceRowClass, 'text-left')}
              >
                <Dna className={bookingChoiceRowIconClass} aria-hidden />
                Нутрициология онлайн
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
