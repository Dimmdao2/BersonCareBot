import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  createDoctorClient: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
// Only the entitlement DECISION is faked; the product sentence stays the real one, so the
// assertion below cannot pass against a message this test invented.
vi.mock('@/app-layer/guards/requireEntitlement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app-layer/guards/requireEntitlement')>()),
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: string, work: () => Promise<unknown>) =>
    work(),
}));
vi.mock('@/app-layer/doctor/createDoctorClient', () => ({
  createDoctorClient: fakes.createDoctorClient,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ patientOrganization: {}, emailSetupAccess: {} }),
}));

import { POST } from './route';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

function request() {
  return new Request('http://test/api/doctor/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lastName: 'Иванов', firstName: 'Иван', phone: '+79990000000' }),
  });
}

describe('doctor client create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        specialistId: 'spec-1',
        session: { user: { userId: 'user-1' } },
      },
    });
    fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
  });

  /**
   * Owner live pass 18.08, L-1. «Пациенты» is a limit-bearing mechanic, so after the ruling its
   * only refusal is the tariff ceiling — and it must reach the screen as a sentence naming that
   * limit. Breakage this pins: the doctor is shown `patient_count_limit_reached` instead.
   */
  it('explains a refused patient in words when the tariff number is used up', async () => {
    fakes.createDoctorClient.mockResolvedValue({
      ok: false,
      error: 'patient_count_limit_reached',
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'patient_count_limit_reached',
      mechanic: 'patient_count',
      message:
        'Невозможно создать пациента: в тарифе клиники исчерпан лимит «Пациенты». ' +
        'Чтобы продолжить, увеличьте лимит в тарифе клиники.',
    });
  });

  // The permissive half: nothing about the tariff stands between a doctor and a created patient
  // once the entitlement decision passed.
  it('creates the patient when the tariff allows it', async () => {
    fakes.createDoctorClient.mockResolvedValue({
      ok: true,
      userId: 'patient-1',
      displayName: 'Иванов Иван',
      firstName: 'Иван',
      lastName: 'Иванов',
      patronymic: null,
      phoneNormalized: '+79990000000',
      created: true,
      emailSetupEnqueued: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      client: { id: 'patient-1' },
      created: true,
    });
  });
});
