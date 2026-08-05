import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createBookingPoliciesService } from './service';
import type { BookingPoliciesPort } from './ports';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function buildService() {
  const upsertCancellationPolicy = vi.fn(async () => ({ id: 'policy-1' }) as never);
  const port = {
    listCancellationPolicies: vi.fn(async () => []),
    listReschedulePolicies: vi.fn(async () => []),
    upsertCancellationPolicy,
    upsertReschedulePolicy: vi.fn(),
    resolveCancellationPolicy: vi.fn(),
    resolveReschedulePolicy: vi.fn(),
  } as unknown as BookingPoliciesPort;
  const service = createBookingPoliciesService(port, {
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, upsertCancellationPolicy };
}

describe('booking-policies — 3.2 physical door (booking)', () => {
  it('refuses upsertCancellationPolicy when no booking mutation decision ran first', async () => {
    const { service, upsertCancellationPolicy } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.upsertCancellationPolicy({
          organizationId: ORG_ID,
          scopeLevel: 'organization',
          scopeEntityId: ORG_ID,
          title: 'Отмена',
          isActive: true,
          freeCancelHoursBefore: 24,
          cancellationAllowed: true,
          lateCancellationBehavior: 'penalty',
          refundPrepaymentOnLate: 'none',
          chargePackageSessionOnLate: false,
          requiresStaffConfirmation: false,
          notifyPatient: true,
          notifyStaff: true,
          sortOrder: 0,
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(upsertCancellationPolicy).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared booking for this continuation', async () => {
    const { service, upsertCancellationPolicy } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('booking');
      const policy = await service.upsertCancellationPolicy({
        organizationId: ORG_ID,
        scopeLevel: 'organization',
        scopeEntityId: ORG_ID,
        title: 'Отмена',
        isActive: true,
        freeCancelHoursBefore: 24,
        cancellationAllowed: true,
        lateCancellationBehavior: 'penalty',
        refundPrepaymentOnLate: 'none',
        chargePackageSessionOnLate: false,
        requiresStaffConfirmation: false,
        notifyPatient: true,
        notifyStaff: true,
        sortOrder: 0,
      });
      expect(policy.id).toBe('policy-1');
    });
    expect(upsertCancellationPolicy).toHaveBeenCalledOnce();
  });
});
