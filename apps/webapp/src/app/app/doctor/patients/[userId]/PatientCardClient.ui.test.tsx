import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type {
  DoctorPatientCardShellMeta,
  DoctorPatientCardTabBootstrap,
} from '../loadDoctorPatientCardPageBootstrap';

/**
 * Owner correction 2026-08-20: patient-card tabs move from an internal strip inside the identity
 * card into `DoctorPageHeader`'s `tabs` slot, matching Schedule/Analytics/Communications. Each
 * lazy tab panel pulls in a large fetch/dependency tree unrelated to this change, so they are
 * replaced with a trivial stub that renders its own id — the test cares only about which panel is
 * mounted/visible and where the tab controls live, not the panels' own content.
 */
vi.mock('./tabs/PatientTabKarta', () => ({
  PatientTabKarta: ({
    composition,
  }: {
    composition?: {
      leftContent: ReactNode;
      rightContent: ReactNode;
      selectedAppointmentId: string | null;
    };
  }) => (
    <div data-testid="panel-karta">
      karta panel
      {composition?.leftContent}
      {composition?.selectedAppointmentId ? (
        <div data-testid="selected-visit-detail">{composition.selectedAppointmentId}</div>
      ) : (
        composition?.rightContent
      )}
    </div>
  ),
}));
vi.mock('./tabs/PatientTabOverview', () => ({
  PatientTabOverview: ({ onTabSwitch }: { onTabSwitch?: (tabId: string) => void }) => (
    <button type="button" onClick={() => onTabSwitch?.('comms')}>
      вся переписка
    </button>
  ),
}));
vi.mock('./tabs/PatientTabRecords', () => ({
  PatientTabRecords: ({
    onOpenVisitNotes,
    onOpenMembershipConfiguration,
  }: {
    onOpenVisitNotes?: (appointmentId: string) => void;
    onOpenMembershipConfiguration?: () => void;
  }) => (
    <div data-testid="card-master-pane">
      <button type="button" onClick={() => onOpenVisitNotes?.('appointment-1')}>
        Открыть заметки
      </button>
      <button type="button" onClick={onOpenMembershipConfiguration}>
        Добавить абонемент
      </button>
    </div>
  ),
}));
vi.mock('./tabs/PatientTabFinances', () => ({ PatientTabFinances: () => null }));
vi.mock('./tabs/PatientTabProgram', () => ({
  PatientTabProgram: () => <div data-testid="panel-program">program panel</div>,
}));
vi.mock('./tabs/PatientTabFiles', () => ({
  PatientTabFiles: () => <div data-testid="panel-files">files panel</div>,
}));
vi.mock('./tabs/PatientTabAccount', () => ({
  PatientTabAccount: () => <div data-testid="panel-account">account panel</div>,
}));
vi.mock('@/app/app/doctor/clients/DoctorClientMembershipsPanel', () => ({
  DoctorClientMembershipsPanel: () => <div data-testid="membership-configuration">config</div>,
}));
vi.mock('./PatientEncounterStartModal', () => ({
  PatientEncounterStartModal: ({
    open,
    initialAppointmentId,
  }: {
    open: boolean;
    initialAppointmentId: string | null;
  }) =>
    open ? (
      <div data-testid="encounter-start-modal">{initialAppointmentId ?? 'no-prebound'}</div>
    ) : null,
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
  currentProgramStartedAt: null,
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
  it('switching tabs from the header changes the visible panel and keeps prior tabs mounted (deep-link state)', async () => {
    render(
      <PatientCardClient
        shellMeta={shellMeta}
        tabPromise={fulfilledThenable(tabBootstrap)}
        initialTab="karta"
        patientListHref={patientListHref}
      />,
    );

    await screen.findByTestId('panel-karta');
    expect(screen.queryByTestId('panel-program')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ЛФК' }));

    const programPanel = await screen.findByTestId('panel-program');
    expect(programPanel.closest('[hidden], .hidden')).toBeNull();
    // Card stays mounted (hidden), matching the load-once/keepMounted contract — switching
    // tabs must not drop state a doctor already entered on a previously visited tab.
    const kartaPanel = screen.getByTestId('panel-karta');
    expect(kartaPanel.closest('.hidden')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Карта' }));

    await waitFor(() => {
      expect(screen.getByTestId('panel-karta').closest('.hidden')).toBeNull();
    });
    // Program is still in the DOM, just hidden — its internal state was not thrown away.
    expect(screen.getByTestId('panel-program').closest('.hidden')).not.toBeNull();
  });
});

/**
 * `ENCOUNTER-START-01` — «Любое действие `Начать приём` сначала открывает общую doctor-модалку, а не
 * сразу переводит на страницу приёма» (owner checklist §P4.6).
 */
describe('patient card — every encounter start goes through the common modal', () => {
  /**
   * Failure caught: the header action navigates straight to `/visits/new` (or does nothing), so the
   * doctor never gets to choose how the encounter links to a calendar record and every encounter is
   * created unlinked. Oracle: owner `ENCOUNTER-START-01` and `ENCOUNTERS-ACTION-03/04`.
   */
  it('opens the start modal from the identity header instead of navigating, on a non-overview tab', async () => {
    render(
      <PatientCardClient
        shellMeta={shellMeta}
        tabPromise={fulfilledThenable(tabBootstrap)}
        initialTab="program"
        patientListHref={patientListHref}
      />,
    );

    await screen.findByTestId('panel-program');
    expect(screen.queryByTestId('encounter-start-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Начать приём' }));

    expect(await screen.findByTestId('encounter-start-modal')).toHaveTextContent('no-prebound');
  });

  /**
   * Failure caught: entering from appointment details («Начать приём» in the calendar/next-record
   * panel) lands on the patient card with nothing open — the click reads as a no-op — or opens the
   * modal without the trusted appointment, so the encounter is linked to the wrong record.
   * Oracle: owner `ENCOUNTER-LINK-01` («эта запись передана в модалку как доверенный
   * prebound-контекст и выбрана заранее»).
   */
  it('opens the start modal prebound with the appointment the doctor came from', async () => {
    render(
      <PatientCardClient
        shellMeta={shellMeta}
        tabPromise={fulfilledThenable(tabBootstrap)}
        initialTab="karta"
        createVisitFrom="dddddddd-0000-4000-8000-000000000004"
        patientListHref={patientListHref}
      />,
    );

    expect(await screen.findByTestId('encounter-start-modal')).toHaveTextContent(
      'dddddddd-0000-4000-8000-000000000004',
    );
  });
});
