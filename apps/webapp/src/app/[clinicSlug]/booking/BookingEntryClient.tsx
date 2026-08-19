'use client';

import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { publicBookPaths } from '@/shared/publicBook/paths';
import {
  bookingChoiceRowClass,
  bookingChoiceRowIconClass,
  bookingChoiceSectionClass,
} from '@/app/app/patient/booking/bookingChoiceStyles';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import { cn } from '@/lib/utils';
import type { BookingEntryScreen } from './loadBookingEntry';

type Props = { screen: BookingEntryScreen; orgSlug: string; specialistId: string | null };

function serviceHref(
  orgSlug: string,
  branchId: string,
  cityCode: string,
  cityTitle: string,
  specialistId: string | null,
): string {
  const query = new URLSearchParams({
    cityCode,
    cityTitle,
    orgSlug,
    branchId,
  });
  if (specialistId) query.set('specialistId', specialistId);
  return `${publicBookPaths.newService}?${query.toString()}`;
}

/**
 * Первый экран публичной записи — ФИЛИАЛЫ, а не города.
 *
 * До 19.08 первым экраном стоял город, а филиал выбирался за посетителя (первый активный по
 * `sort_order`). Из-за этого запись привязывалась к филиалу, которого человек не выбирал, а второй
 * филиал того же города был недостижим. Город здесь — подпись у филиала, а не отдельный шаг.
 */
export function BookingEntryClient({ screen, orgSlug, specialistId }: Props) {
  if (screen.kind === 'unavailable') {
    return (
      <p role="alert" className="text-sm text-destructive">
        Каталог временно недоступен. Попробуйте обновить страницу через несколько минут.
      </p>
    );
  }

  if (screen.kind === 'services') {
    return (
      <div className={bookingChoiceSectionClass}>
        <p className={cn(patientMutedTextClass, 'text-xs')}>
          {screen.branch.title}
          {screen.specialistName ? ` · ${screen.specialistName}` : ''}
        </p>
        {screen.emptyUnderConditions ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">Под выбранные условия сейчас нет доступных услуг.</p>
            <Link
              href={`${publicBookPaths.forSlug(orgSlug)}?branch=${encodeURIComponent(screen.branch.id)}`}
              prefetch={false}
              className={cn(bookingChoiceRowClass, 'text-left')}
            >
              Показать все услуги филиала
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {screen.services.map((service) => (
              <Link
                key={service.id}
                href={serviceHref(
                  orgSlug,
                  screen.branch.id,
                  screen.branch.cityCode,
                  screen.branch.title,
                  specialistId,
                )}
                prefetch={false}
                className={bookingChoiceRowClass}
              >
                {service.title}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const staleMessage =
    screen.kind === 'stale'
      ? screen.reason === 'branch_gone'
        ? 'Этот филиал больше не принимает записи.'
        : 'Этот специалист больше не принимает записи в этой клинике.'
      : null;

  return (
    <div className={bookingChoiceSectionClass}>
      {staleMessage ? <p className="text-sm">{staleMessage}</p> : null}
      <div className="flex flex-col gap-2">
        <p className={cn(patientMutedTextClass, 'text-xs font-medium uppercase tracking-wide')}>
          Филиал
        </p>
        {screen.branches.length === 0 ? (
          <p className="text-sm">У клиники пока нет филиалов, открытых для записи.</p>
        ) : (
          screen.branches.map((branch) => (
            <Link
              key={branch.id}
              href={`${publicBookPaths.forSlug(orgSlug)}?branch=${encodeURIComponent(branch.id)}`}
              prefetch={false}
              className={bookingChoiceRowClass}
            >
              <Building2 className={bookingChoiceRowIconClass} aria-hidden />
              <span>
                {branch.title}
                <span className={cn(patientMutedTextClass, 'ml-2 text-xs')}>{branch.cityTitle}</span>
              </span>
            </Link>
          ))
        )}
      </div>

      {screen.onlineLocation ? (
        <div className="flex flex-col gap-2">
          <p className={cn(patientMutedTextClass, 'text-xs font-medium uppercase tracking-wide')}>
            Онлайн
          </p>
          <Link
            href={serviceHref(
              orgSlug,
              screen.onlineLocation.id,
              screen.onlineLocation.cityCode,
              screen.onlineLocation.title,
              specialistId,
            )}
            prefetch={false}
            className={bookingChoiceRowClass}
          >
            <Building2 className={bookingChoiceRowIconClass} aria-hidden />
            Онлайн-приём
          </Link>
        </div>
      ) : null}
    </div>
  );
}
