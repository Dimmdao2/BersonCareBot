import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  resolvePatientEnrollmentOrganizationId: vi.fn(),
  withPatientOrganizationPrincipal: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  entitlementMutationRefusalResponse: vi.fn(),
  advanceDailyWarmupPresentationManually: vi.fn(),
  buildDailyWarmupPresentationSyncDeps: vi.fn(),
  revalidatePath: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: fakes.revalidatePath }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: fakes.resolvePatientEnrollmentOrganizationId,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientOrganizationPrincipal: fakes.withPatientOrganizationPrincipal,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
  entitlementMutationRefusalResponse: fakes.entitlementMutationRefusalResponse,
}));
vi.mock('@/modules/patient-home/advanceDailyWarmupPresentationManually', () => ({
  advanceDailyWarmupPresentationManually: fakes.advanceDailyWarmupPresentationManually,
}));
vi.mock('@/modules/patient-home/buildDailyWarmupPresentationSyncDeps', () => ({
  buildDailyWarmupPresentationSyncDeps: fakes.buildDailyWarmupPresentationSyncDeps,
}));
vi.mock('@/infra/logging/logger', () => ({
  logger: { error: fakes.loggerError },
  serializeError: (e: unknown) => e,
}));

import { POST } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const patientUserId = '22222222-2222-4222-8222-222222222222';
const contentPageId = '55555555-5555-4555-8555-555555555555';
const completionId = '66666666-6666-4666-8666-666666666666';

function arrange() {
  vi.clearAllMocks();
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: patientUserId } },
  });
  fakes.resolvePatientEnrollmentOrganizationId.mockResolvedValue({ ok: true, organizationId });
  fakes.withPatientOrganizationPrincipal.mockImplementation((_ctx: unknown, run: () => unknown) =>
    run(),
  );
  fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
  fakes.buildAppDeps.mockReturnValue({
    patientOrganization: {},
    patientPractice: { record: async () => ({ ok: true, id: completionId }) },
  });
}

function post(): Promise<Response> {
  return POST(
    new Request('https://app.example.test/api/patient/practice/completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentPageId, source: 'daily_warmup', feeling: null }),
    }),
  );
}

describe('POST /api/patient/practice/completion (daily_warmup)', () => {
  it('отвечает «записано», когда смена показанной разминки отказала после записи выполнения', async () => {
    arrange();
    fakes.advanceDailyWarmupPresentationManually.mockRejectedValue(
      new Error('daily_warmup_presentation_rejected'),
    );

    const response = await post();

    // Строка выполнения уже в базе. Ответ «не удалось» заставил бы человека нажать второй раз
    // и завести дубль — ровно то, что владелец увидел на первой разминке 18.08.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, id: completionId });
    // Отказ ротации остаётся громким для оператора.
    expect(fakes.loggerError).toHaveBeenCalledTimes(1);
  });

  it('не глотает отказ записи самого выполнения', async () => {
    arrange();
    fakes.buildAppDeps.mockReturnValue({
      patientOrganization: {},
      patientPractice: { record: async () => ({ ok: false, error: 'invalid_content_page' }) },
    });

    const response = await post();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_content_page' });
    expect(fakes.advanceDailyWarmupPresentationManually).not.toHaveBeenCalled();
  });
});
