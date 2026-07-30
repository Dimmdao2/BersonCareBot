import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ScheduleCalendarTab scope requests', () => {
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
