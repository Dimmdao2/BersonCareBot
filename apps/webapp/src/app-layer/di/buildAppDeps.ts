/**
 * Сборка зависимостей приложения: авторизация, меню, дневники, каталог контента, настройки каналов и т.д.
 * Используется на страницах приложения для доступа к сервисам. При наличии базы данных подключаются
 * хранилища в БД (дневники, настройки каналов), иначе — хранилища в памяти.
 */

import { cache } from "react";
import {
  getCurrentSession,
  exchangeIntegratorToken,
  exchangeTelegramInitData,
  exchangeTelegramLoginWidget,
  clearSession,
  setSessionFromUser,
} from "@/modules/auth/service";
import type { TelegramLoginWidgetPayload } from "@/modules/auth/telegramLoginVerify";
import {
  startPhoneAuth as startPhoneAuthFlow,
  confirmPhoneAuth as confirmPhoneAuthFlow,
  type StartPhoneAuthOptions,
} from "@/modules/auth/phoneAuth";
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
import { getMenuForRole as getMenuForRoleImpl } from "@/modules/menu/service";
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
  type PastAppointmentSummary,
} from "@/modules/appointments/service";
import { appointmentRowLabel } from "@/modules/appointments/appointmentLabels";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import {
  formatAppointmentDateNumericRu,
  formatAppointmentTimeShortRu,
  formatBookingDateTimeMediumRu,
} from "@/shared/lib/formatBusinessDateTime";
import { SCHEDULE_RECORD_PROVENANCE_PREFIX } from "@/shared/lib/scheduleRecordProvenance";
import { createMediaService } from "@/modules/media/service";
import { createSymptomDiaryService } from "@/modules/diaries/symptom-service";
import { createLfkDiaryService } from "@/modules/diaries/lfk-service";
import { createChannelPreferencesService } from "@/modules/channel-preferences/service";
import { createContentCatalogResolver } from "@/modules/content-catalog/service";
import { mockMediaStoragePort } from "@/infra/repos/mockMediaStorage";
import { createS3MediaStoragePort } from "@/infra/repos/s3MediaStorage";
import { inMemorySymptomDiaryPort } from "@/infra/repos/symptomDiary";
import { inMemoryLfkDiaryPort } from "@/infra/repos/lfkDiary";
import { pgSymptomDiaryPort } from "@/infra/repos/pgSymptomDiary";
import { pgLfkDiaryPort } from "@/infra/repos/pgLfkDiary";
import { purgeAllDiaryDataForUserPg } from "@/infra/repos/pgDiaryPurge";
import { purgeInMemoryLfkDiaryForUser } from "@/infra/repos/lfkDiary";
import { purgeInMemorySymptomDiaryForUser } from "@/infra/repos/symptomDiary";
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
import { createPgContentSectionsPort, inMemoryContentSectionsPort } from "@/infra/repos/pgContentSections";
import { createPgSupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";
import { inMemorySupportCommunicationPort } from "@/infra/repos/inMemorySupportCommunication";
import { createPatientMessagingService } from "@/modules/messaging/patientMessagingService";
import { createDoctorSupportMessagingService } from "@/modules/messaging/doctorSupportMessagingService";
import { createPgReminderProjectionPort } from "@/infra/repos/pgReminderProjection";
import { inMemoryReminderProjectionPort } from "@/infra/repos/inMemoryReminderProjection";
import { createPgReminderRulesPort } from "@/infra/repos/pgReminderRules";
import { createInMemoryReminderRulesPort } from "@/infra/repos/inMemoryReminderRules";
import { createPgReminderJournalPort } from "@/infra/repos/pgReminderJournal";
import { createRemindersService } from "@/modules/reminders/service";
import { notifyIntegratorRuleUpdated } from "@/modules/reminders/notifyIntegrator";
import { createPgAppointmentProjectionPort } from "@/infra/repos/pgAppointmentProjection";
import { inMemoryAppointmentProjectionPort } from "@/infra/repos/inMemoryAppointmentProjection";
import { createPgDoctorNotesPort } from "@/infra/repos/pgDoctorNotes";
import { inMemoryDoctorNotesPort } from "@/infra/repos/inMemoryDoctorNotes";
import { createPgBranchesProjectionPort } from "@/infra/repos/pgBranches";
import { createPgSubscriptionMailingProjectionPort } from "@/infra/repos/pgSubscriptionMailingProjection";
import { inMemorySubscriptionMailingProjectionPort } from "@/infra/repos/inMemorySubscriptionMailingProjection";
import { createPgSystemSettingsPort } from "@/infra/repos/pgSystemSettings";
import { inMemorySystemSettingsPort } from "@/infra/repos/inMemorySystemSettings";
import { createSystemSettingsService } from "@/modules/system-settings/service";
import { createLfkExercisesService } from "@/modules/lfk-exercises/service";
import { pgLfkExercisesPort } from "@/infra/repos/pgLfkExercises";
import { inMemoryLfkExercisesPort } from "@/infra/repos/inMemoryLfkExercises";
import { createLfkTemplatesService } from "@/modules/lfk-templates/service";
import { pgLfkTemplatesPort } from "@/infra/repos/pgLfkTemplates";
import { inMemoryLfkTemplatesPort } from "@/infra/repos/inMemoryLfkTemplates";
import { createLfkAssignmentsService } from "@/modules/lfk-assignments/service";
import type { LfkAssignmentsPort } from "@/modules/lfk-assignments/ports";
import { pgLfkAssignmentsPort } from "@/infra/repos/pgLfkAssignments";
import { checkDbHealth } from "@/infra/db/client";
import { env, integratorWebhookSecret, isS3MediaEnabled } from "@/config/env";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { getDeliveryTargetsForIntegrator } from "@/modules/integrator/deliveryTargetsApi";
import { createPatientBookingService } from "@/modules/patient-booking/service";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { pgPatientBookingsPort } from "@/infra/repos/pgPatientBookings";
import { inMemoryPatientBookingsPort } from "@/infra/repos/inMemoryPatientBookings";
import { createPgBookingCatalogPort } from "@/infra/repos/pgBookingCatalog";
import { createBookingCatalogService } from "@/modules/booking-catalog/service";

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
const reminderRulesPort = env.DATABASE_URL
  ? createPgReminderRulesPort()
  : createInMemoryReminderRulesPort();
const reminderJournalPort = env.DATABASE_URL ? createPgReminderJournalPort() : undefined;
const remindersService = createRemindersService(reminderRulesPort, {
  notifyIntegrator: notifyIntegratorRuleUpdated,
  journal: reminderJournalPort,
});
const appointmentProjectionPort = env.DATABASE_URL
  ? createPgAppointmentProjectionPort()
  : inMemoryAppointmentProjectionPort;
const patientBookingsPort = env.DATABASE_URL
  ? pgPatientBookingsPort
  : inMemoryPatientBookingsPort;
const bookingCatalogPort = env.DATABASE_URL ? createPgBookingCatalogPort() : null;
const bookingCatalogService = bookingCatalogPort
  ? createBookingCatalogService(bookingCatalogPort)
  : null;
const patientBookingService = createPatientBookingService({
  bookingsPort: patientBookingsPort,
  syncPort: createBookingSyncPort(),
  bookingCatalog: bookingCatalogService,
});
const branchesProjectionPort = env.DATABASE_URL ? createPgBranchesProjectionPort() : null;
const subscriptionMailingProjectionPort = env.DATABASE_URL
  ? createPgSubscriptionMailingProjectionPort()
  : inMemorySubscriptionMailingProjectionPort;
const contentPagesPort = env.DATABASE_URL ? createPgContentPagesPort() : inMemoryContentPagesPort;
const contentSectionsPort = env.DATABASE_URL ? createPgContentSectionsPort() : inMemoryContentSectionsPort;
const mediaStoragePort =
  env.DATABASE_URL && isS3MediaEnabled(env)
    ? createS3MediaStoragePort()
    : mockMediaStoragePort;
const referencesPort = env.DATABASE_URL ? pgReferencesPort : inMemoryReferencesPort;
const doctorNotesPort = env.DATABASE_URL ? createPgDoctorNotesPort() : inMemoryDoctorNotesPort;
const doctorNotesService = createDoctorNotesService(doctorNotesPort);

const systemSettingsPort = env.DATABASE_URL ? createPgSystemSettingsPort() : inMemorySystemSettingsPort;
const systemSettingsService = createSystemSettingsService(systemSettingsPort);

const lfkExercisesPort = env.DATABASE_URL ? pgLfkExercisesPort : inMemoryLfkExercisesPort;
const lfkExercisesService = createLfkExercisesService(lfkExercisesPort);

const lfkTemplatesPort = env.DATABASE_URL ? pgLfkTemplatesPort : inMemoryLfkTemplatesPort;
const lfkTemplatesService = createLfkTemplatesService(lfkTemplatesPort);

const lfkAssignmentsStubPort: LfkAssignmentsPort = {
  async assignPublishedTemplateToPatient() {
    throw new Error("Назначение шаблона ЛФК доступно только при подключённой базе данных.");
  },
};
const lfkAssignmentsPortResolved: LfkAssignmentsPort = env.DATABASE_URL
  ? pgLfkAssignmentsPort
  : lfkAssignmentsStubPort;
const lfkAssignmentsService = createLfkAssignmentsService(lfkAssignmentsPortResolved);

const patientMessagingService = createPatientMessagingService(supportCommunicationPort, {
  isUserMessagingBlocked: (uid) => doctorClientsPort.isClientMessagingBlocked(uid),
});
const doctorSupportMessagingService = createDoctorSupportMessagingService(supportCommunicationPort, {
  shouldDispatch: (userId: string) => systemSettingsService.shouldDispatch(userId),
});

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
          const phone = await userByPhonePort.getPhoneByUserId(userId);
          if (!phone) return [];
          const tz = await getAppDisplayTimeZone();
          const rows = await appointmentProjectionPort.listActiveByPhoneNormalized(phone);
          return rows.map((row) => {
            const dateLabel = formatAppointmentDateNumericRu(row.recordAt, tz);
            const timeLabel = formatAppointmentTimeShortRu(row.recordAt, tz);
            return {
              id: row.integratorRecordId,
              dateLabel,
              timeLabel,
              label: appointmentRowLabel(dateLabel, timeLabel),
              link: linkFromPayload(row.payloadJson),
              status: mapRecordStatus(row.status),
              cancelReason: cancelReasonFromPayload(row.payloadJson),
              startsAt: row.recordAt,
              scheduleProvenancePrefix: SCHEDULE_RECORD_PROVENANCE_PREFIX,
            };
          });
        } catch {
          return [];
        }
      }
    : async (userId: string) => getUpcomingAppointmentsMock(userId);

function isStillUpcomingSlot(row: { recordAt: string | null; status: string }): boolean {
  const st = row.status.toLowerCase();
  if (st !== "created" && st !== "updated") return false;
  const nowMs = Date.now();
  if (row.recordAt == null) return true;
  return new Date(row.recordAt).getTime() >= nowMs;
}

const getPastAppointments: (userId: string) => Promise<PastAppointmentSummary[]> =
  env.DATABASE_URL && appointmentProjectionPort
    ? async (userId: string) => {
        try {
          const phone = await userByPhonePort.getPhoneByUserId(userId);
          if (!phone) return [];
          const tz = await getAppDisplayTimeZone();
          const rows = await appointmentProjectionPort.listHistoryByPhoneNormalized(phone, 80);
          return rows
            .filter((row) => !isStillUpcomingSlot(row))
            .filter((row) => !row.status.toLowerCase().includes("cancel"))
            .map((row) => {
              const dateLabel = formatAppointmentDateNumericRu(row.recordAt, tz);
              const timeLabel = formatAppointmentTimeShortRu(row.recordAt, tz);
              return {
                id: row.integratorRecordId,
                dateLabel,
                timeLabel,
                label: appointmentRowLabel(dateLabel, timeLabel),
                /** Прошлые записи не ведём на внешнее «редактирование» в расписании — сценарий изменения в боте. */
                link: null,
                status: mapRecordStatus(row.status),
                recordAtIso: row.recordAt ? new Date(row.recordAt).toISOString() : null,
                scheduleProvenancePrefix: SCHEDULE_RECORD_PROVENANCE_PREFIX,
              };
            });
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
  const tz = await getAppDisplayTimeZone();
  const rows = await appointmentProjectionPort.listHistoryByPhoneNormalized(phone, 80);
  return rows.map((row) => ({
    id: row.integratorRecordId,
    recordAt: row.recordAt,
    status: row.status,
    label: row.recordAt
      ? `${formatBookingDateTimeMediumRu(row.recordAt, tz)} · ${row.status}`
      : row.status,
    lastEvent: row.lastEvent,
    updatedAt: row.updatedAt,
    scheduleProvenancePrefix: SCHEDULE_RECORD_PROVENANCE_PREFIX,
  }));
}

/** Возвращает объект со всеми сервисами приложения для использования на страницах и в API. */
function _buildAppDeps() {
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
      exchangeTelegramLoginWidget: (payload: TelegramLoginWidgetPayload) =>
        exchangeTelegramLoginWidget(payload, identityResolutionPort, userProjectionPort.updateRole),
      clearSession,
      setSessionFromUser,
      startPhoneAuth: (phone: string, context: ChannelContext, opts?: StartPhoneAuthOptions) =>
        startPhoneAuthFlow(phone, context, phoneAuthDeps, opts),
      confirmPhoneAuth: async (challengeId: string, code: string) => {
        const result = await confirmPhoneAuthFlow(challengeId, code, phoneAuthDeps);
        if (!result.ok) return result;
        const envRole = resolveRoleFromEnv({
          phone: result.user.phone,
          telegramId: result.user.bindings?.telegramId,
          maxId: result.user.bindings?.maxId,
        });
        if (result.user.role === envRole) {
          return {
            ok: true as const,
            user: result.user,
            redirectTo: getRedirectPathForRole(envRole),
            deliveryChannel: result.deliveryChannel,
          };
        }
        await userProjectionPort.updateRole(result.user.userId, envRole);
        const user = { ...result.user, role: envRole };
        return {
          ok: true as const,
          user,
          redirectTo: getRedirectPathForRole(envRole),
          deliveryChannel: result.deliveryChannel,
        };
      },
    },
    users: {
      getCurrentUser,
    },
    menu: {
      getMenuForRole: getMenuForRoleImpl,
    },
    lessons: {
      listLessons: () => listLessons(contentPagesPort),
    },
    emergency: {
      listEmergencyTopics: () => listEmergencyTopics(contentPagesPort),
    },
    patientCabinet: createPatientCabinetService({
      getUpcomingAppointments,
      getPastAppointments,
    }),
    patientBooking: patientBookingService,
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
        if (filter === "with_telegram") {
          const list = await doctorClientsPort.listClients({ hasTelegram: true });
          return list.length;
        }
        if (filter === "with_max") {
          const list = await doctorClientsPort.listClients({ hasMax: true });
          return list.length;
        }
        if (filter === "with_upcoming_appointment") {
          const list = await doctorClientsPort.listClients({ hasUpcomingAppointment: true });
          return list.length;
        }
        if (filter === "active_clients") {
          const list = await doctorClientsPort.listClients({ onlyWithAppointmentRecords: true });
          return list.length;
        }
        if (filter === "without_appointment") {
          // Clients without an upcoming appointment = all − with_upcoming_appointment.
          const [all, withUpcoming] = await Promise.all([
            doctorClientsPort.listClients({}),
            doctorClientsPort.listClients({ hasUpcomingAppointment: true }),
          ]);
          return all.length - withUpcoming.length;
        }
        if (filter === "inactive") {
          // TODO(AUDIT-BACKLOG-010): add lastEventBefore filter to DoctorClientsPort when inactivity tracking lands.
          const list = await doctorClientsPort.listClients({});
          return list.length;
        }
        if (filter === "sms_only") {
          // TODO(AUDIT-BACKLOG-011): add smsOnly filter to DoctorClientsPort when channel-attribute tracking lands.
          const list = await doctorClientsPort.listClients({});
          return list.length;
        }
        // filter === "all"
        const list = await doctorClientsPort.listClients({});
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
      listSymptomEntriesForUserInRange: symptomDiaryService.listSymptomEntriesForUserInRange,
      minRecordedAtForSymptomTracking: symptomDiaryService.minRecordedAtForSymptomTracking,
      getSymptomEntryForUser: symptomDiaryService.getSymptomEntryForUser,
      updateSymptomEntry: symptomDiaryService.updateSymptomEntry,
      deleteSymptomEntry: symptomDiaryService.deleteSymptomEntry,
      createLfkComplex: lfkDiaryService.createComplex,
      listLfkComplexes: lfkDiaryService.listComplexes,
      listLfkSessions: lfkDiaryService.listLfkSessions,
      addLfkSession: lfkDiaryService.addLfkSession,
      getLfkComplexForUser: lfkDiaryService.getLfkComplexForUser,
      listLfkSessionsInRange: lfkDiaryService.listLfkSessionsInRange,
      minCompletedAtForLfkUser: lfkDiaryService.minCompletedAtForUser,
      getLfkSessionForUser: lfkDiaryService.getLfkSessionForUser,
      updateLfkSession: lfkDiaryService.updateLfkSession,
      deleteLfkSession: lfkDiaryService.deleteLfkSession,
      purgeAllDiaryDataForUser: async (userId: string) => {
        if (env.DATABASE_URL) {
          await purgeAllDiaryDataForUserPg(userId);
        } else {
          purgeInMemorySymptomDiaryForUser(userId);
          purgeInMemoryLfkDiaryForUser(userId);
        }
      },
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
      applyRubitimeEmailAutobind: userProjectionPort.applyRubitimeEmailAutobind,
    },
    supportCommunication: supportCommunicationPort,
    /** Поддержка: чат webapp ↔ админ (этап 8). */
    messaging: {
      patient: patientMessagingService,
      doctorSupport: doctorSupportMessagingService,
    },
    reminders: remindersService,
    /** Журнал snooze/skip/done; `undefined` без PostgreSQL. */
    reminderJournal: reminderJournalPort,
    reminderProjection: reminderProjectionPort,
    appointmentProjection: appointmentProjectionPort,
    branches: branchesProjectionPort ?? undefined,
    subscriptionMailingProjection: subscriptionMailingProjectionPort,
    contentPages: contentPagesPort,
    contentSections: contentSectionsPort,
    userByPhone: userByPhonePort,
    userPins: userPinsPort,
    oauthBindings: oauthBindingsPort,
    loginTokens: loginTokensPort,
    systemSettings: systemSettingsService,
    lfkExercises: lfkExercisesService,
    lfkTemplates: lfkTemplatesService,
    lfkAssignments: lfkAssignmentsService,
    bookingCatalog: bookingCatalogService,
    /** Raw PG port for admin booking-catalog API (null without DATABASE_URL). */
    bookingCatalogPort,
  };
}

/**
 * Одна мемоизированная сборка на один server request (React.cache в Next RSC).
 * В юнит-тестах без request-scope повторные вызовы могут давать разные объекты.
 */
export const buildAppDeps = cache(_buildAppDeps);
