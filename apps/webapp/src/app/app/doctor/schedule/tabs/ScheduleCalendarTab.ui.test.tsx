import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleKpis } from '@/modules/doctor-appointments/ports';
import type { ScheduleCalendarBootstrap } from '../scheduleCalendarBootstrapTypes';
import { DEFAULT_CALENDAR_SETTINGS } from '../scheduleCalendarSettings';
import { ScheduleCalendarTab } from './ScheduleCalendarTab';

vi.mock('@fullcalendar/react', () => ({
  default: forwardRef(function FullCalendarMock() {
    return <div data-testid="full-calendar" />;
  }),
}));
vi.mock('@fullcalendar/daygrid', () => ({ default: {} }));
vi.mock('@fullcalendar/timegrid', () => ({ default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ default: {} }));
vi.mock('@fullcalendar/luxon3', () => ({ default: {} }));
vi.mock('@fullcalendar/core/locales/ru', () => ({ default: {} }));
vi.mock('../../calendar/DoctorCalendarEventPanel', () => ({
  DoctorCalendarEventPanel: ({
    startInCreate,
    createInitialSpecialistId,
    activeFilters,
  }: {
    startInCreate?: boolean;
    createInitialSpecialistId?: string | null;
    activeFilters: { specialistId: string | null };
  }) =>
    startInCreate ? (
      <div
        data-testid="calendar-event-panel"
        data-default-specialist={createInitialSpecialistId ?? ''}
        data-active-specialist={activeFilters.specialistId ?? ''}
      />
    ) : null,
}));
vi.mock('../../calendar/DoctorCalendarRescheduleDialog', () => ({
  DoctorCalendarRescheduleDialog: () => null,
}));
vi.mock('../../calendar/DoctorCalendarToolbarFilter', () => ({
  DoctorCalendarToolbarFilter: () => null,
}));
vi.mock('@/shared/ui/doctor/KpiPreviewModal', () => ({
  KpiPreviewModal: () => null,
}));

const OWN_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';

const EMPTY_KPIS: ScheduleKpis = {
  recordsInPeriod: 0,
  pastInPeriod: 0,
  futureInPeriod: 0,
  bySubscriptionInPeriod: 0,
  firstVisitInPeriod: 0,
  firstVisitIds: [],
  repeatVisitInPeriod: 0,
  uniquePatientsInPeriod: 0,
  cancellationsInPeriod: 0,
  reschedulesInPeriod: 0,
};

function makeCalendarBootstrap(
  overrides: Partial<ScheduleCalendarBootstrap> = {},
): ScheduleCalendarBootstrap {
  return {
    fetchedAt: '2026-07-30T10:00:00.000Z',
    view: 'weekgrid',
    anchorDate: '2026-07-30',
    branchId: null,
    serviceId: null,
    scheduleScope: { scope: 'clinic', specialistId: null },
    calendar: {
      ok: true,
      view: 'week',
      anchorDate: '2026-07-30',
      timeZone: 'Europe/Moscow',
      events: [],
      filters: { specialists: [], branches: [], rooms: [], services: [] },
      readSource: 'canonical',
      showWorkingHours: true,
      workingBounds: null,
      resolvedScope: {
        scope: 'clinic',
        specialistId: null,
        ownSpecialistId: OWN_ID,
        canManageAllSpecialists: true,
        specialists: [],
      },
    },
    kpis: { ...EMPTY_KPIS, recordsInPeriod: 5 },
    settings: DEFAULT_CALENDAR_SETTINGS,
    ...overrides,
  };
}

function calendarJsonResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ScheduleCalendarTab scope requests', () => {
  it('hides clinic booking statistics and does not load their API when doctor_statistics is blocked', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === '/api/doctor/settings') {
          return { ok: true, json: async () => ({ ok: true, settings: [] }) } as Response;
        }
        if (url.startsWith('/api/doctor/booking-engine/calendar?')) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                ok: true,
                view: 'week',
                anchorDate: '2026-07-30',
                timeZone: 'Europe/Moscow',
                events: [],
                filters: { specialists: [], branches: [], rooms: [], services: [] },
                readSource: 'canonical',
                showWorkingHours: true,
                workingBounds: null,
                resolvedScope: {
                  scope: 'clinic',
                  specialistId: null,
                  ownSpecialistId: OWN_ID,
                  canManageAllSpecialists: true,
                  specialists: [],
                },
              }),
          } as Response;
        }
        return { ok: true, json: async () => ({ ok: true, window: null }) } as Response;
      }),
    );

    render(
      <ScheduleCalendarTab
        deepLinkParams={{ view: 'weekgrid', date: '2026-07-30' }}
        onDeepLinkChange={vi.fn()}
        isActive={false}
        initialTimeZone="Europe/Moscow"
        doctorStatisticsEnabled={false}
        scheduleScopeBootstrap={{
          ownSpecialistId: OWN_ID,
          canManageAllSpecialists: true,
          specialists: [{ id: OWN_ID, displayLabel: 'Свой специалист' }],
        }}
      />,
    );

    await waitFor(() => expect(requestedUrls.some((url) => url.includes('/calendar?'))).toBe(true));
    expect(screen.queryByTestId('cal-kpi-row')).not.toBeInTheDocument();
    expect(requestedUrls.some((url) => url.includes('/schedule-kpis?'))).toBe(false);
  });

  it('sends the same trusted specialist scope to calendar, KPI, and nearest-window', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === '/api/doctor/settings') {
          return {
            ok: true,
            json: async () => ({ ok: true, settings: [] }),
          } as Response;
        }
        if (url.startsWith('/api/doctor/booking-engine/calendar?')) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                ok: true,
                view: 'week',
                anchorDate: '2026-07-30',
                timeZone: 'Europe/Moscow',
                events: [],
                filters: { specialists: [], branches: [], rooms: [], services: [] },
                readSource: 'canonical',
                showWorkingHours: true,
                workingBounds: null,
                resolvedScope: {
                  scope: 'specialist',
                  specialistId: OTHER_ID,
                  ownSpecialistId: OWN_ID,
                  canManageAllSpecialists: true,
                  specialists: [],
                },
              }),
          } as Response;
        }
        return {
          ok: true,
          json: async () =>
            url.startsWith('/api/doctor/schedule-kpis?')
              ? { ok: true, kpis: {} }
              : { ok: true, window: null },
        } as Response;
      }),
    );

    render(
      <ScheduleCalendarTab
        deepLinkParams={{
          view: 'weekgrid',
          date: '2026-07-30',
          scope: 'specialist',
          specialist: OTHER_ID,
        }}
        onDeepLinkChange={vi.fn()}
        isActive={false}
        initialTimeZone="Europe/Moscow"
        doctorStatisticsEnabled
        scheduleScopeBootstrap={{
          ownSpecialistId: OWN_ID,
          canManageAllSpecialists: true,
          specialists: [
            { id: OWN_ID, displayLabel: 'Свой специалист' },
            { id: OTHER_ID, displayLabel: 'Другой специалист' },
          ],
        }}
      />,
    );

    const isScopedEndpoint = (url: string) =>
      url.includes('/calendar?') ||
      url.includes('/schedule-kpis?') ||
      url.includes('/nearest-free-window?');
    await waitFor(() => {
      expect(requestedUrls.filter(isScopedEndpoint)).toHaveLength(3);
    });

    for (const url of requestedUrls.filter(isScopedEndpoint)) {
      const parsed = new URL(url, 'https://app.example.test');
      expect(parsed.searchParams.get('scope')).toBe('specialist');
      expect(parsed.searchParams.get('specialistId')).toBe(OTHER_ID);
    }
  });

  it('passes the configured active specialist into a clinic-scoped create form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/doctor/settings') {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              settings: [
                {
                  key: 'booking_calendar_default_specialist_id',
                  valueJson: { value: OTHER_ID },
                },
              ],
            }),
          } as Response;
        }
        if (url.startsWith('/api/doctor/booking-engine/calendar?')) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                ok: true,
                view: 'week',
                anchorDate: '2026-07-30',
                timeZone: 'Europe/Moscow',
                events: [],
                filters: {
                  specialists: [
                    { id: OWN_ID, label: 'Свой специалист' },
                    { id: OTHER_ID, label: 'Другой специалист' },
                  ],
                  branches: [],
                  rooms: [],
                  services: [],
                },
                readSource: 'canonical',
                showWorkingHours: true,
                workingBounds: null,
                resolvedScope: {
                  scope: 'clinic',
                  specialistId: null,
                  ownSpecialistId: OWN_ID,
                  canManageAllSpecialists: true,
                  specialists: [
                    { id: OWN_ID, displayLabel: 'Свой специалист' },
                    { id: OTHER_ID, displayLabel: 'Другой специалист' },
                  ],
                },
              }),
          } as Response;
        }
        return {
          ok: true,
          json: async () =>
            url.startsWith('/api/doctor/schedule-kpis?')
              ? { ok: true, kpis: {} }
              : { ok: true, window: null },
        } as Response;
      }),
    );

    render(
      <ScheduleCalendarTab
        deepLinkParams={{ view: 'weekgrid', date: '2026-07-30', scope: 'clinic' }}
        onDeepLinkChange={vi.fn()}
        isActive={false}
        initialTimeZone="Europe/Moscow"
        doctorStatisticsEnabled
        scheduleScopeBootstrap={{
          ownSpecialistId: OWN_ID,
          canManageAllSpecialists: true,
          specialists: [
            { id: OWN_ID, displayLabel: 'Свой специалист' },
            { id: OTHER_ID, displayLabel: 'Другой специалист' },
          ],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('create-appointment-btn')).toBeEnabled());
    fireEvent.click(screen.getByTestId('create-appointment-btn'));

    const panel = await screen.findByTestId('calendar-event-panel');
    expect(panel).toHaveAttribute('data-default-specialist', OTHER_ID);
    expect(panel).toHaveAttribute('data-active-specialist', '');
  });
});

describe('ScheduleCalendarTab SSR bootstrap and load generation', () => {
  it('does not fetch settings, calendar feed, or KPIs on mount when SSR bootstrap is present', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes('/nearest-free-window?')) {
          return { ok: true, json: async () => ({ ok: true, window: null }) } as Response;
        }
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }),
    );

    render(
      <ScheduleCalendarTab
        deepLinkParams={{ view: 'weekgrid', date: '2026-07-30', scope: 'clinic' }}
        onDeepLinkChange={vi.fn()}
        isActive={false}
        initialTimeZone="Europe/Moscow"
        doctorStatisticsEnabled
        initialData={makeCalendarBootstrap()}
        scheduleScopeBootstrap={{
          ownSpecialistId: OWN_ID,
          canManageAllSpecialists: true,
          specialists: [{ id: OWN_ID, displayLabel: 'Свой специалист' }],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('cal-kpi-row')).toBeInTheDocument());
    expect(requestedUrls.some((url) => url === '/api/doctor/settings')).toBe(false);
    expect(requestedUrls.some((url) => url.includes('/calendar?'))).toBe(false);
    expect(requestedUrls.some((url) => url.includes('/schedule-kpis?'))).toBe(false);
    expect(screen.getByTestId('kpi-recordsInPeriod')).toHaveTextContent('5');
  });

  it('loads immediately when schedule scope changes after SSR bootstrap', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes('/nearest-free-window?')) {
          return { ok: true, json: async () => ({ ok: true, window: null }) } as Response;
        }
        if (url.startsWith('/api/doctor/booking-engine/calendar?')) {
          return calendarJsonResponse({
            ok: true,
            view: 'week',
            anchorDate: '2026-07-30',
            timeZone: 'Europe/Moscow',
            events: [],
            filters: { specialists: [], branches: [], rooms: [], services: [] },
            readSource: 'canonical',
            showWorkingHours: true,
            workingBounds: null,
            resolvedScope: {
              scope: 'specialist',
              specialistId: OWN_ID,
              ownSpecialistId: OWN_ID,
              canManageAllSpecialists: true,
              specialists: [],
            },
          });
        }
        if (url.startsWith('/api/doctor/schedule-kpis?')) {
          return {
            ok: true,
            json: async () => ({ ok: true, kpis: { ...EMPTY_KPIS, recordsInPeriod: 11 } }),
          } as Response;
        }
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }),
    );

    render(
      <ScheduleCalendarTab
        deepLinkParams={{ view: 'weekgrid', date: '2026-07-30', scope: 'clinic' }}
        onDeepLinkChange={vi.fn()}
        isActive={false}
        initialTimeZone="Europe/Moscow"
        doctorStatisticsEnabled
        initialData={makeCalendarBootstrap()}
        scheduleScopeBootstrap={{
          ownSpecialistId: OWN_ID,
          canManageAllSpecialists: true,
          specialists: [{ id: OWN_ID, displayLabel: 'Свой специалист' }],
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('cal-kpi-row')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('schedule-scope-mine'));

    await waitFor(() => {
      expect(
        requestedUrls.filter(
          (url) => url.includes('/calendar?') || url.includes('/schedule-kpis?'),
        ).length,
      ).toBeGreaterThanOrEqual(2);
    });

    const scopedUrls = requestedUrls.filter(
      (url) => url.includes('/calendar?') || url.includes('/schedule-kpis?'),
    );
    for (const url of scopedUrls) {
      const parsed = new URL(url, 'https://app.example.test');
      expect(parsed.searchParams.get('scope')).toBe('mine');
    }
    await waitFor(() => expect(screen.getByTestId('kpi-recordsInPeriod')).toHaveTextContent('11'));
  });

  it('ignores stale feed and KPI responses when a newer load generation finished first', async () => {
    const staleReleases = {
      calendar: () => {},
      kpis: () => {},
    };
    const staleCalendarGate = new Promise<void>((resolve) => {
      staleReleases.calendar = resolve;
    });
    const staleKpisGate = new Promise<void>((resolve) => {
      staleReleases.kpis = resolve;
    });
    let calendarRequestCount = 0;
    let kpiRequestCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/doctor/settings') {
          return { ok: true, json: async () => ({ ok: true, settings: [] }) } as Response;
        }
        if (url.startsWith('/api/doctor/booking-engine/calendar?')) {
          calendarRequestCount += 1;
          if (calendarRequestCount === 1) {
            await staleCalendarGate;
            return calendarJsonResponse({
              ok: false,
              error: 'stale_feed_error',
            });
          }
          return calendarJsonResponse({
            ok: true,
            view: 'week',
            anchorDate: '2026-07-30',
            timeZone: 'Europe/Moscow',
            events: [],
            filters: { specialists: [], branches: [], rooms: [], services: [] },
            readSource: 'canonical',
            showWorkingHours: true,
            workingBounds: null,
            resolvedScope: {
              scope: 'clinic',
              specialistId: null,
              ownSpecialistId: OWN_ID,
              canManageAllSpecialists: true,
              specialists: [],
            },
          });
        }
        if (url.startsWith('/api/doctor/schedule-kpis?')) {
          kpiRequestCount += 1;
          if (kpiRequestCount === 1) {
            await staleKpisGate;
            return {
              ok: true,
              json: async () => ({ ok: true, kpis: { ...EMPTY_KPIS, recordsInPeriod: 1 } }),
            } as Response;
          }
          return {
            ok: true,
            json: async () => ({ ok: true, kpis: { ...EMPTY_KPIS, recordsInPeriod: 42 } }),
          } as Response;
        }
        if (url.includes('/nearest-free-window?')) {
          return { ok: true, json: async () => ({ ok: true, window: null }) } as Response;
        }
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }),
    );

    render(
      <ScheduleCalendarTab
        deepLinkParams={{ view: 'weekgrid', date: '2026-07-30', scope: 'clinic' }}
        onDeepLinkChange={vi.fn()}
        isActive={false}
        initialTimeZone="Europe/Moscow"
        doctorStatisticsEnabled
        scheduleScopeBootstrap={{
          ownSpecialistId: OWN_ID,
          canManageAllSpecialists: true,
          specialists: [{ id: OWN_ID, displayLabel: 'Свой специалист' }],
        }}
      />,
    );

    await waitFor(() => expect(calendarRequestCount).toBe(1));
    fireEvent.click(screen.getByTestId('schedule-scope-mine'));
    await waitFor(() => expect(screen.getByTestId('kpi-recordsInPeriod')).toHaveTextContent('42'));
    expect(screen.queryByTestId('cal-error')).not.toBeInTheDocument();

    staleReleases.calendar();
    staleReleases.kpis();
    await waitFor(() => expect(calendarRequestCount).toBe(2));

    await waitFor(() => {
      expect(screen.getByTestId('kpi-recordsInPeriod')).toHaveTextContent('42');
    });
    expect(screen.queryByTestId('cal-error')).not.toBeInTheDocument();
  });
});
