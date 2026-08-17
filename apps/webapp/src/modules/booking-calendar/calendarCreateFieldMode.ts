import type { CalendarFilterOption } from './types';

export type CalendarCreateFieldKey = 'specialist' | 'branch' | 'room' | 'service';

export type CalendarCreateFieldMode = 'hidden' | 'fixed' | 'select';

export type CalendarCreateActiveFilters = {
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
  serviceId: string | null;
};

export function resolveCalendarCreateFieldMode(
  options: readonly CalendarFilterOption[],
  activeFilterId: string | null,
): CalendarCreateFieldMode {
  if (options.length === 0) return 'hidden';
  if (options.length === 1 || activeFilterId) return 'fixed';
  return 'select';
}

export function resolveCalendarCreateFieldValue(
  options: readonly CalendarFilterOption[],
  activeFilterId: string | null,
  currentValue: string | null,
): string | null {
  if (options.length === 0) return null;
  if (activeFilterId && options.some((o) => o.id === activeFilterId)) return activeFilterId;
  if (options.length === 1) return options[0]!.id;
  return currentValue;
}

export type CalendarCreateDraft = {
  start: string;
  durationMinutes: number | null;
  specialistId: string | null;
  branchId: string | null;
  serviceId: string | null;
  /** Whether the picked service is actually offered for the picked specialist and branch. */
  serviceIsOffered: boolean;
};

export type CalendarCreateSubmission =
  | {
      ok: true;
      start: string;
      durationMinutes: number;
      specialistId: string;
      branchId: string;
      serviceId: string;
    }
  | { ok: false; message: string };

/**
 * Turns the create-form draft into a submittable appointment, or into the reason it is not one.
 * Every blocking condition names itself: a staff member who left only the start time empty must
 * not be told that the branch, service and specialist are missing while all three are filled in.
 */
export function resolveCalendarCreateSubmission(
  draft: CalendarCreateDraft,
): CalendarCreateSubmission {
  const { start, durationMinutes, specialistId, branchId, serviceId } = draft;
  const missing: string[] = [];
  if (!start) missing.push('начало записи');
  if (!specialistId) missing.push('специалиста');
  if (!branchId) missing.push('филиал');
  if (!serviceId) missing.push('услугу');
  if (!start || !specialistId || !branchId || !serviceId) {
    return { ok: false, message: `Укажите ${missing.join(', ')}.` };
  }
  if (!draft.serviceIsOffered) {
    return {
      ok: false,
      message: 'Выбранная услуга недоступна для выбранных специалиста и филиала.',
    };
  }
  if (!durationMinutes) {
    return { ok: false, message: 'У выбранной услуги не задана длительность.' };
  }
  return { ok: true, start, durationMinutes, specialistId, branchId, serviceId };
}

export function calendarCreateFieldLabel(
  options: readonly CalendarFilterOption[],
  valueId: string | null,
  fallback: string,
): string {
  if (!valueId) return '—';
  return options.find((o) => o.id === valueId)?.label ?? fallback;
}
