import type { BreakInterval } from './ports';

/**
 * Break edits of a single working day, expressed in local minutes of that day.
 *
 * The doctor calendar edits breaks straight from a time selection on the grid, and the work
 * schedule editor edits the same `be_working_days.breaks` array from a form. Both go through
 * these rules so a break created from the grid is the same object the schedule editor shows,
 * and so the validation of CAL-ACTION-10 lives next to the model instead of in a screen.
 */

export type MinuteInterval = { startMinute: number; endMinute: number };

export type WorkingDayBreakEditError =
  | 'invalid_interval'
  | 'empty_working_day'
  | 'outside_working_hours'
  | 'appointment_overlap'
  | 'no_break_in_selection';

export type WorkingDayBreakEditResult =
  { ok: true; breaks: BreakInterval[] } | { ok: false; error: WorkingDayBreakEditError };

export type WorkingDayBreakEditInput = {
  /** Working bounds of the day, as they are effective right now. */
  dayStartMinute: number;
  dayEndMinute: number;
  /** Breaks currently stored (or inherited) for the day. */
  breaks: readonly MinuteInterval[];
  /** Interval selected on the calendar grid. */
  selection: MinuteInterval;
  /** Intervals that must stay bookable — non-cancelled appointments of the day. */
  busy?: readonly MinuteInterval[];
};

function overlaps(left: MinuteInterval, right: MinuteInterval): boolean {
  return left.startMinute < right.endMinute && left.endMinute > right.startMinute;
}

/** Sorts, merges overlapping/adjacent intervals and drops empty ones. */
export function normalizeBreaks(intervals: readonly MinuteInterval[]): BreakInterval[] {
  const sorted = intervals
    .filter((interval) => interval.endMinute > interval.startMinute)
    .map((interval) => ({ startMinute: interval.startMinute, endMinute: interval.endMinute }))
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const merged: BreakInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, interval.endMinute);
      continue;
    }
    merged.push({ ...interval });
  }
  return merged;
}

/** Removes `cut` from `interval`, returning the 0–2 remaining pieces. */
function subtract(interval: MinuteInterval, cut: MinuteInterval): BreakInterval[] {
  if (!overlaps(interval, cut)) {
    return [{ startMinute: interval.startMinute, endMinute: interval.endMinute }];
  }
  const pieces: BreakInterval[] = [];
  if (interval.startMinute < cut.startMinute) {
    pieces.push({ startMinute: interval.startMinute, endMinute: cut.startMinute });
  }
  if (interval.endMinute > cut.endMinute) {
    pieces.push({ startMinute: cut.endMinute, endMinute: interval.endMinute });
  }
  return pieces;
}

function validateDay(input: WorkingDayBreakEditInput): WorkingDayBreakEditError | null {
  if (input.selection.endMinute <= input.selection.startMinute) return 'invalid_interval';
  if (input.dayEndMinute <= input.dayStartMinute) return 'empty_working_day';
  return null;
}

/**
 * CAL-ACTION-06/10: turns the selected interval into a break of the day.
 *
 * Rejects a selection that leaves the working bounds or that would close time an existing
 * appointment already occupies; a selection that touches existing breaks merges with them.
 */
export function addBreakToWorkingDay(input: WorkingDayBreakEditInput): WorkingDayBreakEditResult {
  const invalid = validateDay(input);
  if (invalid) return { ok: false, error: invalid };
  if (
    input.selection.startMinute < input.dayStartMinute ||
    input.selection.endMinute > input.dayEndMinute
  ) {
    return { ok: false, error: 'outside_working_hours' };
  }
  if ((input.busy ?? []).some((busy) => overlaps(busy, input.selection))) {
    return { ok: false, error: 'appointment_overlap' };
  }
  return { ok: true, breaks: normalizeBreaks([...input.breaks, input.selection]) };
}

/**
 * CAL-ACTION-07/10: reopens the selected interval for booking by removing exactly that slice
 * of the day's breaks. Breaks outside the selection are untouched; a break that only partly
 * intersects it is split rather than dropped.
 */
export function openWorkingDayIntervalForBooking(
  input: WorkingDayBreakEditInput,
): WorkingDayBreakEditResult {
  const invalid = validateDay(input);
  if (invalid) return { ok: false, error: invalid };
  const normalized = normalizeBreaks(input.breaks);
  if (!normalized.some((interval) => overlaps(interval, input.selection))) {
    return { ok: false, error: 'no_break_in_selection' };
  }
  const remaining = normalized.flatMap((interval) => subtract(interval, input.selection));
  return { ok: true, breaks: normalizeBreaks(remaining) };
}

/** Whether `selection` intersects any of `intervals`. */
export function intersectsAny(
  selection: MinuteInterval,
  intervals: readonly MinuteInterval[],
): boolean {
  return intervals.some((interval) => overlaps(interval, selection));
}
