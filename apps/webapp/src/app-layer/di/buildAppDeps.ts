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
import { createPgPhoneChallengeStore } from "@/infra/repos/pgPhoneChallengeStore";
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
import { createPgBroadcastAuditPort } from "@/infra/repos/pgBroadcastAudit";
import { inMemoryDoctorAppointmentsPort } from "@/infra/repos/inMemoryDoctorAppointments";
import { inMemoryMessageLogPort } from "@/infra/repos/inMemoryMessageLog";
import { createPgMessageLogPort } from "@/infra/repos/pgMessageLog";
import { createPgDoctorClientsPort } from "@/infra/repos/pgDoctorClients";
import { createPgDoctorAppointmentsPort } from "@/infra/repos/pgDoctorAppointments";
import { getPurchaseSectionState } from "@/modules/purchases/service";
import type { AppointmentSummary } from "@/modules/appointments/service";
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
import { pgUserProjectionPort, inMemoryUserProjectionPort } from "@/infra/repos/pgUserProjection";
import { createPgSupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";
import { inMemorySupportCommunicationPort } from "@/infra/repos/inMemorySupportCommunication";
import { createPgReminderProjectionPort } from "@/infra/repos/pgReminderProjection";
import { inMemoryReminderProjectionPort } from "@/infra/repos/inMemoryReminderProjection";
import { createPgAppointmentProjectionPort } from "@/infra/repos/pgAppointmentProjection";
import { inMemoryAppointmentProjectionPort } from "@/infra/repos/inMemoryAppointmentProjection";
import { createPgBranchesProjectionPort } from "@/infra/repos/pgBranches";
import { createPgSubscriptionMailingProjectionPort } from "@/infra/repos/pgSubscriptionMailingProjection";
import { inMemorySubscriptionMailingProjectionPort } from "@/infra/repos/inMemorySubscriptionMailingProjection";
import { checkDbHealth, getPool } from "@/infra/db/client";
import { env, integratorWebhookSecret } from "@/config/env";
import { getDeliveryTargetsForIntegrator } from "@/modules/integrator/deliveryTargetsApi";

const symptomDiaryPort = env.DATABASE_URL ? pgSymptomDiaryPort : inMemorySymptomDiaryPort;
const lfkDiaryPort = env.DATABASE_URL ? pgLfkDiaryPort : inMemoryLfkDiaryPort;
const channelPreferencesPort = env.DATABASE_URL ? pgChannelPreferencesPort : inMemoryChannelPreferencesPort;
const userByPhonePort = env.DATABASE_URL ? pgUserByPhonePort : inMemoryUserByPhonePort;
const identityResolutionPort = env.DATABASE_URL ? pgIdentityResolutionPort : inMemoryIdentityResolutionPort;
const doctorClientsPort = env.DATABASE_URL ? createPgDoctorClientsPort() : inMemoryDoctorClientsPort;
// Stage 9: appointment_records lives in webapp DB (projection from integrator).
const doctorAppointmentsPort = env.DATABASE_URL ? createPgDoctorAppointmentsPort() : inMemoryDoctorAppointmentsPort;
const challengeStore = env.DATABASE_URL ? createPgPhoneChallengeStore() : inMemoryPhoneChallengeStore;
const messageLogPort = env.DATABASE_URL ? createPgMessageLogPort() : inMemoryMessageLogPort;
const broadcastAuditPort = env.DATABASE_URL ? createPgBroadcastAuditPort() : inMemoryBroadcastAuditPort;
const userProjectionPort = env.DATABASE_URL ? pgUserProjectionPort : inMemoryUserProjectionPort;
const supportCommunicationPort = env.DATABASE_URL
  ? createPgSupportCommunicationPort()
  : inMemorySupportCommunicationPort;
const reminderProjectionPort = env.DATABASE_URL
  ? createPgReminderProjectionPort()
  : inMemoryReminderProjectionPort;
const appointmentProjectionPort = env.DATABASE_URL
  ? createPgAppointmentProjectionPort()
  : inMemoryAppointmentProjectionPort;
const branchesProjectionPort = env.DATABASE_URL ? createPgBranchesProjectionPort() : null;
const subscriptionMailingProjectionPort = env.DATABASE_URL
  ? createPgSubscriptionMailingProjectionPort()
  : inMemorySubscriptionMailingProjectionPort;

function linkFromPayload(payload: Record<string, unknown>): string | null {
  const link = payload?.link;
  if (typeof link === "string" && link.trim()) return link.trim();
  const url = payload?.url;
  if (typeof url === "string" && url.trim()) return url.trim();
  const recordUrl = payload?.record_url;
  if (typeof recordUrl === "string" && recordUrl.trim()) return recordUrl.trim();
  return null;
}

const getUpcomingAppointments: (userId: string) => Promise<AppointmentSummary[]> =
  env.DATABASE_URL && appointmentProjectionPort
    ? async (userId: string) => {
        try {
          const pool = getPool();
          const res = await pool.query<{ phone_normalized: string | null }>(
            "SELECT phone_normalized FROM platform_users WHERE id = $1",
            [userId]
          );
          const phone = res.rows[0]?.phone_normalized;
          if (!phone || typeof phone !== "string") return [];
          const rows = await appointmentProjectionPort.listActiveByPhoneNormalized(phone);
          return rows.map((row) => ({
            id: row.integratorRecordId,
            label: row.recordAt
              ? `Запись ${new Date(row.recordAt).toLocaleString("ru-RU")}`
              : "Запись",
            link: linkFromPayload(row.payloadJson),
          }));
        } catch {
          return [];
        }
      }
    : async () => [];

const symptomDiaryService = createSymptomDiaryService(symptomDiaryPort);
const lfkDiaryService = createLfkDiaryService(lfkDiaryPort);
const channelPreferencesService = createChannelPreferencesService(channelPreferencesPort);
const contentCatalog = createContentCatalogResolver({
  testVideoUrl: env.MEDIA_TEST_VIDEO_URL?.length ? env.MEDIA_TEST_VIDEO_URL : undefined,
});

const smsPort =
  env.INTEGRATOR_API_URL && integratorWebhookSecret()
    ? createIntegratorSmsAdapter({
        challengeStore,
        integratorBaseUrl: env.INTEGRATOR_API_URL,
        sharedSecret: integratorWebhookSecret(),
      })
    : createStubSmsAdapter({ challengeStore });
const phoneAuthDeps = {
  smsPort,
  challengeStore,
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
      messageLogPort,
    }),
    doctorAppointments: createDoctorAppointmentsService({
      appointmentsPort: doctorAppointmentsPort,
    }),
    doctorStats: createDoctorStatsService({
      getAppointmentStats: (filter) => doctorAppointmentsPort.getAppointmentStats(filter),
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
      broadcastAuditPort,
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
    userProjection: {
      upsertFromProjection: userProjectionPort.upsertFromProjection,
      findByIntegratorId: userProjectionPort.findByIntegratorId,
      updatePhone: userProjectionPort.updatePhone,
      updateDisplayName: userProjectionPort.updateDisplayName,
      updateProfileByPhone: userProjectionPort.updateProfileByPhone,
      upsertNotificationTopics: userProjectionPort.upsertNotificationTopics,
    },
    supportCommunication: supportCommunicationPort,
    reminderProjection: reminderProjectionPort,
    appointmentProjection: appointmentProjectionPort,
    branches: branchesProjectionPort ?? undefined,
    subscriptionMailingProjection: subscriptionMailingProjectionPort,
  };
}
