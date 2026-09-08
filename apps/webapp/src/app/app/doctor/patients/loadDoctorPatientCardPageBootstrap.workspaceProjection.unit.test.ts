import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';

const fakes = vi.hoisted(() => ({
  getMechanicSurfaceVisibility: vi.fn(),
  getMechanicMutationAvailability: vi.fn(),
  requireEntitlementForReadAction: vi.fn(),
}));

vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (_workspace: unknown, operation: () => unknown) => operation(),
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  getMechanicSurfaceVisibility: fakes.getMechanicSurfaceVisibility,
  getMechanicMutationAvailability: fakes.getMechanicMutationAvailability,
  requireEntitlementForReadAction: fakes.requireEntitlementForReadAction,
}));

import { loadDoctorPatientCardTabBootstrap } from './loadDoctorPatientCardPageBootstrap';

const ALL_MODULES_OFF = {
  medical_record: false,
  encounters: false,
  rehabilitation: false,
  direct_chat: false,
  program_comments: false,
  program_media: false,
  mailings: false,
  analytics: false,
  client_portal: false,
  video_meetings: false,
} satisfies WorkspaceModuleEffective;

type BootstrapDeps = Parameters<typeof loadDoctorPatientCardTabBootstrap>[0];
type Workspace = Parameters<typeof loadDoctorPatientCardTabBootstrap>[1];

function makeFixture() {
  const calls = {
    clinicalState: vi.fn().mockResolvedValue({ complaints: [] }),
    visits: vi.fn().mockResolvedValue([]),
    anamnesis: vi.fn().mockResolvedValue(null),
    comorbidities: vi.fn().mockResolvedValue([]),
    notes: vi.fn().mockResolvedValue([]),
    tasks: vi.fn().mockResolvedValue([]),
    appointments: vi.fn().mockResolvedValue([]),
  };
  const deps = {
    patientClinical: {
      getClinicalState: calls.clinicalState,
      listVisits: calls.visits,
      getAnamnesis: calls.anamnesis,
    },
    patientComorbidities: { listActive: calls.comorbidities },
    doctorNotes: { listForUser: calls.notes },
    specialistTasks: { listPatientTasks: calls.tasks },
    doctorClientsPort: { listPatientAppointments: calls.appointments },
    treatmentProgramInstance: {
      listForPatientClinicalView: vi.fn().mockResolvedValue([]),
      getInstanceById: vi.fn().mockResolvedValue(null),
    },
    programItemDiscussion: {},
    patientCalendarTimezone: { getIanaForUser: vi.fn().mockResolvedValue('Europe/Moscow') },
  } as unknown as BootstrapDeps;
  const workspace = {
    organizationId: '11111111-1111-4111-8111-111111111111',
    session: { user: { userId: 'doctor-1' } },
  } as unknown as Workspace;
  return { calls, deps, workspace };
}

describe('patient-card hidden-module bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getMechanicSurfaceVisibility.mockResolvedValue({ specialistNavigation: false });
    fakes.getMechanicMutationAvailability.mockResolvedValue({ available: false });
    fakes.requireEntitlementForReadAction.mockResolvedValue({ ok: true });
  });

  it('keeps always-on Overview data without reading disabled medical or encounter data', async () => {
    const { calls, deps, workspace } = makeFixture();

    await loadDoctorPatientCardTabBootstrap(
      deps,
      workspace,
      '22222222-2222-4222-8222-222222222222',
      'overview',
      Promise.resolve([]),
      ALL_MODULES_OFF,
    );

    expect(calls.clinicalState).not.toHaveBeenCalled();
    expect(calls.visits).not.toHaveBeenCalled();
    expect(calls.notes).toHaveBeenCalledOnce();
    expect(calls.tasks).toHaveBeenCalledOnce();
    expect(calls.appointments).toHaveBeenCalledOnce();
    expect(calls.appointments).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      { includeEncounterData: false },
    );
  });

  it.each([
    {
      modules: { ...ALL_MODULES_OFF },
      medicalCalls: false,
      encounterCalls: false,
    },
    {
      modules: { ...ALL_MODULES_OFF, encounters: true },
      medicalCalls: false,
      encounterCalls: true,
    },
    {
      modules: { ...ALL_MODULES_OFF, medical_record: true },
      medicalCalls: true,
      encounterCalls: false,
    },
    {
      modules: { ...ALL_MODULES_OFF, medical_record: true, encounters: true },
      medicalCalls: true,
      encounterCalls: true,
    },
  ])('loads only the effective half of the combined Karte surface: %o', async (scenario) => {
    const { calls, deps, workspace } = makeFixture();

    await loadDoctorPatientCardTabBootstrap(
      deps,
      workspace,
      '22222222-2222-4222-8222-222222222222',
      'karta',
      Promise.resolve([]),
      scenario.modules,
    );

    expect(calls.clinicalState.mock.calls.length > 0).toBe(scenario.medicalCalls);
    expect(calls.anamnesis.mock.calls.length > 0).toBe(scenario.medicalCalls);
    expect(calls.comorbidities.mock.calls.length > 0).toBe(scenario.medicalCalls);
    expect(calls.visits.mock.calls.length > 0).toBe(scenario.encounterCalls);
  });
});
