import type { CalendarFilterOption } from "./types";

export type CalendarCreateFieldKey = "specialist" | "branch" | "room" | "service";

export type CalendarCreateFieldMode = "hidden" | "fixed" | "select";

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
  if (options.length === 0) return "hidden";
  if (options.length === 1 || activeFilterId) return "fixed";
  return "select";
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

export function calendarCreateFieldLabel(
  options: readonly CalendarFilterOption[],
  valueId: string | null,
  fallback: string,
): string {
  if (!valueId) return "—";
  return options.find((o) => o.id === valueId)?.label ?? fallback;
}
