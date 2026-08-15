import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { DateTime } from 'luxon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoctorTodayDashboard } from './DoctorTodayDashboard';
import type { TodayDashboardData } from './loadDoctorTodayDashboard';

vi.mock('./DoctorTodayLeftKpiRow', () => ({
  DoctorTodayLeftKpiRow: () => null,
}));

vi.mock('./DoctorGlobalTasksSection', () => ({
  DoctorGlobalTasksSection: () => null,
}));

vi.mock('./TodayMiniCalendarWithModal', () => ({
  TodayMiniCalendarWithModal: ({
    calendarSnapshot,
  }: {
    calendarSnapshot: { todayDateLabel: string };
  }) => (
    <p data-testid="today-mini-calendar-label">{calendarSnapshot.todayDateLabel}</p>
  ),
}));

vi.mock('@/shared/ui/doctor/shell/DoctorPageHeader', () => ({
  DoctorPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const emptyDashboardData: TodayDashboardData = {
  todayAppointments: [],
  weekAppointments: [],
  monthAppointments: [],
  unreadConversations: [],
  unreadTotal: 0,
  upcomingAppointments: [],
  peopleListMode: 'recent_visits',
  peopleCount: 0,
  people: [],
  peopleListTruncated: false,
  globalOpenTasks: [],
  globalOpenTasksTotal: 0,
  pendingProgramTests: [],
  pendingProgramTestsTotal: 0,
  pendingProgramTestsTruncated: false,
  exerciseCommentAttentionItems: [],
  exerciseCommentAttentionTotal: 0,
  exerciseCommentAttentionTruncated: false,
};

describe('DoctorTodayDashboard', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('hydrates the mini-calendar heading when server and browser locale casing differ', async () => {
    let rendering: 'server' | 'browser' = 'server';
    vi.spyOn(DateTime.prototype, 'toFormat').mockImplementation((format) => {
      if (format === 'EEE, d MMMM') {
        return rendering === 'server' ? 'Вс, 16 августа' : 'вс, 16 августа';
      }
      return '';
    });

    const dashboard = (
      <DoctorTodayDashboard
        data={emptyDashboardData}
        displayIana="Europe/Moscow"
        calendarSnapshot={{
          todayIso: '2026-08-16',
          nowMinutes: 720,
          todayDateLabel: 'Вс, 16 августа',
        }}
        specialistTasksAvailable={false}
        specialistTasksReadable={false}
      />
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(dashboard);
    expect(container.querySelector('[data-testid="today-mini-calendar-label"]')?.textContent).toBe(
      'Вс, 16 августа',
    );
    document.body.appendChild(container);

    rendering = 'browser';
    const hydrationErrors: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(container, dashboard, {
        onRecoverableError: (error) => hydrationErrors.push(error),
      });
    });

    expect(container.querySelector('[data-testid="today-mini-calendar-label"]')?.textContent).toBe(
      'Вс, 16 августа',
    );
    expect(hydrationErrors).toEqual([]);
  });
});
