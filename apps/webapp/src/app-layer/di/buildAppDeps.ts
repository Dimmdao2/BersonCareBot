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
import { createDoctorNotesService } from "@/modules/doctor-notes/service";
import type { ClientAppointmentHistoryItem } from "@/modules/doctor-clients/service";
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
import {
  getUpcomingAppointments as getUpcomingAppointmentsMock,
  type AppointmentRecordStatus,
  type AppointmentSummary,
} from "@/modules/appointments/service";
import { createMediaService } from "@/modules/media/service";
import { createSymptomDiaryService } from "@/modules/diaries/symptom-service";
import { createLfkDiaryService } from "@/modules/diaries/lfk-service";
import { createChannelPreferencesService } from "@/modules/channel-preferences/service";
import { createContentCatalogResolver } from "@/modules/content-catalog/service";
import { mockMediaStoragePort } from "@/infra/repos/mockMediaStorage";
import { createPgMediaStoragePort } from "@/infra/repos/pgMediaStorage";
import { inMemorySymptomDiaryPort } from "@/infra/repos/symptomDiary";
import { inMemoryLfkDiaryPort } from "@/infra/repos/lfkDiary";
import { pgSymptomDiaryPort } from "@/infra/repos/pgSymptomDiary";
import { pgLfkDiaryPort } from "@/infra/repos/pgLfkDiary";
import { inMemoryChannelPreferencesPort } from "@/infra/repos/inMemoryChannelPreferences";
import { pgChannelPreferencesPort } from "@/infra/repos/pgChannelPreferences";
import { pgUserProjectionPort, inMemoryUserProjectionPort } from "@/infra/repos/pgUserProjection";
import { pgUserPinsPort } from "@/infra/repos/pgUserPins";
import { inMemoryUserPinsPort } from "@/infra/repos/inMemoryUserPins";
import { pgOAuthBindingsPort } from "@/infra/repos/pgOAuthBindings";
import { inMemoryOAuthBindingsPort } from "@/infra/repos/inMemoryOAuthBindings";
import { pgLoginTokensPort } from "@/infra/repos/pgLoginTokens";
import { inMemoryLoginTokensPort } from "@/infra/repos/inMemoryLoginTokens";
import { pgReferencesPort } from "@/infra/repos/pgReferences";
import { inMemoryReferencesPort } from "@/infra/repos/inMemoryReferences";
import { createPgContentPagesPort, inMemoryContentPagesPort } from "@/infra/repos/pgContentPages";
import { createPgSupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";
import { inMemorySupportCommunicationPort } from "@/infra/repos/inMemorySupportCommunication";
import { createPatientMessagingService } from "@/modules/messaging/patientMessagingService";
import { createDoctorSupportMessagingService } from "@/modules/messaging/doctorSupportMessagingService";
import { createPgReminderProjectionPort } from "@/infra/repos/pgReminderProjection";
import { inMemoryReminderProjectionPort } from "@/infra/repos/inMemoryReminderProjection";
import { createPgAppointmentProjectionPort } from "@/infra/repos/pgAppointmentProjection";
import { inMemoryAppointmentProjectionPort } from "@/infra/repos/inMemoryAppointmentProjection";
import { createPgDoctorNotesPort } from "@/infra/repos/pgDoctorNotes";
import { inMemoryDoctorNotesPort } from "@/infra/repos/inMemoryDoctorNotes";
import { createPgBranchesProjectionPort } from "@/infra/repos/pgBranches";
import { createPgSubscriptionMailingProjectionPort } from "@/infra/repos/pgSubscriptionMailingProjection";
import { inMemorySubscriptionMailingProjectionPort } from "@/infra/repos/inMemorySubscriptionMailingProjection";
import { checkDbHealth, getPool } from "@/infra/db/client";
import { env, integratorWebhookSecret } from "@/config/env";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { getDeliveryTargetsForIntegrator } from "@/modules/integrator/deliveryTargetsApi";

const symptomDiaryPort = env.DATABASE_URL ? pgSymptomDiaryPort : inMemorySymptomDiaryPort;
const lfkDiaryPort = env.DATABASE_URL ? pgLfkDiaryPort : inMemoryLfkDiaryPort;
const channelPreferencesPort = env.DATABASE_URL ? pgChannelPreferencesPort : inMemoryChannelPreferencesPort;
const userByPhonePort = env.DATABASE_URL ? pgUserByPhonePort : inMemoryUserByPhonePort;
const userPinsPort = env.DATABASE_URL ? pgUserPinsPort : inMemoryUserPinsPort;
const oauthBindingsPort = env.DATABASE_URL ? pgOAuthBindingsPort : inMemoryOAuthBindingsPort;
const loginTokensPort = env.DATABASE_URL ? pgLoginTokensPort : inMemoryLoginTokensPort;
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
const contentPagesPort = env.DATABASE_URL ? createPgContentPagesPort() : inMemoryContentPagesPort;
const mediaStoragePort = env.DATABASE_URL ? createPgMediaStoragePort() : mockMediaStoragePort;
const referencesPort = env.DATABASE_URL ? pgReferencesPort : inMemoryReferencesPort;
const doctorNotesPort = env.DATABASE_URL ? createPgDoctorNotesPort() : inMemoryDoctorNotesPort;
const doctorNotesService = createDoctorNotesService(doctorNotesPort);

const patientMessagingService = createPatientMessagingService(supportCommunicationPort, {
  isUserMessagingBlocked: (uid) => doctorClientsPort.isClientMessagingBlocked(uid),
});
const doctorSupportMessagingService = createDoctorSupportMessagingService(supportCommunicationPort);

function linkFromPayload(payload: Record<string, unknown>): string | null {
  const link = payload?.link;
  if (typeof link === "string" && link.trim()) return link.trim();
  const url = payload?.url;
  if (typeof url === "string" && url.trim()) return url.trim();
  const recordUrl = payload?.record_url;
  if (typeof recordUrl === "string" && recordUrl.trim()) return recordUrl.trim();
  return null;
}

function cancelReasonFromPayload(payload: Record<string, unknown>): string | null {
  const a = payload?.cancellation_reason;
  const b = payload?.cancel_reason;
  if (typeof a === "string" && a.trim()) return a.trim();
  if (typeof b === "string" && b.trim()) return b.trim();
  return null;
}

function mapRecordStatus(raw: string): AppointmentRecordStatus {
  const x = raw.toLowerCase();
  if (x.includes("cancel")) return "cancelled";
  if (x.includes("resched")) return "rescheduled";
  if (x === "confirmed" || x === "updated") return "confirmed";
  return "created";
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
            status: mapRecordStatus(row.status),
            cancelReason: cancelReasonFromPayload(row.payloadJson),
            startsAt: row.recordAt,
          }));
        } catch {
          return [];
        }
      }
    : async (userId: string) => getUpcomingAppointmentsMock(userId);

const symptomDiaryService = createSymptomDiaryService(symptomDiaryPort);
const lfkDiaryService = createLfkDiaryService(lfkDiaryPort);
const channelPreferencesService = createChannelPreferencesService(channelPreferencesPort);
const contentCatalog = createContentCatalogResolver({
  testVideoUrl: env.MEDIA_TEST_VIDEO_URL?.length ? env.MEDIA_TEST_VIDEO_URL : undefined,
  contentPages: contentPagesPort,
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

async function listAppointmentHistoryForPhone(phone: string | null): Promise<ClientAppointmentHistoryItem[]> {
  if (!phone) return [];
  const rows = await appointmentProjectionPort.listHistoryByPhoneNormalized(phone, 80);
  return rows.map((row) => ({
    id: row.integratorRecordId,
    recordAt: row.recordAt,
    status: row.status,
    label: row.recordAt
      ? `${new Date(row.recordAt).toLocaleString("ru-RU")} · ${row.status}`
      : row.status,
  }));
}

/** Возвращает объект со всеми сервисами приложения для использования на страницах и в API. */
export function buildAppDeps() {
  const doctorClients = createDoctorClientsService({
    clientsPort: doctorClientsPort,
    getUpcomingAppointments,
    listAppointmentHistoryForPhone,
    listSymptomTrackings: symptomDiaryService.listTrackings,
    listSymptomEntries: symptomDiaryService.listSymptomEntries,
    listLfkComplexes: lfkDiaryService.listComplexes,
    listLfkSessions: lfkDiaryService.listLfkSessions,
    getChannelCards: (userId, bindings, delivery) =>
      channelPreferencesService.getChannelCards(userId, bindings, delivery),
  });
  return {
    auth: {
      getCurrentSession,
      exchangeIntegratorToken: (token: string) =>
        exchangeIntegratorToken(token, identityResolutionPort, userProjectionPort.updateRole),
      exchangeTelegramInitData: (initData: string) =>
        exchangeTelegramInitData(initData, identityResolutionPort, userProjectionPort.updateRole),
      clearSession,
      setSessionFromUser,
      startPhoneAuth: (phone: string, context: ChannelContext) =>
        startPhoneAuthFlow(phone, context, phoneAuthDeps),
      confirmPhoneAuth: async (challengeId: string, code: string) => {
        const result = await confirmPhoneAuthFlow(challengeId, code, phoneAuthDeps);
        if (!result.ok) return result;
        const envRole = resolveRoleFromEnv({ phone: result.user.phone });
        if (result.user.role === envRole) return result;
        await userProjectionPort.updateRole(result.user.userId, envRole);
        const user = { ...result.user, role: envRole };
        return {
          ok: true as const,
          user,
          redirectTo: getRedirectPathForRole(envRole),
        };
      },
    },
    users: {
      getCurrentUser,
    },
    menu: {
      getMenuForRole,
    },
    lessons: {
      listLessons: () => listLessons(contentPagesPort),
    },
    emergency: {
      listEmergencyTopics: () => listEmergencyTopics(contentPagesPort),
    },
    patientCabinet: createPatientCabinetService({
      getUpcomingAppointments,
    }),
    doctorCabinet: {
      getDoctorWorkspaceState,
      getOverviewState,
    },
    doctorClients,
    /** Прямой порт для API (идентичность, блокировка) без лишней агрегации профиля. */
    doctorClientsPort,
    doctorNotes: doctorNotesService,
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
      getDashboardPatientMetrics: () => doctorClientsPort.getDashboardPatientMetrics(),
      getDashboardAppointmentMetrics: () => doctorAppointmentsPort.getDashboardAppointmentMetrics(),
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
      renameSymptomTracking: symptomDiaryService.renameTracking,
      archiveSymptomTracking: symptomDiaryService.archiveTracking,
      deleteSymptomTracking: symptomDiaryService.deleteTracking,
      getSymptomTrackingForUser: symptomDiaryService.getSymptomTrackingForUser,
      listSymptomEntriesForTrackingInRange: symptomDiaryService.listSymptomEntriesForTrackingInRange,
      createLfkComplex: lfkDiaryService.createComplex,
      listLfkComplexes: lfkDiaryService.listComplexes,
      listLfkSessions: lfkDiaryService.listLfkSessions,
      addLfkSession: lfkDiaryService.addLfkSession,
      getLfkComplexForUser: lfkDiaryService.getLfkComplexForUser,
      listLfkSessionsInRange: lfkDiaryService.listLfkSessionsInRange,
    },
    references: referencesPort,
    health: {
      checkDbHealth,
    },
    media: createMediaService(mediaStoragePort),
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
      updateRole: userProjectionPort.updateRole,
      getProfileEmailFields: userProjectionPort.getProfileEmailFields,
    },
    supportCommunication: supportCommunicationPort,
    /** Поддержка: чат webapp ↔ админ (этап 8). */
    messaging: {
      patient: patientMessagingService,
      doctorSupport: doctorSupportMessagingService,
    },
    reminderProjection: reminderProjectionPort,
    appointmentProjection: appointmentProjectionPort,
    branches: branchesProjectionPort ?? undefined,
    subscriptionMailingProjection: subscriptionMailingProjectionPort,
    contentPages: contentPagesPort,
    userByPhone: userByPhonePort,
    userPins: userPinsPort,
    oauthBindings: oauthBindingsPort,
    loginTokens: loginTokensPort,
  };
}
