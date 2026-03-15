import {
  getCurrentSession,
  exchangeIntegratorToken,
  exchangeTelegramInitData,
  clearSession,
} from "@/modules/auth/service";
import { getCurrentUser } from "@/modules/users/service";
import { getMenuForRole } from "@/modules/menu/service";
import { listLessons } from "@/modules/lessons/service";
import { listEmergencyTopics } from "@/modules/emergency/service";
import { createPatientCabinetService } from "@/modules/patient-cabinet/service";
import { getDoctorWorkspaceState } from "@/modules/doctor-cabinet/service";
import { getPurchaseSectionState } from "@/modules/purchases/service";
import { getUpcomingAppointments } from "@/modules/appointments/service";
import { createSymptomDiaryService } from "@/modules/diaries/symptom-service";
import { createLfkDiaryService } from "@/modules/diaries/lfk-service";
import { inMemorySymptomDiaryPort } from "@/infra/repos/symptomDiary";
import { inMemoryLfkDiaryPort } from "@/infra/repos/lfkDiary";
import { pgSymptomDiaryPort } from "@/infra/repos/pgSymptomDiary";
import { pgLfkDiaryPort } from "@/infra/repos/pgLfkDiary";
import { checkDbHealth } from "@/infra/db/client";
import { env } from "@/config/env";

const symptomDiaryPort = env.DATABASE_URL ? pgSymptomDiaryPort : inMemorySymptomDiaryPort;
const lfkDiaryPort = env.DATABASE_URL ? pgLfkDiaryPort : inMemoryLfkDiaryPort;
const symptomDiaryService = createSymptomDiaryService(symptomDiaryPort);
const lfkDiaryService = createLfkDiaryService(lfkDiaryPort);

export function buildAppDeps() {
  return {
    auth: {
      getCurrentSession,
      exchangeIntegratorToken,
      exchangeTelegramInitData,
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
      listSymptomEntries: symptomDiaryService.listSymptomEntries,
      addSymptomEntry: symptomDiaryService.addSymptomEntry,
      listLfkSessions: lfkDiaryService.listLfkSessions,
      addLfkSession: lfkDiaryService.addLfkSession,
    },
    health: {
      checkDbHealth,
    },
  };
}
