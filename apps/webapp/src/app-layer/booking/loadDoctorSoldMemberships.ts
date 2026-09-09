import type { ClientListItem, DoctorClientsFilters } from '@/modules/doctor-clients/ports';
import type { MembershipsService } from '@/modules/memberships/service';
import type { PatientPackageListItem } from '@/modules/memberships/types';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';
import { formatDoctorFio } from '@/shared/lib/fio';

type Input = {
  doctorClients: {
    listClients(filters: DoctorClientsFilters): Promise<ClientListItem[]>;
  };
  memberships: MembershipsService;
  organizationId: string;
  viewerUserId: string;
  visibilityActor: PatientVisibilityActor;
};

export type DoctorSoldMembershipRow = PatientPackageListItem & {
  patientDisplayName: string;
};

/** One visibility-scoped read for the sold-membership history in the doctor calendar. */
export async function loadDoctorSoldMemberships(input: Input): Promise<DoctorSoldMembershipRow[]> {
  const patients = await input.doctorClients.listClients({
    organizationId: input.organizationId,
    visibilityActor: input.visibilityActor,
    viewerUserId: input.viewerUserId,
    includeArchived: true,
  });
  const patientNameById = new Map(
    patients.map((patient) => [
      patient.userId,
      formatDoctorFio(
        {
          lastName: patient.lastName ?? null,
          firstName: patient.firstName ?? null,
          patronymic: patient.patronymic ?? null,
        },
        patient.displayName.trim() || '—',
      ),
    ]),
  );
  const packages = await input.memberships.listPatientPackagesForPatientIds(
    input.organizationId,
    patients.map((patient) => patient.userId),
  );

  return packages
    .filter((pkg) => pkg.soldAt !== null)
    .map((pkg) => ({
      ...pkg,
      patientDisplayName: patientNameById.get(pkg.platformUserId) ?? 'Пациент',
    }))
    .sort((left, right) =>
      (right.soldAt ?? right.createdAt).localeCompare(left.soldAt ?? left.createdAt),
    );
}
