import type { DoctorAppointmentsAudience } from '@/modules/doctor-appointments/ports';
import type { ClientListItem, DoctorClientsFilters } from '@/modules/doctor-clients/ports';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';
import type { SpecialistTasksService } from '@/modules/specialist-tasks/service';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';

type Input = {
  specialistTasks?: SpecialistTasksService;
  ownerUserId?: string;
  doctorClients: {
    listClients(
      filters: DoctorClientsFilters,
      audience?: { excludedUserIds?: string[] },
    ): Promise<ClientListItem[]>;
  };
  doctorUserId?: string;
  organizationId: string;
  visibilityActor: PatientVisibilityActor;
  audience?: DoctorAppointmentsAudience;
};

export type DoctorOpenTasksData = {
  tasks: SpecialistTaskRow[];
  patientNames: Record<string, string>;
};

/** One scoped, batch-loaded source for Today and the standalone Tasks page. */
export async function loadDoctorOpenTasks(input: Input): Promise<DoctorOpenTasksData> {
  const tasks =
    input.specialistTasks && input.ownerUserId
      ? await input.specialistTasks.listForOwner({
          ownerUserId: input.ownerUserId,
          includeCompleted: false,
        })
      : [];
  const userIds = [
    ...new Set(
      tasks.map((task) => task.patientUserId?.trim() ?? '').filter((userId) => userId.length > 0),
    ),
  ];
  const patients =
    userIds.length > 0
      ? await input.doctorClients.listClients(
          {
            userIds,
            organizationId: input.organizationId,
            visibilityActor: input.visibilityActor,
            ...(input.doctorUserId ? { viewerUserId: input.doctorUserId } : {}),
          },
          { excludedUserIds: input.audience?.excludedUserIds },
        )
      : [];

  return {
    tasks,
    patientNames: Object.fromEntries(
      patients.map((patient) => [patient.userId, patient.displayName.trim() || '—']),
    ),
  };
}
