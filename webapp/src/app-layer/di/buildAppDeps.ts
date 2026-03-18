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
import { inMemoryIdentityResolutionPort } from "@/infra/repos/inMemoryIdentityResolution";
import { pgUserByPhonePort } from "@/infra/repos/pgUserByPhone";
import { pgIdentityResolutionPort } from "@/infra/repos/pgIdentityResolution";
import { getCurrentUser } from "@/modules/users/service";
import { getMenuForRole } from "@/modules/menu/service";
import { listLessons } from "@/modules/lessons/service";
import { listEmergencyTopics } from "@/modules/emergency/service";
import { createPatientCabinetService } from "@/modules/patient-cabinet/service";
import { getDoctorWorkspaceState, getOverviewState } from "@/modules/doctor-cabinet/service";
import { createDoctorClientsService } from "@/modules/doctor-clients/service";
import { createDoctorAppointmentsService } from "@/modules/doctor-appointments/service";
import { createDoctorMessagingService } from "@/modules/doctor-messaging/service";
import { createDoctorStatsService } from "@/modules/doctor-stats/service";
import { createDoctorBroadcastsService } from "@/modules/doctor-broadcasts/service";
import type { BroadcastAudienceFilter } from "@/modules/doctor-broadcasts/ports";
import { inMemoryDoctorClientsPort } from "@/infra/repos/inMemoryDoctorClients";
import { inMemoryBroadcastAuditPort } from "@/infra/repos/inMemoryBroadcastAudit";
import { inMemoryDoctorAppointmentsPort } from "@/infra/repos/inMemoryDoctorAppointments";
import { inMemoryMessageLogPort } from "@/infra/repos/inMemoryMessageLog";
import { createPgDoctorClientsPort } from "@/infra/repos/pgDoctorClients";
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
import { env, integratorWebhookSecret } from "@/config/env";
import { getDeliveryTargetsForIntegrator } from "@/modules/integrator/deliveryTargetsApi";

const symptomDiaryPort = env.DATABASE_URL ? pgSymptomDiaryPort : inMemorySymptomDiaryPort;
const lfkDiaryPort = env.DATABASE_URL ? pgLfkDiaryPort : inMemoryLfkDiaryPort;
const channelPreferencesPort = env.DATABASE_URL ? pgChannelPreferencesPort : inMemoryChannelPreferencesPort;
const userByPhonePort = env.DATABASE_URL ? pgUserByPhonePort : inMemoryUserByPhonePort;
const identityResolutionPort = env.DATABASE_URL ? pgIdentityResolutionPort : inMemoryIdentityResolutionPort;
const doctorClientsPort = env.DATABASE_URL ? createPgDoctorClientsPort() : inMemoryDoctorClientsPort;
const symptomDiaryService = createSymptomDiaryService(symptomDiaryPort);
const lfkDiaryService = createLfkDiaryService(lfkDiaryPort);
const channelPreferencesService = createChannelPreferencesService(channelPreferencesPort);
const contentCatalog = createContentCatalogResolver({
  testVideoUrl: env.MEDIA_TEST_VIDEO_URL?.length ? env.MEDIA_TEST_VIDEO_URL : undefined,
});

const smsPort =
  env.INTEGRATOR_API_URL && integratorWebhookSecret()
    ? createIntegratorSmsAdapter({
        challengeStore: inMemoryPhoneChallengeStore,
        integratorBaseUrl: env.INTEGRATOR_API_URL,
        sharedSecret: integratorWebhookSecret(),
      })
    : createStubSmsAdapter({ challengeStore: inMemoryPhoneChallengeStore });
const phoneAuthDeps = {
  smsPort,
  challengeStore: inMemoryPhoneChallengeStore,
  userByPhonePort,
};

/** Возвращает объект со всеми сервисами приложения для использования на страницах и в API. */
export function buildAppDeps() {
  const doctorClients = createDoctorClientsService({
    clientsPort: doctorClientsPort,
    getUpcomingAppointments,
    listSymptomTrackings: symptomDiaryService.listTrackings,
    listSymptomEntries: symptomDiaryService.listSymptomEntries,
    listLfkComplexes: lfkDiaryService.listComplexes,
    listLfkSessions: lfkDiaryService.listLfkSessions,
    getChannelCards: (userId, bindings) => channelPreferencesService.getChannelCards(userId, bindings),
  });
  return {
    auth: {
      getCurrentSession,
      exchangeIntegratorToken: (token: string) =>
        exchangeIntegratorToken(token, identityResolutionPort),
      exchangeTelegramInitData: (initData: string) =>
        exchangeTelegramInitData(initData, identityResolutionPort),
      clearSession,
      setSessionFromUser,
      startPhoneAuth: (phone: string, context: ChannelContext) =>
        startPhoneAuthFlow(phone, context, phoneAuthDeps),
      confirmPhoneAuth: (challengeId: string, code: string) =>
        confirmPhoneAuthFlow(challengeId, code, phoneAuthDeps),
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
      getOverviewState,
    },
    doctorClients,
    doctorMessaging: createDoctorMessagingService({
      getClientIdentity: async (userId) => {
        const p = await doctorClients.getClientProfile(userId);
        return p?.identity ?? null;
      },
      getDeliveryTargets: (params) =>
        getDeliveryTargetsForIntegrator(params, {
          userByPhonePort,
          identityResolutionPort,
          preferencesPort: channelPreferencesPort,
        }),
      messageLogPort: inMemoryMessageLogPort,
    }),
    doctorAppointments: createDoctorAppointmentsService({
      appointmentsPort: inMemoryDoctorAppointmentsPort,
    }),
    doctorStats: createDoctorStatsService({
      getAppointmentStats: (filter) =>
        inMemoryDoctorAppointmentsPort.getAppointmentStats(filter),
      listClients: (filters) => doctorClientsPort.listClients(filters),
    }),
    doctorBroadcasts: createDoctorBroadcastsService({
      resolveAudienceSize: async (filter: BroadcastAudienceFilter) => {
        const filters =
          filter === "with_telegram"
            ? { hasTelegram: true }
            : filter === "with_max"
              ? { hasMax: true }
              : filter === "with_upcoming_appointment" || filter === "active_clients"
                ? { hasUpcomingAppointment: true }
                : {};
        const list = await doctorClientsPort.listClients(filters);
        return list.length;
      },
      broadcastAuditPort: inMemoryBroadcastAuditPort,
    }),
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
    deliveryTargetsApi: {
      getTargets: (params: { phone?: string; telegramId?: string; maxId?: string }) =>
        getDeliveryTargetsForIntegrator(params, {
          userByPhonePort,
          identityResolutionPort,
          preferencesPort: channelPreferencesPort,
        }),
    },
  };
}
