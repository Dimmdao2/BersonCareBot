import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createPatientOrganizationService } from './service';
import type { PatientOrganizationPort } from './ports';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function buildService() {
  const createManualOrganizationClient = vi.fn(async () => ({ ok: true as const, userId: 'user-1' }));
  const port = {
    listActiveEnrollmentsByPlatformUser: vi.fn(async () => []),
    hasActiveEnrollment: vi.fn(async () => false),
    hasSchedulableClientRelationship: vi.fn(async () => false),
    createManualOrganizationClient,
    findTreatmentProgramOrganizationForPatient: vi.fn(async () => null),
  } satisfies PatientOrganizationPort;
  const service = createPatientOrganizationService({
    port,
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, createManualOrganizationClient };
}

describe('patient-organization service — 3.2 physical door (patient_count)', () => {
  it('refuses createManualOrganizationClient when no patient_count mutation decision ran first', async () => {
    const { service, createManualOrganizationClient } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.createManualOrganizationClient({
          organizationId: ORG_ID,
          requestId: '22222222-2222-4222-8222-222222222222',
          lastName: 'Иванов',
          firstName: 'Иван',
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(createManualOrganizationClient).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared patient_count for this continuation', async () => {
    const { service, createManualOrganizationClient } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('patient_count');
      const result = await service.createManualOrganizationClient({
        organizationId: ORG_ID,
        requestId: '22222222-2222-4222-8222-222222222222',
        lastName: 'Иванов',
        firstName: 'Иван',
      });
      expect(result).toEqual({ ok: true, userId: 'user-1' });
    });
    expect(createManualOrganizationClient).toHaveBeenCalledOnce();
  });
});
