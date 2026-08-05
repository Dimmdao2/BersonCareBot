import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import type { CalendarFilterMeta } from '@/modules/booking-calendar/types';
import type { ScheduleKpis } from '@/modules/doctor-appointments/ports';
import {
  resolveDoctorScheduleScopeState,
  type DoctorScheduleScopeBootstrap,
  type DoctorScheduleScopeState,
  type ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';
import { parseCalendarDoctorSettings } from './scheduleCalendarSettings';
import {
  resolveScheduleCalAnchorDate,
  resolveScheduleCalView,
  scheduleCalViewToApiView,
  visibleRange,
} from './scheduleCalendarRange';
import type {
  ScheduleCalendarBootstrap,
  ScheduleCalendarFeedSnapshot,
} from './scheduleCalendarBootstrapTypes';

export type { ScheduleCalendarBootstrap, ScheduleCalendarFeedSnapshot } from './scheduleCalendarBootstrapTypes';
export { isScheduleCalendarBootstrap } from './scheduleCalendarBootstrapTypes';

type Deps = ReturnType<typeof buildAppDeps>;

function scopeCalendarFilterMeta(
  filters: CalendarFilterMeta,
  resolvedScope: ResolvedDoctorScheduleScope,
): CalendarFilterMeta {
  if (!resolvedScope.specialistId) return filters;
  const specialistId = resolvedScope.specialistId;
  return {
    ...filters,
    specialists: filters.specialists.filter((option) => option.id === specialistId),
    services: filters.services.map((service) => ({
      ...service,
      availability: service.availability.filter(
        (availability) => availability.specialistId === specialistId,
      ),
    })),
  };
}

function toResolvedScope(
  bootstrap: DoctorScheduleScopeBootstrap,
  state: DoctorScheduleScopeState,
): ResolvedDoctorScheduleScope {
  return {
    scope: state.scope,
    specialistId: state.specialistId,
    ownSpecialistId: bootstrap.ownSpecialistId,
    canManageAllSpecialists: bootstrap.canManageAllSpecialists,
    specialists: bootstrap.specialists,
  };
}

/**
 * Server-first bootstrap for schedule tab `cal` (Записи): calendar feed + optional KPI +
 * doctor calendar settings for the deep-linked (or default) visible range.
 * Client continues with refresh/polling after hydration; inactive tabs stay unloaded.
 */
export async function loadDoctorScheduleCalendarBootstrap(input: {
  deps: Deps;
  organizationId: string;
  timeZone: string;
  scheduleScopeBootstrap: DoctorScheduleScopeBootstrap;
  doctorStatisticsEnabled: boolean;
  deepLinkParams: Record<string, string>;
}): Promise<ScheduleCalendarBootstrap | null> {
  const { deps, organizationId, timeZone, scheduleScopeBootstrap, doctorStatisticsEnabled } =
    input;
  if (!deps.bookingCalendar) return null;

  const view = resolveScheduleCalView(input.deepLinkParams.view);
  const anchorDate = resolveScheduleCalAnchorDate(input.deepLinkParams.date, timeZone);
  const branchId = input.deepLinkParams.location?.trim() || null;
  const serviceId = input.deepLinkParams.service?.trim() || null;
  const scheduleScope = resolveDoctorScheduleScopeState(
    scheduleScopeBootstrap,
    input.deepLinkParams.scope,
    input.deepLinkParams.specialist,
  );
  const resolvedScope = toResolvedScope(scheduleScopeBootstrap, scheduleScope);
  const range = visibleRange(view, anchorDate, timeZone);
  const apiView = scheduleCalViewToApiView(view);

  const settingsPromise = deps.systemSettings
    .listSettingsByScope('doctor', { organizationId })
    .then(parseCalendarDoctorSettings)
    .catch(() => parseCalendarDoctorSettings([]));

  const calendarPromise = deps.bookingCalendar
    .getCalendar({
      organizationId,
      rangeStart: range.from,
      rangeEnd: range.to,
      timeZone,
      specialistId: scheduleScope.specialistId,
      branchId,
      serviceId,
    })
    .then(
      (aggregate): ScheduleCalendarFeedSnapshot => ({
        ok: true,
        view: apiView,
        anchorDate,
        timeZone,
        events: aggregate.events,
        filters: scopeCalendarFilterMeta(aggregate.filters, resolvedScope),
        readSource: aggregate.readSource,
        showWorkingHours: aggregate.showWorkingHours,
        workingBounds: aggregate.workingBounds,
        resolvedScope,
      }),
    );

  const kpisPromise =
    doctorStatisticsEnabled && view !== 'day'
      ? (async (): Promise<ScheduleKpis | null> => {
          try {
            const audience = await loadDoctorAnalyticsAudience();
            return await deps.doctorAppointments.getScheduleKpis(
              {
                from: range.from,
                to: range.to,
                branchId,
                serviceId,
                specialistId: scheduleScope.specialistId,
              },
              {
                excludedUserIds: audience?.excludedUserIds ?? [],
                organizationId,
              },
            );
          } catch {
            return null;
          }
        })()
      : Promise.resolve(null);

  try {
    const [calendar, kpis, settings] = await Promise.all([
      calendarPromise,
      kpisPromise,
      settingsPromise,
    ]);
    return {
      fetchedAt: new Date().toISOString(),
      view,
      anchorDate,
      branchId,
      serviceId,
      scheduleScope,
      calendar,
      kpis,
      settings,
    };
  } catch {
    // Degrade to client fetch — shell/settings still render.
    return null;
  }
}
