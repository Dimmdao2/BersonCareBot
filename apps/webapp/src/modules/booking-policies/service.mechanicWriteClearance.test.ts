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
  const upsertBookingPolicy = vi.fn(async (input) => input as never);
  const port = {
    getBookingPolicy: vi.fn(),
    upsertBookingPolicy,
    resolveBookingPolicy: vi.fn(),
  } as unknown as BookingPoliciesPort;
  const service = createBookingPoliciesService(port, {
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, upsertBookingPolicy };
}

const POLICY_INPUT = {
  organizationId: ORG_ID,
  title: 'Политика отмены и переноса',
  cancellationAllowed: true,
  rescheduleAllowed: true,
  freeChangeHoursBefore: 24,
  lateChangeBehavior: 'penalty' as const,
  refundPrepaymentOnLate: 'none',
  chargePackageSessionOnLate: false,
  requiresStaffConfirmation: false,
  notifyPatient: true,
  notifyStaff: true,
};

describe('booking-policies — 3.2 physical door (booking)', () => {
  it('refuses upsertBookingPolicy when no booking mutation decision ran first', async () => {
    const { service, upsertBookingPolicy } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(service.upsertBookingPolicy(POLICY_INPUT)).rejects.toBeInstanceOf(
        MechanicWriteClearanceRequiredError,
      );
    });
    expect(upsertBookingPolicy).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared booking for this continuation', async () => {
    const { service, upsertBookingPolicy } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('booking');
      const policy = await service.upsertBookingPolicy(POLICY_INPUT);
      expect(policy.organizationId).toBe(ORG_ID);
    });
    expect(upsertBookingPolicy).toHaveBeenCalledOnce();
  });
});
