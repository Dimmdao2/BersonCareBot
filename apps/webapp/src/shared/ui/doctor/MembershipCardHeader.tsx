'use client';

import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

/**
 * MembershipCardHeader — shared presentational block for a membership (patient package) card.
 *
 * Renders: title · purchase date (bold) · balance · composition · consume dates.
 * Used by both PatientPackageCard (Финансы) and MembershipPanel (Визиты).
 *
 * Does NOT handle interactive buttons (Пересчитать / Записи / Списать) — those stay in
 * the caller. Does NOT own data fetching for consume sessions — receives them as props.
 */

/** One item in the package balance */
export type MembershipCardItem = {
  serviceTitle?: string | null;
  serviceId?: string | null;
  quantityInitial: number;
  remaining?: number;
};

type Props = {
  title: string;
  shortLabel?: string | null;
  soldAt?: string | null;
  /** Long package meta for card details, e.g. "аб #001 от 01.06.2026". */
  packageMeta?: string | null;
  /** Pre-computed total sessions across all balance items */
  totalSessions: number;
  /** Pre-computed remaining sessions across all balance items */
  remainingSessions: number;
  /** Balance items for composition list */
  items: MembershipCardItem[];
  /** ISO datetime strings of consumed sessions (sorted outside or sorted here) */
  consumeDates?: string[] | null;
  /** Whether consume dates are still loading */
  consumeLoading?: boolean;
};

/** Format ISO date (YYYY-MM-DD or ISO datetime) → DD.MM.YYYY */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso.slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

export function MembershipCardHeader({
  title,
  shortLabel,
  soldAt,
  packageMeta,
  remainingSessions,
  items,
  consumeDates,
  consumeLoading,
}: Props) {
  const sortedConsumeDates = consumeDates
    ? [...consumeDates].sort((a, b) => a.localeCompare(b))
    : null;

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-3 flex flex-col gap-1.5">
      {/* Title */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {shortLabel ? (
          <span className="inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">
            {shortLabel}
          </span>
        ) : null}
      </div>

      {/* Purchase date */}
      {packageMeta ? (
        <p className="text-xs text-muted-foreground">{packageMeta}</p>
      ) : soldAt ? (
        <p className="text-xs text-muted-foreground">
          дата покупки: <strong className="text-foreground">{fmtDate(soldAt)}</strong>
        </p>
      ) : null}

      {/* Balance */}
      <p className="text-xs text-muted-foreground">Осталось {remainingSessions} визитов:</p>

      {/* Composition */}
      {items.length > 0 ? (
        <p className="text-xs text-foreground">
          {items
            .map(
              (it) =>
                `${it.remaining ?? it.quantityInitial} x ${it.serviceTitle ?? it.serviceId ?? 'Услуга'}`,
            )
            .join(', ')}
        </p>
      ) : null}

      {/* Consume dates */}
      {consumeLoading ? (
        <DoctorPanelLoading className="py-2" />
      ) : sortedConsumeDates && sortedConsumeDates.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-0.5">
            Списания ({sortedConsumeDates.length}):
          </p>
          <p className="text-xs text-foreground">
            {sortedConsumeDates.map((d) => fmtDate(d.slice(0, 10))).join(', ')}
          </p>
        </div>
      ) : sortedConsumeDates && sortedConsumeDates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Списаний нет.</p>
      ) : null}
    </div>
  );
}
