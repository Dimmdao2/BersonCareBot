import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createPaymentsService } from './service';
import type { PaymentsPort } from './ports';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function buildService() {
  const upsertPrepaymentPolicy = vi.fn(async () => ({
    id: 'policy-1',
    organizationId: ORG_ID,
    serviceId: 'service-1',
    onlineCategory: null,
    mode: 'percent' as const,
    amountMinor: null,
    percentBps: 5000,
    currency: 'RUB',
    isActive: true,
  }));
  const port = {
    upsertPrepaymentPolicy,
  } as unknown as PaymentsPort;
  const service = createPaymentsService({
    port,
    config: {
      getBookingPaymentSettings: vi.fn(async () => ({
        enabled: true,
        defaultProviderId: 'yookassa',
        providers: [],
      })),
    },
    captureUnitOfWork: { run: vi.fn(), runSerializedPostCommit: vi.fn() },
    bookingEngine: null,
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, upsertPrepaymentPolicy };
}

describe('payments service — 3.2 physical door', () => {
  it('refuses upsertPrepaymentPolicy when no booking_prepayment mutation decision ran first', async () => {
    const { service, upsertPrepaymentPolicy } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.upsertPrepaymentPolicy({
          organizationId: ORG_ID,
          serviceId: 'service-1',
          mode: 'percent',
          percentBps: 5000,
          currency: 'RUB',
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(upsertPrepaymentPolicy).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared booking_prepayment for this continuation', async () => {
    const { service, upsertPrepaymentPolicy } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('booking_prepayment');
      const row = await service.upsertPrepaymentPolicy({
        organizationId: ORG_ID,
        serviceId: 'service-1',
        mode: 'percent',
        percentBps: 5000,
        currency: 'RUB',
      });
      expect(row.id).toBe('policy-1');
    });
    expect(upsertPrepaymentPolicy).toHaveBeenCalledOnce();
  });
});
