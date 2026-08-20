import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DoctorPatientCardShellMeta, DoctorPatientCardTabBootstrap } from '../loadDoctorPatientCardPageBootstrap';

/**
 * Owner correction 2026-08-20: patient-card tabs move from an internal strip inside the identity
 * card into `DoctorPageHeader`'s `tabs` slot, matching Schedule/Analytics/Communications. Each
 * lazy tab panel pulls in a large fetch/dependency tree unrelated to this change, so they are
 * replaced with a trivial stub that renders its own id — the test cares only about which panel is
 * mounted/visible and where the tab controls live, not the panels' own content.
 */
vi.mock('./tabs/PatientTabKarta', () => ({
  PatientTabKarta: () => <div data-testid="panel-karta">karta panel</div>,
}));
vi.mock('./tabs/PatientTabOverview', () => ({ PatientTabOverview: () => null }));
vi.mock('./tabs/PatientTabRecords', () => ({ PatientTabRecords: () => null }));
vi.mock('./tabs/PatientTabFinances', () => ({ PatientTabFinances: () => null }));
vi.mock('./tabs/PatientTabComms', () => ({ PatientTabComms: () => null }));
vi.mock('./tabs/PatientTabProgram', () => ({
  PatientTabProgram: () => <div data-testid="panel-program">program panel</div>,
}));
vi.mock('./tabs/PatientTabFiles', () => ({
  PatientTabFiles: () => <div data-testid="panel-files">files panel</div>,
}));
vi.mock('./tabs/PatientTabAccount', () => ({
  PatientTabAccount: () => <div data-testid="panel-account">account panel</div>,
}));

const { PatientCardClient } = await import('./PatientCardClient');

/**
 * `PatientCardTabPanels` reads its bootstrap via React 19's `use()`. A freshly-created
 * `Promise.resolve(...)` still suspends the tree on first read (its `.then()` callback only fires
 * on a later microtask/scheduler tick), which this jsdom+RTL setup does not reliably flush before
 * `findBy*` gives up — a pre-existing environment gap, not something to work around by adding a
 * real network/timer wait for every test. A promise `use()` recognizes as already-`fulfilled`
 * (the same shape React's own cache()/Next.js data helpers produce) is read synchronously instead,
 * so tests only exercise this component's own logic, not that scheduler gap.
 */
function fulfilledThenable<T>(value: T): Promise<T> {
  return { status: 'fulfilled', value, then() {} } as unknown as Promise<T>;
}

const patientId = '11111111-1111-4111-8111-111111111111';
const patientListHref = '/app/doctor/patients?segment=on_support';

const shellMeta: DoctorPatientCardShellMeta = {
  activeTab: 'karta',
  membershipMutationAllowed: true,
  membershipsVisible: true,
  specialistTasksAvailable: true,
  specialistTasksReadable: true,
  cardHeader: {
    identity: {
      userId: patientId,
      displayName: 'Иванова Мария',
      firstName: 'Мария',
      lastName: 'Иванова',
      patronymic: null,
      phone: null,
      email: null,
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
    totalVisits: 0,
    cancellationsCount: 0,
    reschedulesCount: 0,
    firstVisitDate: null,
  },
};

const tabBootstrap: DoctorPatientCardTabBootstrap = {
  initialClinicalState: null,
  initialVisits: null,
  initialNotes: null,
  initialTasks: null,
  initialProgramActivity: null,
  initialAppointments: null,
  initialProgramInstances: null,
  initialFiles: null,
  initialAnamnesis: null,
  initialComorbidities: null,
  initialFinancesData: null,
  initialSupplementaryContacts: null,
  initialPackages: null,
  initialProgramInstanceDetail: null,
  initialExerciseCalendarSnapshot: null,
  initialMessagesSnapshot: null,
  initialPaymentsSummary: null,
  initialSupportEffectivePolicy: null,
  initialPortalState: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('patient card — final tabs live in DoctorPageHeader', () => {
  it('renders exactly four product tabs inside the page header', async () => {
    render(
      <PatientCardClient
        shellMeta={shellMeta}
        tabPromise={fulfilledThenable(tabBootstrap)}
        initialTab="karta"
        patientListHref={patientListHref}
      />,
    );

    await screen.findByTestId('panel-karta');

    const header = document.querySelector('[data-doctor-page-header]');
    expect(header).toBeInTheDocument();

    const tabsSlot = header!.querySelector('[data-doctor-page-header-tabs]');
    expect(tabsSlot).toBeInTheDocument();
    expect(tabsSlot!.querySelector('nav#doctor-patient-card-tabs')).toBeInTheDocument();

    const accountButtons = screen.getAllByRole('button', { name: 'Учётка' });
    expect(accountButtons).toHaveLength(1);
    expect(tabsSlot!.contains(accountButtons[0]!)).toBe(true);
    expect(tabsSlot!.querySelectorAll('#doctor-patient-card-tabs button')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Обзор' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Визиты' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Коммуникации' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Финансы' })).not.toBeInTheDocument();

    // The «К клиентам» back link lives in the same header, not floating elsewhere.
    const backLink = screen.getByRole('link', { name: 'К клиентам' });
    expect(header!.contains(backLink)).toBe(true);
    expect(backLink).toHaveAttribute('href', patientListHref);
  });

  it('switching tabs from the header changes the visible panel and keeps prior tabs mounted (deep-link state)', async () => {
    render(
      <PatientCardClient
        shellMeta={shellMeta}
        tabPromise={fulfilledThenable(tabBootstrap)}
        initialTab="overview"
        patientListHref={patientListHref}
      />,
    );

    await screen.findByTestId('panel-karta');
    expect(screen.queryByTestId('panel-program')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Программа' }));

    const programPanel = await screen.findByTestId('panel-program');
    expect(programPanel.closest('[hidden], .hidden')).toBeNull();
    // Card stays mounted (hidden), matching the load-once/keepMounted contract — switching
    // tabs must not drop state a doctor already entered on a previously visited tab.
    const kartaPanel = screen.getByTestId('panel-karta');
    expect(kartaPanel.closest('.hidden')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Карточка' }));

    await waitFor(() => {
      expect(screen.getByTestId('panel-karta').closest('.hidden')).toBeNull();
    });
    // Program is still in the DOM, just hidden — its internal state was not thrown away.
    expect(screen.getByTestId('panel-program').closest('.hidden')).not.toBeNull();
  });

  it('opens legacy direct links in the consolidated card tab', async () => {
    render(
      <PatientCardClient
        shellMeta={shellMeta}
        tabPromise={fulfilledThenable(tabBootstrap)}
        initialTab="records"
        patientListHref={patientListHref}
      />,
    );

    const kartaPanel = await screen.findByTestId('panel-karta');
    expect(kartaPanel.closest('.hidden')).toBeNull();
    expect(screen.queryByTestId('panel-program')).not.toBeInTheDocument();
  });
});
