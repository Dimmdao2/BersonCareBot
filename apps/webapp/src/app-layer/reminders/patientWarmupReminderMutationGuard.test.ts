import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  resolvePatientEnrollmentOrganizationId: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
}));

vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: fakes.resolvePatientEnrollmentOrganizationId,
}));

vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  entitlementMutationRefusalMessage: vi.fn(() => 'denied'),
  entitlementMutationRefusalResponse: vi.fn(() => new Response(null, { status: 403 })),
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
}));

import { requirePatientWarmupReminderMutation } from './patientWarmupReminderMutationGuard';
import {
  assertMechanicWriteClearance,
  MechanicWriteClearanceRequiredError,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';

describe('requirePatientWarmupReminderMutation', () => {
  it('scopes the warmups clearance around the actual asynchronous write', async () => {
    fakes.resolvePatientEnrollmentOrganizationId.mockResolvedValue({
      ok: true,
      organizationId: '22222222-2222-4222-8222-222222222222',
    });
    fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
    const deps = {
      patientOrganization: {},
      reminders: { listRulesByUser: vi.fn(async () => []) },
      patientHomeBlocks: {},
      contentPages: {},
      contentSections: {},
      systemSettings: {},
    } as unknown as Parameters<typeof requirePatientWarmupReminderMutation>[0];

    await runWithoutMechanicWriteClearance(async () => {
      const guard = await requirePatientWarmupReminderMutation(
        deps,
        '33333333-3333-4333-8333-333333333333',
        { linkedObjectType: 'content_section', linkedObjectId: 'warmups' },
        'изменить напоминание',
      );

      expect(guard.ok).toBe(true);
      expect(() => assertMechanicWriteClearance('warmups')).toThrow(
        MechanicWriteClearanceRequiredError,
      );
      if (!guard.ok) throw new Error('expected_allowed_warmup_mutation');

      await guard.runMutation(async () => {
        await Promise.resolve();
        expect(() => assertMechanicWriteClearance('warmups')).not.toThrow();
      });

      expect(() => assertMechanicWriteClearance('warmups')).toThrow(
        MechanicWriteClearanceRequiredError,
      );
    });
  });
});
