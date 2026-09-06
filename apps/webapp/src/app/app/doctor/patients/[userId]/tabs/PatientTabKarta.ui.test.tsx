import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientCardHeader } from '@/modules/doctor-clients/ports';
import type { ClinicalState, AnamnesisState, Visit } from '@/modules/patient-clinical/ports';

/**
 * ENCOUNTERS-01..05 wiring. This tab computes N/previous-visit from real visit data and
 * merges two distinct "which encounter is open" sources (its own summary/history clicks
 * and PatientTabRecords' external `composition.selectedAppointmentId`) into one view. A
 * plausible break here is silent: the wrong encounter's notes render under the right
 * date, or closing the externally-opened view leaves the parent's selection stuck (the
 * "Открыть заметки" entry point from Записи would then never work again without a page
 * reload). PatientClinicalSections (owned by a sibling P4.1-P4.3 workstream) is mocked
 * out — it is not part of this scope and its own network calls are irrelevant here.
 */
const routerReplace = vi.fn();
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}));

vi.mock('./karta/PatientClinicalSections', () => ({
  PatientClinicalSections: () => <div data-testid="clinical-sections" />,
}));

const { PatientTabKarta } = await import('./PatientTabKarta');

const userId = '11111111-1111-4111-8111-111111111111';

const header: PatientCardHeader = {
  identity: {
    userId,
    displayName: 'Иванова Мария',
    firstName: 'Мария',
    lastName: 'Иванова',
    patronymic: null,
    phone: '+79990000000',
    email: null,
    emailVerifiedAt: null,
    telegramUsername: null,
    maxUsername: null,
    bindings: {},
    hasConversation: false,
    isArchived: false,
    isBlocked: false,
    birthDate: null,
    age: null,
    gender: null,
  },
  support: { isOnSupport: false, startedAt: null, supportMonthsApprox: null },
  lastVisit: null,
  nextAppointment: null,
  totalVisits: 2,
  cancellationsCount: 0,
  reschedulesCount: 0,
  firstVisitDate: null,
};

function makeVisit(overrides: Partial<Visit> & Pick<Visit, 'id'>): Visit {
  return {
    canonicalAppointmentId: null,
    date: '01.01.2026',
    time: '10:00',
    type: 'first',
    location: 'Филиал',
    duration: '',
    anamnesisText: null,
    sections: [],
    ...overrides,
  };
}

// listVisits() orders newest-first — visitA is the "previous encounter", visitB is older.
const visitA = makeVisit({
  id: 'visit-a',
  canonicalAppointmentId: 'appt-a',
  date: '05.09.2026',
  type: 'first',
  sections: [{ title: 'Осмотр', body: 'Осмотр-А-текст' }],
});
const visitB = makeVisit({
  id: 'visit-b',
  canonicalAppointmentId: null,
  date: '01.09.2026',
  type: 'repeat',
  sections: [{ title: 'Осмотр', body: 'Осмотр-Б-текст' }],
});

const emptyClinical: ClinicalState = {
  complaints: [],
  complaintHistory: [],
  diagnoses: [],
  diagnosisHistory: [],
};
const emptyAnamnesis: AnamnesisState = { trauma: [], illness: [], lifestyle: [] };

function renderKarta(props: Partial<React.ComponentProps<typeof PatientTabKarta>> = {}) {
  return render(
    <PatientTabKarta
      userId={userId}
      header={header}
      initialClinicalState={emptyClinical}
      initialVisits={[visitA, visitB]}
      initialAnamnesis={emptyAnamnesis}
      initialComorbidities={[]}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe('PatientTabKarta — encounter summary/history (ENCOUNTERS-01..05)', () => {
  it('summary counts real visits (not appointments) and names the previous encounter', () => {
    renderKarta();
    expect(screen.getByText('Приёмы: 2')).toBeTruthy();
    expect(
      screen.getByText((_, node) => node?.tagName === 'SPAN' && node.textContent === 'Первичных: 1'),
    ).toBeTruthy();
    expect(
      screen.getByText((_, node) => node?.tagName === 'SPAN' && node.textContent === 'Повторных: 1'),
    ).toBeTruthy();
    // visits[0] (newest) is the previous encounter, not visits[1].
    expect(screen.getByText('Предыдущий приём: 05.09.2026')).toBeTruthy();
  });

  it('the previous-visit link opens the newest visit, never the older one', () => {
    renderKarta();
    fireEvent.click(screen.getByText('Предыдущий приём: 05.09.2026'));
    expect(screen.getByText('Осмотр-А-текст')).toBeTruthy();
    expect(screen.queryByText('Осмотр-Б-текст')).toBeNull();
    expect(screen.getByRole('link', { name: 'Изменить' }).getAttribute('href')).toBe(
      `/app/doctor/patients/${userId}/visits/visit-a/edit`,
    );
  });

  it('a history-modal row opens that exact visit, replacing whatever was shown before', () => {
    renderKarta();
    fireEvent.click(screen.getByText('Предыдущий приём: 05.09.2026'));
    expect(screen.getByText('Осмотр-А-текст')).toBeTruthy();

    fireEvent.click(screen.getByText('История приёмов'));
    const olderRow = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.includes('01.09.2026'));
    expect(olderRow).toBeTruthy();
    fireEvent.click(olderRow!);

    expect(screen.getByText('Осмотр-Б-текст')).toBeTruthy();
    expect(screen.queryByText('Осмотр-А-текст')).toBeNull();
  });

  it('opening a visit via composition.selectedAppointmentId routes close back to the caller', () => {
    const onCloseSelectedVisit = vi.fn();
    renderKarta({
      composition: {
        leftContent: null,
        rightContent: null,
        selectedAppointmentId: 'appt-a',
        onCloseSelectedVisit,
        mobilePane: 'detail',
        onMobilePaneChange: () => {},
      },
    });

    // Opened directly from PatientTabRecords — no click needed on this tab.
    expect(screen.getByText('Осмотр-А-текст')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCloseSelectedVisit).toHaveBeenCalledTimes(1);
  });

  it('pendingAppointmentId redirects to the full-page editor instead of opening an inline panel', () => {
    const onPendingConsumed = vi.fn();
    renderKarta({ pendingAppointmentId: 'appt-a', onPendingConsumed });

    expect(routerReplace).toHaveBeenCalledWith(
      `/app/doctor/patients/${userId}/visits/new?appointmentId=appt-a`,
    );
    expect(onPendingConsumed).toHaveBeenCalledTimes(1);
    expect(routerPush).not.toHaveBeenCalled();
  });
});
