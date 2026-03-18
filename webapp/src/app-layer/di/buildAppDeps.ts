/**
 * Сборка зависимостей приложения: авторизация, меню, дневники, каталог контента, настройки каналов и т.д.
 * Используется на страницах приложения для доступа к сервисам. При наличии базы данных подключаются
 * хранилища в БД (дневники, настройки каналов), иначе — хранилища в памяти.
 */

import {
  getCurrentSession,
  exchangeIntegratorToken,
  exchangeTelegramInitData,
  clearSession,
  setSessionFromUser,
} from "@/modules/auth/service";
import { startPhoneAuth as startPhoneAuthFlow, confirmPhoneAuth as confirmPhoneAuthFlow } from "@/modules/auth/phoneAuth";
import type { ChannelContext } from "@/modules/auth/channelContext";
import { createIntegratorSmsAdapter } from "@/infra/integrations/sms/integratorSmsAdapter";
import { createStubSmsAdapter } from "@/infra/integrations/sms/stubSmsAdapter";
import { inMemoryPhoneChallengeStore } from "@/infra/repos/inMemoryPhoneChallengeStore";
import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";
import { getCurrentUser } from "@/modules/users/service";
import { getMenuForRole } from "@/modules/menu/service";
import { listLessons } from "@/modules/lessons/service";
import { listEmergencyTopics } from "@/modules/emergency/service";
import { createPatientCabinetService } from "@/modules/patient-cabinet/service";
import { getDoctorWorkspaceState } from "@/modules/doctor-cabinet/service";
import { getPurchaseSectionState } from "@/modules/purchases/service";
import { getUpcomingAppointments } from "@/modules/appointments/service";
import { createMediaService } from "@/modules/media/service";
import { createSymptomDiaryService } from "@/modules/diaries/symptom-service";
import { createLfkDiaryService } from "@/modules/diaries/lfk-service";
import { createChannelPreferencesService } from "@/modules/channel-preferences/service";
import { createContentCatalogResolver } from "@/modules/content-catalog/service";
import { mockMediaStoragePort } from "@/infra/repos/mockMediaStorage";
import { inMemorySymptomDiaryPort } from "@/infra/repos/symptomDiary";
import { inMemoryLfkDiaryPort } from "@/infra/repos/lfkDiary";
import { pgSymptomDiaryPort } from "@/infra/repos/pgSymptomDiary";
import { pgLfkDiaryPort } from "@/infra/repos/pgLfkDiary";
import { inMemoryChannelPreferencesPort } from "@/infra/repos/inMemoryChannelPreferences";
import { pgChannelPreferencesPort } from "@/infra/repos/pgChannelPreferences";
import { checkDbHealth } from "@/infra/db/client";
import { env } from "@/config/env";

const symptomDiaryPort = env.DATABASE_URL ? pgSymptomDiaryPort : inMemorySymptomDiaryPort;
const lfkDiaryPort = env.DATABASE_URL ? pgLfkDiaryPort : inMemoryLfkDiaryPort;
const channelPreferencesPort = env.DATABASE_URL ? pgChannelPreferencesPort : inMemoryChannelPreferencesPort;
const symptomDiaryService = createSymptomDiaryService(symptomDiaryPort);
const lfkDiaryService = createLfkDiaryService(lfkDiaryPort);
const channelPreferencesService = createChannelPreferencesService(channelPreferencesPort);
const contentCatalog = createContentCatalogResolver({
  testVideoUrl: env.MEDIA_TEST_VIDEO_URL?.length ? env.MEDIA_TEST_VIDEO_URL : undefined,
});

const smsPort =
  env.INTEGRATOR_API_URL && env.INTEGRATOR_SHARED_SECRET
    ? createIntegratorSmsAdapter({
        challengeStore: inMemoryPhoneChallengeStore,
        integratorBaseUrl: env.INTEGRATOR_API_URL,
        sharedSecret: env.INTEGRATOR_SHARED_SECRET,
      })
    : createStubSmsAdapter({ challengeStore: inMemoryPhoneChallengeStore });
const phoneAuthDeps = {
  smsPort,
  challengeStore: inMemoryPhoneChallengeStore,
  userByPhonePort: inMemoryUserByPhonePort,
};

/** Возвращает объект со всеми сервисами приложения для использования на страницах и в API. */
export function buildAppDeps() {
  return {
    auth: {
      getCurrentSession,
      exchangeIntegratorToken,
      exchangeTelegramInitData,
      clearSession,
      setSessionFromUser,
      startPhoneAuth: (phone: string, context: ChannelContext) =>
        startPhoneAuthFlow(phone, context, phoneAuthDeps),
      confirmPhoneAuth: (challengeId: string, code: string, context: ChannelContext) =>
        confirmPhoneAuthFlow(challengeId, code, context, phoneAuthDeps),
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
      createSymptomTracking: symptomDiaryService.createTracking,
      listSymptomTrackings: symptomDiaryService.listTrackings,
      addSymptomEntry: symptomDiaryService.addEntry,
      createLfkComplex: lfkDiaryService.createComplex,
      listLfkComplexes: lfkDiaryService.listComplexes,
      listLfkSessions: lfkDiaryService.listLfkSessions,
      addLfkSession: lfkDiaryService.addLfkSession,
    },
    health: {
      checkDbHealth,
    },
    media: createMediaService(mockMediaStoragePort),
    channelPreferences: channelPreferencesService,
    contentCatalog,
  };
}
