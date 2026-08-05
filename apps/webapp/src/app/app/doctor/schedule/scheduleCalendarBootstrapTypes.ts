import type {
  CalendarEvent,
  CalendarFilterMeta,
  WorkingBounds,
} from '@/modules/booking-calendar/types';
import type { ScheduleKpis } from '@/modules/doctor-appointments/ports';
import type {
  DoctorScheduleScopeState,
  ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';
import type { CalendarDoctorSettings } from './scheduleCalendarSettings';
import type { ScheduleCalV26View } from './scheduleCalendarRange';

/** Client-safe feed snapshot (no server deps). */
export type ScheduleCalendarFeedSnapshot = {
  ok: true;
  view: string;
  anchorDate: string;
  timeZone: string;
  events: CalendarEvent[];
  filters: CalendarFilterMeta;
  readSource?: 'canonical';
  showWorkingHours: boolean;
  workingBounds?: WorkingBounds | null;
  resolvedScope: ResolvedDoctorScheduleScope;
};

/** Client-safe SSR bootstrap for the calendar tab. */
export type ScheduleCalendarBootstrap = {
  fetchedAt: string;
  view: ScheduleCalV26View;
  anchorDate: string;
  branchId: string | null;
  serviceId: string | null;
  scheduleScope: DoctorScheduleScopeState;
  calendar: ScheduleCalendarFeedSnapshot;
  kpis: ScheduleKpis | null;
  settings: CalendarDoctorSettings;
};

export function isScheduleCalendarBootstrap(
  value: unknown,
): value is ScheduleCalendarBootstrap {
  if (!value || typeof value !== 'object') return false;
  const v = value as ScheduleCalendarBootstrap;
  return (
    typeof v.fetchedAt === 'string' &&
    typeof v.view === 'string' &&
    typeof v.anchorDate === 'string' &&
    v.calendar != null &&
    typeof v.calendar === 'object' &&
    v.calendar.ok === true
  );
}
