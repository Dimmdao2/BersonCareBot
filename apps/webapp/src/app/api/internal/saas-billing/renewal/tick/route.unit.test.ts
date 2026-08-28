import { describe, expect, it, vi } from 'vitest';

/**
 * WHAT BREAKS WITHOUT THIS (systemic residual audit 2026-08-27, stage 4 — «Успех batch-job возможен
 * только когда все обязательные операции завершены; `errors > 0` не превращается в `success: true`»):
 * the hourly renewal tick meets a payment-provider rejection (or a blocked tariff transition) for one
 * clinic, `runDueSaasBillingRenewals` counts it in `failed`/`errors` and moves on — and the route
 * still answers HTTP 200 `ok: true` and writes a GREEN `operator_job_status` tick with the failure
 * buried in `metaJson`. The clinic is not invoiced, and «Здоровье системы» shows the required
 * `saas_billing_renewal.tick` job as healthy, so nobody looks.
 *
 * ORACLE: the plan's stage-4 acceptance sentence above, plus its two already-corrected siblings
 * (`media-pending-delete/purge`, `media-multipart/cleanup`), which map `errors > 0` to a red tick and
 * a non-2xx status.
 */

const mocks = vi.hoisted(() => ({
  runDueSaasBillingRenewals: vi.fn(),
  recordTick: vi.fn(async () => undefined),
}));

vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'test-secret' } }));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    saasBilling: { runDueSaasBillingRenewals: mocks.runDueSaasBillingRenewals },
  }),
}));
vi.mock('@/app-layer/operator-health/recordOperatorCronJobTick', () => ({
  recordOperatorCronJobTickBestEffort: mocks.recordTick,
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return { ...original, enterWithDbInfraPrincipal: vi.fn() };
});

import { POST } from './route';

function request(): Request {
  return new Request('http://localhost/api/internal/saas-billing/renewal/tick', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-secret' },
  });
}

describe('saas billing renewal tick', () => {
  it('reports success when every due subscription was invoiced', async () => {
    vi.clearAllMocks();
    mocks.runDueSaasBillingRenewals.mockResolvedValueOnce({
      dueCount: 2,
      created: 1,
      alreadyInvoiced: 1,
      failed: 0,
      errors: [],
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, created: 1, failed: 0 });
    expect(mocks.recordTick).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('turns a renewal the provider rejected into a red tick, not a green one with failed in meta', async () => {
    vi.clearAllMocks();
    mocks.runDueSaasBillingRenewals.mockResolvedValueOnce({
      dueCount: 2,
      created: 1,
      alreadyInvoiced: 0,
      failed: 1,
      errors: [
        {
          organizationId: '11111111-1111-4111-8111-111111111111',
          saasBillingSubscriptionId: '22222222-2222-4222-8222-222222222222',
          error: 'provider_rejected',
        },
      ],
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ ok: false, failed: 1 });
    expect(mocks.recordTick).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
