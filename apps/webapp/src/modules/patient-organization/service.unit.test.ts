import { describe, expect, it } from 'vitest';
import type {
  PatientOrganizationEnrollment,
  PatientOrganizationPort,
} from '@/modules/patient-organization/ports';
import { createPatientOrganizationService } from '@/modules/patient-organization/service';

const patientId = 'patient-1';

function enrollment(
  overrides: Partial<PatientOrganizationEnrollment> = {},
): PatientOrganizationEnrollment {
  return {
    organizationId: 'organization-1',
    organizationTitle: 'Clinic One',
    platformUserId: patientId,
    status: 'active',
    organizationIsActive: true,
    createdAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function serviceWithEnrollments(rows: PatientOrganizationEnrollment[]) {
  const unused = () => Promise.reject(new Error('unexpected patient organization port call'));
  const port: PatientOrganizationPort = {
    listActiveEnrollmentsByPlatformUser: () => Promise.resolve(rows),
    hasActiveEnrollment: unused,
    hasSchedulableClientRelationship: unused,
    createManualOrganizationClient: unused,
    findTreatmentProgramOrganizationForPatient: unused,
    findTreatmentProgramDescriptionForPatient: unused,
  };

  return createPatientOrganizationService({ port });
}

describe('patient organization resolution', () => {
  it('does not accept an inactive enrollment as patient organization context', async () => {
    const service = serviceWithEnrollments([enrollment({ status: 'invited' })]);

    await expect(service.resolveActiveOrganizationForPatient(patientId)).resolves.toEqual({
      ok: false,
      reason: 'no_active_enrollment',
    });
  });

  it('does not accept another user enrollment as patient organization context', async () => {
    const service = serviceWithEnrollments([
      enrollment({ platformUserId: 'another-patient' }),
    ]);

    await expect(service.resolveActiveOrganizationForPatient(patientId)).resolves.toEqual({
      ok: false,
      reason: 'no_active_enrollment',
    });
  });

  it('rejects a verified target that is not among the patient active organizations', async () => {
    const service = serviceWithEnrollments([enrollment()]);

    await expect(
      service.resolveActiveOrganizationForPatient(patientId, {
        verifiedTargetOrganizationId: 'organization-2',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'organization_target_not_authorized',
    });
  });

  it.each([
    { rememberedOrganizationId: undefined, invalidRememberedOrganization: false },
    {
      rememberedOrganizationId: 'organization-3',
      invalidRememberedOrganization: true,
    },
  ])(
    'requires explicit selection for multiple organizations when remembered=$rememberedOrganizationId',
    async ({ rememberedOrganizationId, invalidRememberedOrganization }) => {
      const organizations = [
        enrollment(),
        enrollment({
          organizationId: 'organization-2',
          organizationTitle: 'Clinic Two',
        }),
      ];
      const service = serviceWithEnrollments(organizations);

      await expect(
        service.resolveActiveOrganizationForPatient(patientId, { rememberedOrganizationId }),
      ).resolves.toEqual({
        ok: false,
        reason: 'organization_selection_required',
        organizationIds: ['organization-1', 'organization-2'],
        organizations: [
          { organizationId: 'organization-1', title: 'Clinic One' },
          { organizationId: 'organization-2', title: 'Clinic Two' },
        ],
        invalidRememberedOrganization,
      });
    },
  );
});
