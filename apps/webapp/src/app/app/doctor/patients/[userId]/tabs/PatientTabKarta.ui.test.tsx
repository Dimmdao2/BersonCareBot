import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientCardHeader } from '@/modules/doctor-clients/ports';
import type { ClinicalState, AnamnesisState, Visit } from '@/modules/patient-clinical/ports';

/**
 * The karta tab no longer owns the encounter summary/start controls. It still resolves
 * PatientTabRecords' external `composition.selectedAppointmentId` into one visit view. A
 * plausible break here is silent: the wrong encounter's notes render under the right
 * date, or closing the externally-opened view leaves the parent's selection stuck (the
 * "Открыть заметки" entry point from Записи would then never work again without a page
 * reload). PatientClinicalSections (owned by a sibling P4.1-P4.3 workstream) is mocked
 * out — it is not part of this scope and its own network calls are irrelevant here.
 */
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
// ENCOUNTERS-02 allows several primary encounters. Audit fault injection showed that with
// one primary + one repeat both counters read 1, so swapping the two derivations stayed
// green — the asymmetric 2/1 fixture is what makes that mix-up observable.
const visitC = makeVisit({
  id: 'visit-c',
  canonicalAppointmentId: null,
  date: '20.08.2026',
  type: 'first',
  sections: [{ title: 'Осмотр', body: 'Осмотр-В-текст' }],
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
      initialVisits={[visitA, visitB, visitC]}
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

describe('PatientTabKarta — encounter details without a local summary block', () => {
  it('does not render the removed encounter summary and actions', () => {
    renderKarta();
    expect(screen.queryByText('Приёмы: 3')).toBeNull();
    expect(screen.queryByText('История приёмов')).toBeNull();
    expect(screen.queryByText('Новый приём')).toBeNull();
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
});
