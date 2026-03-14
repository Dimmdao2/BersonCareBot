import { getCurrentSession, exchangeIntegratorToken, clearSession } from "@/modules/auth/service";
import { getCurrentUser } from "@/modules/users/service";
import { getMenuForRole } from "@/modules/menu/service";
import { listLessons } from "@/modules/lessons/service";
import { listEmergencyTopics } from "@/modules/emergency/service";
import { createPatientCabinetService } from "@/modules/patient-cabinet/service";
import { getDoctorWorkspaceState } from "@/modules/doctor-cabinet/service";
import { getPurchaseSectionState } from "@/modules/purchases/service";
import { getUpcomingAppointments } from "@/modules/appointments/service";
import { listSymptomEntries, addSymptomEntry } from "@/modules/diaries/symptom-service";
import { listLfkCompletions, addLfkCompletion } from "@/modules/diaries/lfk-service";
import { checkDbHealth } from "@/infra/db/client";

export function buildAppDeps() {
  return {
    auth: {
      getCurrentSession,
      exchangeIntegratorToken,
      clearSession,
    },
    users: {
      getCurrentUser,
    },
    menu: {
      getMenuForRole,
    },
    lessons: {
      listLessons,
    },
    emergency: {
      listEmergencyTopics,
    },
    patientCabinet: createPatientCabinetService({
      getUpcomingAppointments,
    }),
    doctorCabinet: {
      getDoctorWorkspaceState,
    },
    purchases: {
      getPurchaseSectionState,
    },
    diaries: {
      listSymptomEntries,
      addSymptomEntry,
      listLfkCompletions,
      addLfkCompletion,
    },
    health: {
      checkDbHealth,
    },
  };
}
