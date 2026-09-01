'use client';

import Link from 'next/link';
import { doctorInlineLinkClass, doctorSectionItemClass } from '@/shared/ui/doctor/doctorVisual';
import {
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';

/**
 * Normalized appointment shape accepted by AppointmentKpiItem.
 * Both DoctorTodayRightKpiRow (TodayAppointmentItem) and ScheduleCalendarTab
 * (CalendarAppointmentEvent) map their domain types to this before rendering.
 */
export type AppointmentKpiItemData = {
  /** Display name of the client / patient. */
  clientLabel: string;
  /** Formatted time string, e.g. «10:00» or «10:00 23.06». */
  time: string;
  /** Service type / appointment type label. */
  typeLabel: string | null;
  /** Status label; omitted for cancelled items (they show «Отмена» badge instead). */
  statusLabel: string | null;
  /** Branch / location name. */
  branchName: string | null;
  /** Optional secondary name note. */
  altNameNote: string | null;
  /** Whether this appointment is cancelled. Controls destructive styling. */
  cancelled: boolean;
  /** Link href to the patient card or schedule entry. `null` = no link shown. */
  href: string | null;
  /** CTA label for the link, e.g. «Открыть запись». */
  ctaLabel: string | null;
};

/**
 * Canonical KPI modal row for appointment items.
 * Etalon: DoctorTodayRightKpiRow (страница «Сегодня»).
 * Used by: DoctorTodayRightKpiRow, ScheduleCalendarTab.
 */
export function AppointmentKpiItem({
  item,
  flat = false,
}: {
  item: AppointmentKpiItemData;
  flat?: boolean;
}) {
  const {
    clientLabel,
    time,
    typeLabel,
    statusLabel,
    branchName,
    altNameNote,
    cancelled,
    href,
    ctaLabel,
  } = item;

  const secondary = [typeLabel, !cancelled ? statusLabel : null, branchName]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={
        flat && !cancelled
          ? doctorDnaFlatListRowClass
          : cancelled
            ? 'rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2'
            : doctorSectionItemClass
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={
            cancelled
              ? 'font-medium text-destructive/80 line-through'
              : flat
                ? doctorDnaFlatListPrimaryClass
                : 'font-medium text-foreground'
          }
        >
          {clientLabel}
        </p>
        <span className={flat ? `${doctorDnaFlatListMetaClass} shrink-0` : 'shrink-0 text-xs text-muted-foreground'}>{time}</span>
      </div>

      {cancelled ? (
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-destructive">
          Отмена
        </p>
      ) : null}

      {altNameNote ? (
        <p className={flat ? `${doctorDnaFlatListMetaClass} mt-0.5` : 'mt-0.5 text-xs text-muted-foreground'}>
          {altNameNote}
        </p>
      ) : null}

      {secondary ? (
        <p className={flat ? `${doctorDnaFlatListMetaClass} mt-0.5` : 'mt-0.5 text-xs text-muted-foreground'}>
          {secondary}
        </p>
      ) : null}

      {!cancelled && href && ctaLabel ? (
        <p className="mt-2">
          <Link
            href={href}
            className={flat ? doctorDnaFlatListClickableClass : doctorInlineLinkClass}
          >
            {ctaLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
