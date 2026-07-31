import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getOptionalPatientSession: vi.fn(),
  patientRscPersonalDataGate: vi.fn(),
  buildAppDeps: vi.fn(),
  getRememberedPatientOrganizationId: vi.fn(),
  resolvePatientOrganizationRequestContext: vi.fn(),
  withPatientOrganizationPrincipal: vi.fn(),
  resolveDailyWarmupStartPathForPatient: vi.fn(),
  resolvePlanStartLessonPathForPatient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  getOptionalPatientSession: fakes.getOptionalPatientSession,
  patientRscPersonalDataGate: fakes.patientRscPersonalDataGate,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/patient-organization/requestContext', () => ({
  getRememberedPatientOrganizationId: fakes.getRememberedPatientOrganizationId,
  resolvePatientOrganizationRequestContext: fakes.resolvePatientOrganizationRequestContext,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientOrganizationPrincipal: fakes.withPatientOrganizationPrincipal,
}));
vi.mock('../resolvePatientReminderGoTargets', () => ({
  resolveDailyWarmupStartPathForPatient: fakes.resolveDailyWarmupStartPathForPatient,
  resolvePlanStartLessonPathForPatient: fakes.resolvePlanStartLessonPathForPatient,
}));

import PatientGoReminderTargetPage from './page';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function paramsFor(kind: string) {
  return {
    params: Promise.resolve({ kind }),
    searchParams: Promise.resolve({}),
  };
}

describe('GET /app/patient/go/daily-warmup — warmups mechanic gate', () => {
  it('acts like a hidden section when the clinic disabled warmups', async () => {
    fakes.getOptionalPatientSession.mockResolvedValue({ user: { userId } });
    fakes.resolvePatientOrganizationRequestContext.mockResolvedValue({
      ok: true,
      organizationId,
    });
    fakes.buildAppDeps.mockReturnValue({
      patientOrganization: {},
      orgEntitlements: {
        resolveMechanicAccess: async () => ({
          mechanic: 'warmups',
          state: 'disabled',
          policySource: 'system',
          warning: null,
        }),
      },
    });

    await expect(PatientGoReminderTargetPage(paramsFor('daily-warmup'))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(fakes.resolveDailyWarmupStartPathForPatient).not.toHaveBeenCalled();
  });

  it('redirects to the resolved daily-warmup target when warmups is included', async () => {
    fakes.getOptionalPatientSession.mockResolvedValue({ user: { userId } });
    fakes.patientRscPersonalDataGate.mockResolvedValue('allow');
    fakes.resolvePatientOrganizationRequestContext.mockResolvedValue({
      ok: true,
      organizationId,
    });
    fakes.withPatientOrganizationPrincipal.mockImplementation(
      async (_context: unknown, callback: () => Promise<unknown>) => callback(),
    );
    fakes.resolveDailyWarmupStartPathForPatient.mockResolvedValue('/app/patient/content/warmup-1');
    fakes.buildAppDeps.mockReturnValue({
      patientOrganization: {},
      orgEntitlements: {
        resolveMechanicAccess: async () => ({
          mechanic: 'warmups',
          state: 'grace',
          policySource: 'system',
          warning: null,
        }),
      },
    });

    await expect(PatientGoReminderTargetPage(paramsFor('daily-warmup'))).rejects.toThrow(
      'REDIRECT:/app/patient/content/warmup-1',
    );
  });
});
