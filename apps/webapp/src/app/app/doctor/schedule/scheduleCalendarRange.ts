import { DateTime } from 'luxon';

/** v26 calendar tab views (FullCalendar + list). */
export type ScheduleCalV26View = '3days' | 'weekgrid' | 'month' | 'day';

/**
 * Visible range for each view — single source of truth for feed, KPI, and list.
 * Dates are ISO instants in the given zone.
 */
export function visibleRange(
  view: ScheduleCalV26View,
  anchor: string,
  tz: string,
): { from: string; to: string } {
  const dt = DateTime.fromISO(anchor, { zone: tz });

  if (view === '3days') {
    const from = dt.startOf('day');
    const to = dt.startOf('day').plus({ days: 3 });
    return {
      from: from.toISO() ?? anchor,
      to: to.toISO() ?? anchor,
    };
  }

  if (view === 'weekgrid') {
    const from = dt.startOf('week');
    const to = dt.endOf('week').startOf('day').plus({ days: 1 });
    return {
      from: from.toISO() ?? anchor,
      to: to.toISO() ?? anchor,
    };
  }

  if (view === 'month') {
    const from = dt.startOf('month');
    const to = dt.endOf('month').startOf('day').plus({ days: 1 });
    return {
      from: from.toISO() ?? anchor,
      to: to.toISO() ?? anchor,
    };
  }

  const from = dt.startOf('day');
  const to = dt.startOf('day').plus({ days: 1 });
  return {
    from: from.toISO() ?? anchor,
    to: to.toISO() ?? anchor,
  };
}

/** Map v26 view id to booking-calendar API `view` param. */
export function scheduleCalViewToApiView(
  view: ScheduleCalV26View,
): '3days' | 'week' | 'month' | 'day' {
  if (view === '3days') return '3days';
  if (view === 'weekgrid') return 'week';
  if (view === 'month') return 'month';
  return 'day';
}

export function resolveScheduleCalView(raw: string | undefined): ScheduleCalV26View {
  if (raw === '3days' || raw === 'weekgrid' || raw === 'month' || raw === 'day') return raw;
  // Owner ruling 2026-07-18: clean entry defaults to week when no deep-link view.
  return 'weekgrid';
}

export function resolveScheduleCalAnchorDate(raw: string | undefined, timeZone: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return DateTime.now().setZone(timeZone).toISODate() ?? '2026-01-01';
}
