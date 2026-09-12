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
    usesOwnPatientApp: false,
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

/**
 * Владелец 12.09.2026, дословно: «Галочку включили — из общего списка пропали. Всё, вы на бренде».
 * Ловимая поломка у каждой проверки названа в её имени.
 */
describe('клиника со своим приложением уходит из общего списка платформы', () => {
  const ownApp = () =>
    enrollment({
      organizationId: 'organization-2',
      organizationTitle: 'Clinic Two',
      usesOwnPatientApp: true,
    });

  it('на общей платформе её нет в списке, а единственная оставшаяся выбирается сама', async () => {
    const service = serviceWithEnrollments([enrollment(), ownApp()]);

    await expect(service.resolveActiveOrganizationForPatient(patientId)).resolves.toEqual({
      ok: true,
      organizationId: 'organization-1',
      organization: { organizationId: 'organization-1', title: 'Clinic One' },
      organizations: [{ organizationId: 'organization-1', title: 'Clinic One' }],
      selectedBy: 'only_active',
    });
  });

  it('пациент только такой клиники на общей платформе не имеет сопровождения', async () => {
    const service = serviceWithEnrollments([ownApp()]);

    await expect(service.resolveActiveOrganizationForPatient(patientId)).resolves.toEqual({
      ok: false,
      reason: 'no_active_enrollment',
    });
  });

  /**
   * Ловит самую дорогую поломку этой правки: клиника скрыта и на СВОЁМ адресе, из-за чего её
   * собственный пациент не может войти в её же кабинет.
   */
  it('на своём адресе она видна и пускает — скрытие не распространяется на проверенную цель', async () => {
    const service = serviceWithEnrollments([enrollment(), ownApp()]);

    await expect(
      service.resolveActiveOrganizationForPatient(patientId, {
        verifiedTargetOrganizationId: 'organization-2',
      }),
    ).resolves.toEqual({
      ok: true,
      organizationId: 'organization-2',
      organization: { organizationId: 'organization-2', title: 'Clinic Two' },
      organizations: [
        { organizationId: 'organization-1', title: 'Clinic One' },
        { organizationId: 'organization-2', title: 'Clinic Two' },
      ],
      selectedBy: 'verified_target',
    });
  });

  it('запомненный выбор такой клиники на общей платформе больше не открывает её', async () => {
    const service = serviceWithEnrollments([enrollment(), ownApp()]);

    await expect(
      service.resolveActiveOrganizationForPatient(patientId, {
        rememberedOrganizationId: 'organization-2',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'organization_selection_required',
      organizationIds: ['organization-1'],
      organizations: [{ organizationId: 'organization-1', title: 'Clinic One' }],
      invalidRememberedOrganization: true,
    });
  });

  it('умолчание закрытое: вызывающий, который про признак не знает, её не получает', async () => {
    const service = serviceWithEnrollments([ownApp()]);

    await expect(
      service.resolveActiveOrganizationForPatient(patientId, { rememberedOrganizationId: null }),
    ).resolves.toEqual({ ok: false, reason: 'no_active_enrollment' });
  });

  it('явный небраузерный вызов видит её — у моста интегратора нет хоста и нет общего списка', async () => {
    const service = serviceWithEnrollments([ownApp()]);

    await expect(
      service.resolveActiveOrganizationForPatient(patientId, {
        includeOwnAppOrganizations: true,
      }),
    ).resolves.toMatchObject({ ok: true, organizationId: 'organization-2' });
  });
});
