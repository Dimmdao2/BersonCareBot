import { describe, expect, it } from 'vitest';

import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { createInMemoryOrgEntitlementsPort } from '@/infra/repos/inMemoryOrgEntitlements';
import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import {
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
  defaultDoctorWorkspaceComposition,
} from '@/modules/system-settings/doctorWorkspaceComposition';
import { createSystemSettingsService } from '@/modules/system-settings/service';
import {
  requirePatientWorkspaceModuleForApi,
  resolveDoctorWorkspaceModules,
  resolveOrganizationWorkspaceModules,
  workspaceModuleForApiPath,
} from './workspaceModuleAccess';

const ORGANIZATION_A_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_B_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_A_ID = '33333333-3333-4333-8333-333333333333';
const PATIENT_B_ID = '44444444-4444-4444-8444-444444444444';

function patientTariffGateDeps() {
  const systemSettings = createSystemSettingsService(createInMemorySystemSettingsPort());
  const orgEntitlements = createInMemoryOrgEntitlementsPort();
  orgEntitlements.resolveMechanicAccess = async (organizationId, mechanic) => ({
    mechanic,
    state: organizationId === ORGANIZATION_A_ID ? 'disabled' : 'full_access',
    policySource: 'system',
    warning: null,
  });
  const patientOrganization = {
    resolveActiveOrganizationForPatient: async (patientUserId: string) => ({
      ok: true as const,
      organizationId: patientUserId === PATIENT_A_ID ? ORGANIZATION_A_ID : ORGANIZATION_B_ID,
    }),
  } as unknown as NonNullable<
    Parameters<typeof requirePatientWorkspaceModuleForApi>[0]['patientOrganization']
  >;
  const doctorClients = {
    getClientChannelPolicy: async () => ({
      portalAllowed: true,
      directChatAllowed: true,
      commentsAllowed: true,
      mediaAllowed: true,
    }),
  } as unknown as Parameters<typeof requirePatientWorkspaceModuleForApi>[0]['doctorClients'];
  return {
    patientOrganization,
    systemSettings,
    doctorClients,
    orgEntitlements,
  } satisfies Pick<
    ReturnType<typeof buildAppDeps>,
    'patientOrganization' | 'systemSettings' | 'doctorClients' | 'orgEntitlements'
  >;
}

describe('C3M-08 rehabilitation API closure', () => {
  it.each([
    ['/api/doctor/messages', 'direct_chat'],
    ['/api/doctor/messages/conversations/ensure', 'direct_chat'],
    ['/api/doctor/messages/conversations/unread-by-patient', 'direct_chat'],
    ['/api/doctor/messages/unread-count', 'direct_chat'],
    ['/api/doctor/messages/conversation-17/read', 'direct_chat'],
    ['/api/patient/messages', 'direct_chat'],
    ['/api/patient/messages/conversation-17/read', 'direct_chat'],
    ['/api/doctor/patients/patient-17/messages-snapshot', 'direct_chat'],
    ['/api/patient/treatment-program-instances/current', 'rehabilitation'],
    ['/api/patient/treatment-program-promo/current', 'rehabilitation'],
    ['/api/patient/courses/active', 'rehabilitation'],
    ['/api/patient/diary/lfk-stats', 'rehabilitation'],
    ['/api/doctor/clinical-tests', 'rehabilitation'],
    ['/api/doctor/recommendations', 'rehabilitation'],
    ['/api/doctor/references', 'rehabilitation'],
    ['/api/doctor/test-sets', 'rehabilitation'],
    ['/api/doctor/treatment-program-templates', 'rehabilitation'],
    ['/api/doctor/patients/patient-17/exercise-calendar', 'rehabilitation'],
    ['/api/doctor/clients/patient-17/lfk-complex-exercises', 'rehabilitation'],
    ['/api/doctor/patients/patient-17/program-day-activity', 'rehabilitation'],
    ['/api/doctor/patients/patient-17/treatment-program-instances', 'rehabilitation'],
    ['/api/patient/treatment-program-instances/program-17/discussion', 'program_comments'],
    [
      '/api/patient/treatment-program-instances/program-17/items/item-2/discussion/media',
      'program_media',
    ],
    ['/api/patient/media/program-submission/presign', 'program_media'],
    ['/api/doctor/comments', 'program_comments'],
    ['/api/doctor/exercise-comments', 'program_comments'],
    ['/api/doctor/patients/patient-17/program-activity', 'program_comments'],
    [
      '/api/doctor/treatment-program-instances/program-17/items/item-2/program-note-reply',
      'program_comments',
    ],
    ['/api/doctor/treatment-program-instances/program-17/media-presign', 'program_media'],
  ] as const)('classifies %s under %s', (pathname, module) => {
    expect(workspaceModuleForApiPath(pathname)).toBe(module);
  });

  it.each([
    '/api/doctor/notes',
    '/api/doctor/tasks',
    '/api/doctor/appointments',
    '/api/doctor/patients/patient-17/medical-record',
    '/api/doctor/visits',
    '/api/patient/appointments',
  ])('does not expand rehabilitation denial to independent surface %s', (pathname) => {
    expect(workspaceModuleForApiPath(pathname)).toBeNull();
  });

  it('keeps organization preferences isolated and restores stored child choices after OFF to ON', async () => {
    const port = createInMemorySystemSettingsPort();
    const systemSettings = createSystemSettingsService(port);
    const defaults = defaultDoctorWorkspaceComposition();
    await port.upsert(
      DOCTOR_WORKSPACE_COMPOSITION_KEY,
      'doctor',
      {
        value: {
          ...defaults,
          modules: {
            ...defaults.modules,
            rehabilitation: false,
            program_comments: true,
            program_media: true,
          },
        },
      },
      'c3m-08-audit',
      { organizationId: 'organization-a' },
    );
    await port.upsert(
      DOCTOR_WORKSPACE_COMPOSITION_KEY,
      'doctor',
      { value: defaults },
      'c3m-08-audit',
      { organizationId: 'organization-b' },
    );

    // Тариф здесь ни при чём: случай проверяет хранимые предпочтения композиции, поэтому механика
    // намеренно включена у обеих организаций — сужение по тарифу проверяют соседние случаи.
    const orgEntitlements = createInMemoryOrgEntitlementsPort();
    orgEntitlements.resolveMechanicAccess = async (_organizationId, mechanic) => ({
      mechanic,
      state: 'full_access',
      policySource: 'system',
      warning: null,
    });
    const deps = { systemSettings, orgEntitlements };

    const organizationAOff = await resolveOrganizationWorkspaceModules(deps, 'organization-a');
    const organizationB = await resolveOrganizationWorkspaceModules(deps, 'organization-b');

    expect(organizationAOff).toMatchObject({
      rehabilitation: false,
      program_comments: false,
      program_media: false,
    });
    expect(organizationB).toMatchObject({
      rehabilitation: true,
      program_comments: true,
      program_media: true,
    });

    await port.upsert(
      DOCTOR_WORKSPACE_COMPOSITION_KEY,
      'doctor',
      { value: defaults },
      'c3m-08-audit',
      { organizationId: 'organization-a' },
    );

    await expect(
      resolveOrganizationWorkspaceModules(deps, 'organization-a'),
    ).resolves.toMatchObject({
      rehabilitation: true,
      program_comments: true,
      program_media: true,
    });
  });

  it('refuses the patient rehabilitation API when the organization exercise catalog is disabled', async () => {
    const gate = await requirePatientWorkspaceModuleForApi(
      patientTariffGateDeps(),
      PATIENT_A_ID,
      'rehabilitation',
    );

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('does not leak organization A exercise-catalog override into organization B', async () => {
    const orgEntitlements = createInMemoryOrgEntitlementsPort();
    orgEntitlements.resolveMechanicAccess = async (organizationId, mechanic) => ({
      mechanic,
      state:
        mechanic === 'exercise_catalog' && organizationId === ORGANIZATION_A_ID
          ? 'disabled'
          : 'full_access',
      policySource: 'system',
      warning: null,
    });
    const deps = {
      orgEntitlements,
      systemSettings: createSystemSettingsService(createInMemorySystemSettingsPort()),
    };
    const workspace = (organizationId: string) =>
      ({ organizationId, canAccessClinicalWorkspace: true }) as Parameters<
        typeof resolveDoctorWorkspaceModules
      >[1];

    const organizationA = await resolveDoctorWorkspaceModules(deps, workspace(ORGANIZATION_A_ID));
    const organizationB = await resolveDoctorWorkspaceModules(deps, workspace(ORGANIZATION_B_ID));

    expect({
      organizationA: organizationA.rehabilitation,
      organizationB: organizationB.rehabilitation,
    }).toEqual({ organizationA: false, organizationB: true });
  });
});
