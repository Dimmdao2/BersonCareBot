/**
 * Сборка зависимостей приложения: авторизация, меню, дневники, каталог контента, настройки каналов и т.д.
 * Используется на страницах приложения для доступа к сервисам. При наличии базы данных подключаются
 * хранилища в БД. In-memory — если `webappReposAreInMemory()` (Vitest без БД; `next build` без URL в CI). В `next dev` без `DATABASE_URL` — throw в `config/env`.
 */

import { cache } from 'react';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { ensureSystemSettingsConfigAdapterBound } from '@/app-layer/di/bindSystemSettingsConfigAdapter';
import {
  getCurrentSession,
  exchangeIntegratorToken,
  exchangeTelegramInitData,
  exchangeMaxInitData,
  exchangeTelegramLoginWidget,
  clearSession,
  setSessionFromUser,
} from '@/modules/auth/service';
import type { TelegramLoginWidgetPayload } from '@/modules/auth/telegramLoginVerify';
import { createPasswordChangeService } from '@/modules/auth/passwordChange';
import { hashPin } from '@/modules/auth/pinHash';
import {
  startPhoneAuth as startPhoneAuthFlow,
  confirmPhoneAuth as confirmPhoneAuthFlow,
  consumePhoneOtpChallenge,
  type StartPhoneAuthOptions,
} from '@/modules/auth/phoneAuth';
import {
  completePhoneMessengerBindFromIntegrator,
  getPhoneMessengerBindStatus,
  markPhoneMessengerBindConsumedByChallenge,
  registerPhoneMessengerBindPort,
  resolvePhoneMessengerBindLoginChallenge,
  startPhoneMessengerBind,
} from '@/modules/auth/phoneMessengerBind';
import { createPgPhoneMessengerBindPort } from '@/infra/repos/pgPhoneMessengerBind';
import type { ChannelContext } from '@/modules/auth/channelContext';
import { createIntegratorSmsAdapter } from '@/infra/integrations/sms/integratorSmsAdapter';
import { createStubSmsAdapter } from '@/infra/integrations/sms/stubSmsAdapter';
import { deliverSmsCodeViaIntegrator } from '@/infra/integrations/sms/integratorSmsDelivery';
import {
  createPgPublicBookingOtpPort,
  inMemoryPublicBookingOtpPort,
} from '@/infra/repos/pgPublicBookingOtp';
import type { PublicBookingCodeDelivery } from '@/modules/public-booking/publicBookingVerification';
import { inMemoryPhoneChallengeStore } from '@/infra/repos/inMemoryPhoneChallengeStore';
import { createPgPhoneChallengeStore } from '@/infra/repos/pgPhoneChallengeStore';
import { inMemoryUserByPhonePort } from '@/infra/repos/inMemoryUserByPhone';
import { inMemoryIdentityResolutionPort } from '@/infra/repos/inMemoryIdentityResolution';
import { pgUserByPhonePort } from '@/infra/repos/pgUserByPhone';
import { pgIdentityResolutionPort } from '@/infra/repos/pgIdentityResolution';
import { getCurrentUser } from '@/modules/users/service';
import { getMenuForRole as getMenuForRoleImpl } from '@/modules/menu/service';
import { listLessons } from '@/modules/lessons/service';
import { listEmergencyTopics } from '@/modules/emergency/service';
import { getDoctorWorkspaceState, getOverviewState } from '@/modules/doctor-cabinet/service';
import { createDoctorClientsService } from '@/modules/doctor-clients/service';
import { assembleIdentityPort } from '@/modules/identity/service';
import { createDoctorAppointmentsService } from '@/modules/doctor-appointments/service';
import { createDoctorMessagingService } from '@/modules/doctor-messaging/service';
import { createDoctorStatsService } from '@/modules/doctor-stats/service';
import { createAdminPlatformUserStatsService } from '@/modules/admin-platform-stats/service';
import { createProductAnalyticsService } from '@/modules/product-analytics/service';
import { createPgProductAnalyticsPort } from '@/infra/repos/pgProductAnalytics';
import { createInMemoryProductAnalyticsPort } from '@/infra/repos/inMemoryProductAnalytics';
import { createDoctorNotesService } from '@/modules/doctor-notes/service';
import type { ClientAppointmentHistoryItem } from '@/modules/doctor-clients/service';
import { createDoctorBroadcastsService } from '@/modules/doctor-broadcasts/service';
import {
  listClientsForBroadcastAudience,
  resolveBroadcastEffectiveClients,
  buildRecipientsPreviewFromClients,
} from '@/modules/doctor-broadcasts/broadcastAudienceMetrics';
import {
  deriveBroadcastDeliveryPolicy,
  filterEligibleBroadcastClients,
} from '@/modules/doctor-broadcasts/broadcastEligible';
import { resolveBroadcastWebPushEligibleUserIds } from '@/modules/doctor-broadcasts/resolveBroadcastWebPushEligibleUserIds';
import { fanOutBroadcastWebPush } from '@/modules/doctor-broadcasts/fanOutBroadcastWebPush';
import { inMemoryDoctorClientsPort } from '@/infra/repos/inMemoryDoctorClients';
import { inMemoryBroadcastAuditPort } from '@/infra/repos/inMemoryBroadcastAudit';
import { createPgBroadcastAuditPort } from '@/infra/repos/pgBroadcastAudit';
import { createPgDoctorBroadcastDeliveryCommitPort } from '@/infra/repos/pgDoctorBroadcastDelivery';
import { createInMemoryDoctorBroadcastDeliveryCommitPort } from '@/infra/repos/inMemoryDoctorBroadcastDelivery';
import { createPgPatientBroadcastsPort } from '@/infra/repos/pgPatientBroadcasts';
import { inMemoryPatientBroadcastsPort } from '@/infra/repos/inMemoryPatientBroadcasts';
import { createPgBroadcastDraftPort } from '@/infra/repos/pgBroadcastDrafts';
import { createInMemoryBroadcastDraftPort } from '@/infra/repos/inMemoryBroadcastDrafts';
import type { BroadcastDraft } from '@/modules/doctor-broadcasts/draftPort';
import type { BroadcastAudienceFilter } from '@/modules/doctor-broadcasts/ports';
import { createPgBroadcastChannelCountsPort } from '@/infra/repos/broadcastChannelCounts';
import { createInMemoryBroadcastChannelCountsPort } from '@/infra/repos/inMemoryBroadcastChannelCounts';
import { createPgBroadcastEmailRecipientsPort } from '@/infra/repos/pgBroadcastEmailRecipients';
import { createInMemoryBroadcastEmailRecipientsPort } from '@/infra/repos/inMemoryBroadcastEmailRecipients';
import { createPgDoctorMotivationQuotesEditorPort } from '@/infra/repos/pgDoctorMotivationQuotesEditor';
import { inMemoryDoctorMotivationQuotesEditorPort } from '@/infra/repos/inMemoryDoctorMotivationQuotesEditor';
import { inMemoryDoctorAppointmentsPort } from '@/infra/repos/inMemoryDoctorAppointments';
import { inMemoryMessageLogPort } from '@/infra/repos/inMemoryMessageLog';
import { createPgMessageLogPort } from '@/infra/repos/pgMessageLog';
import { createPgDoctorClientsPort } from '@/infra/repos/pgDoctorClients';
import { createPgAdminPlatformUserStatsPort } from '@/infra/repos/pgAdminPlatformUserStats';
import { createInMemoryAdminPlatformUserStatsPort } from '@/infra/repos/inMemoryAdminPlatformUserStats';
import { createPgDoctorAnalyticsMetricAccountsPort } from '@/infra/repos/pgDoctorAnalyticsMetricAccounts';
import { inMemoryDoctorAnalyticsMetricAccountsPort } from '@/infra/repos/inMemoryDoctorAnalyticsMetricAccounts';
import { createPgDoctorCanonicalAppointmentsPort } from '@/infra/repos/pgDoctorCanonicalAppointments';
import { getPurchaseSectionState } from '@/modules/purchases/service';
import {
  getUpcomingAppointments as getUpcomingAppointmentsMock,
  type AppointmentRecordStatus,
  type AppointmentSummary,
} from '@/modules/appointments/service';
import { appointmentRowLabel } from '@/modules/appointments/appointmentLabels';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import {
  getPatientCalendarTimezoneIana,
  setPatientCalendarTimezoneIana,
  trySetInitialCalendarTimezoneIfEmpty,
} from '@/infra/repos/pgPatientCalendarTimezone';
import {
  formatAppointmentDateNumericRu,
  formatAppointmentTimeShortRu,
  formatBookingDateTimeMediumRu,
} from '@/shared/lib/formatBusinessDateTime';
import { SCHEDULE_RECORD_PROVENANCE_PREFIX } from '@/shared/lib/scheduleRecordProvenance';
import { formatDoctorFio } from '@/shared/lib/fio';
import { selectPersonalChatSenderDisplayName } from '@/modules/messaging/notifyPatientDoctorReply';
import { createMediaService } from '@/modules/media/service';
import { createSymptomDiaryService } from '@/modules/diaries/symptom-service';
import { createLfkDiaryService } from '@/modules/diaries/lfk-service';
import { createChannelPreferencesService } from '@/modules/channel-preferences/service';
import { createContentCatalogResolver } from '@/modules/content-catalog/service';
import { mockMediaStoragePort } from '@/infra/repos/mockMediaStorage';
import { createS3MediaStoragePort, listMediaDeleteErrors } from '@/infra/repos/s3MediaStorage';
import { inMemorySymptomDiaryPort } from '@/infra/repos/symptomDiary';
import { inMemoryLfkDiaryPort } from '@/infra/repos/lfkDiary';
import { pgSymptomDiaryPort } from '@/infra/repos/pgSymptomDiary';
import { pgLfkDiaryPort } from '@/infra/repos/pgLfkDiary';
import { purgeAllDiaryDataForUserPg } from '@/infra/repos/pgDiaryPurge';
import { readReminderWebappNotifyGate } from '@/infra/repos/pgReminderWebappNotifyGate';
import { loadPlatformUserChannelBindings } from '@/infra/repos/loadPlatformUserChannelBindings';
import { createPgAppointmentReminderMaterializationPort } from '@/infra/repos/pgAppointmentReminderMaterialization';
import type { AppointmentReminderMaterializationPort } from '@/modules/booking-notifications/appointmentReminderMaterializationPort';
import {
  createNoOpReminderTransactionalEmailCooldownPort,
  createPgReminderTransactionalEmailCooldownPort,
} from '@/infra/repos/pgReminderTransactionalEmailCooldown';
import { purgeInMemoryLfkDiaryForUser } from '@/infra/repos/lfkDiary';
import { purgeInMemorySymptomDiaryForUser } from '@/infra/repos/symptomDiary';
import { inMemoryChannelPreferencesPort } from '@/infra/repos/inMemoryChannelPreferences';
import { inMemoryWebPushSubscriptionsPort } from '@/infra/repos/inMemoryWebPushSubscriptions';
import { pgChannelPreferencesPort } from '@/infra/repos/pgChannelPreferences';
import { createPgWebPushSubscriptionsPort } from '@/infra/repos/pgWebPushSubscriptions';
import {
  createPgPatientNotificationTopicsPort,
  inMemoryPatientNotificationTopicsPort,
} from '@/infra/repos/pgPatientNotificationTopics';
import {
  createPgTopicChannelPrefsPort,
  inMemoryTopicChannelPrefsPort,
} from '@/infra/repos/pgTopicChannelPrefs';
import { createPgStaffUsersPort, inMemoryStaffUsersPort } from '@/infra/repos/pgStaffUsers';
import { pgUserProjectionPort, inMemoryUserProjectionPort } from '@/infra/repos/pgUserProjection';
import {
  createPgUserPasswordCredentialsPort,
  inMemoryUserPasswordCredentialsPort,
} from '@/infra/repos/pgUserPasswordCredentials';
import {
  createPgPasswordLoginProtectionPort,
  inMemoryPasswordLoginProtectionPort,
} from '@/infra/repos/pgPasswordLoginProtection';
import { createPasswordAltchaService } from '@/modules/auth/passwordAltcha';
import {
  createPgEmailPasswordLookupPort,
  inMemoryEmailPasswordLookupPort,
} from '@/infra/repos/pgEmailPasswordLookup';
import {
  createPgEmailOtpPublicPort,
  inMemoryEmailOtpPublicPort,
} from '@/infra/repos/pgEmailOtpPublic';
import { createEmailSetupAccessService } from '@/modules/auth/emailSetupAccess/service';
import { createNoopEmailSetupAccessPort } from '@/modules/auth/emailSetupAccess/noopPort';
import { createPgEmailSetupAccessPort } from '@/infra/repos/pgEmailSetupAccessPort';
import { pgEmailSetupTokensPort } from '@/infra/repos/pgEmailSetupTokens';
import { createEmailSetupTokensService } from '@/modules/auth/emailSetupTokens/service';
import { createEmailSetupFlowService } from '@/modules/auth/emailSetupFlow/service';
import { pgEmailSetupFlowPort } from '@/infra/repos/pgEmailSetupFlowPort';
import { noopEmailSetupFlowPort } from '@/modules/auth/emailSetupFlow/noopPort';
import { pgOAuthBindingsPort } from '@/infra/repos/pgOAuthBindings';
import { inMemoryOAuthBindingsPort } from '@/infra/repos/inMemoryOAuthBindings';
import { pgLoginTokensPort } from '@/infra/repos/pgLoginTokens';
import { inMemoryLoginTokensPort } from '@/infra/repos/inMemoryLoginTokens';
import { pgReferencesPort } from '@/infra/repos/pgReferences';
import { inMemoryReferencesPort } from '@/infra/repos/inMemoryReferences';
import { createPgContentPagesPort, inMemoryContentPagesPort } from '@/infra/repos/pgContentPages';
import {
  createPgContentSectionsPort,
  inMemoryContentSectionsPort,
} from '@/infra/repos/pgContentSections';
import { createPgSupportCommunicationPort } from '@/infra/repos/pgSupportCommunication';
import { inMemorySupportCommunicationPort } from '@/infra/repos/inMemorySupportCommunication';
import { pgIntegratorSupportQuestionOwnershipPort } from '@/infra/repos/pgIntegratorSupportQuestionOwnership';
import { inMemoryIntegratorSupportQuestionOwnershipPort } from '@/infra/repos/inMemoryIntegratorSupportQuestionOwnership';
import { createPatientMessagingService } from '@/modules/messaging/patientMessagingService';
import { createPatientNotificationInboxService } from '@/modules/messaging/patientNotificationInboxService';
import { createDoctorSupportMessagingService } from '@/modules/messaging/doctorSupportMessagingService';
import { createNotifyPatientDoctorReply } from '@/modules/messaging/notifyPatientDoctorReply';
import { notifyDoctorPatientMessage } from '@/modules/messaging/notifyDoctorPatientMessage';
import { notifyDoctorPatientProgramNote } from '@/modules/messaging/notifyDoctorPatientProgramNote';
import { registerAdminIncidentStaffPushDeps } from '@/modules/admin-incidents/adminIncidentStaffPushRuntime';
import { registerOperatorAlertDedupPort } from '@/modules/operator-alerts/operatorAlertRuntime';
import { registerAdminNotificationTargetsPort } from '@/modules/operator-alerts/adminNotificationTargetsRuntime';
import { registerEmptyAudienceReporter } from '@/modules/operator-alerts/emptyAudienceRuntime';
import { emptyAudienceReporter } from '@/app-layer/operator-alerts/reportEmptyNotificationAudience';
import { pgOperatorHealthAlertSentPort } from '@/infra/repos/pgOperatorHealthAlertSent';
import { inMemoryOperatorHealthAlertSentPort } from '@/infra/repos/inMemoryOperatorHealthAlertSent';
import { loadAdminNotificationTargetsFromDb } from '@/infra/repos/pgAdminNotificationTargets';
import { createIntegratorSupportBridge } from '@/modules/messaging/integratorSupportBridge';
import { createSendProgramNoteReply } from '@/modules/messaging/sendProgramNoteReply';
import { resolveProgramNoteReplyContext } from '@/app-layer/messaging/programNoteReplyContext';
import { createPgReminderProjectionPort } from '@/infra/repos/pgReminderProjection';
import { inMemoryReminderProjectionPort } from '@/infra/repos/inMemoryReminderProjection';
import { createPgReminderRulesPort } from '@/infra/repos/pgReminderRules';
import { createInMemoryReminderRulesPort } from '@/infra/repos/inMemoryReminderRules';
import { createPgReminderJournalPort } from '@/infra/repos/pgReminderJournal';
import { createRemindersService } from '@/modules/reminders/service';
import { notifyIntegratorRuleUpdated } from '@/modules/reminders/notifyIntegrator';
import { createPgAppointmentProjectionPort } from '@/infra/repos/pgAppointmentProjection';
import { inMemoryAppointmentProjectionPort } from '@/infra/repos/inMemoryAppointmentProjection';
import { createPgDoctorNotesPort } from '@/infra/repos/pgDoctorNotes';
import { createPgSpecialistTasksPort } from '@/infra/repos/pgSpecialistTasks';
import { inMemorySpecialistTasksPort } from '@/infra/repos/inMemorySpecialistTasks';
import { createSpecialistTasksService } from '@/modules/specialist-tasks/service';
import { prepareSpecialistTaskReminderDeliveries } from '@/modules/specialist-tasks/prepareReminderDeliveries';
import { resolveOperatorHealthDigestWebPushRecipients } from '@/modules/operator-health/prepareOperatorHealthDigestDeliveries';
import {
  emptyGlobalAdminWebPushRecipientsPort,
  type GlobalAdminWebPushRecipientsPort,
} from '@/modules/operator-health/globalAdminWebPushRecipientsPort';
import { createPgGlobalAdminWebPushRecipientsPort } from '@/infra/repos/pgGlobalAdminWebPushRecipients';
import {
  enqueueOperatorHealthDigestDeliveries,
  loadLatestSentOperatorHealthDigestAt,
} from '@/infra/repos/pgOperatorHealthDigestDeliveries';
import type { OperatorHealthDigestReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import { createPgPatientFilesPort } from '@/infra/repos/pgPatientFiles';
import { inMemoryPatientFilesPort } from '@/infra/repos/inMemoryPatientFiles';
import { createPatientFilesService } from '@/modules/patient-files/service';
import { createPgPatientClinicalPort } from '@/infra/repos/pgPatientClinical';
import { inMemoryPatientClinicalPort } from '@/infra/repos/inMemoryPatientClinical';
import { createPatientClinicalService } from '@/modules/patient-clinical/service';
import { createPgPatientComorbiditiesPort } from '@/infra/repos/pgPatientComorbidities';
import { inMemoryPatientComorbiditiesPort } from '@/infra/repos/inMemoryPatientComorbidities';
import { createPatientComorbiditiesService } from '@/modules/patient-comorbidities/service';
import { createPgPatientPaymentsPort } from '@/infra/repos/pgPatientPayments';
import { inMemoryPatientPaymentsPort } from '@/infra/repos/inMemoryPatientPayments';
import { createPatientPaymentsService } from '@/modules/patient-payments/service';
import { noopAcquiringGateway } from '@/infra/repos/noopAcquiringGateway';
import { createRegistryAcquiringGateway } from '@/infra/payments/registryAcquiringGateway';
import { getPaymentProviderAdapter } from '@/infra/payments/paymentProviderRegistry';
import { createPgSaasBillingRepository } from '@/infra/repos/pgSaasBilling';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import { createSaasBillingService } from '@/modules/saas-billing/service';
import { inMemoryDoctorNotesPort } from '@/infra/repos/inMemoryDoctorNotes';
import {
  createPgSystemSettingsPort,
  createPgSystemSettingsWriteUnitOfWork,
  readSaasBillingPaymentProviderValue,
} from '@/infra/repos/pgSystemSettings';
import { inMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import { createSystemSettingsService } from '@/modules/system-settings/service';
import { createPgAppRuntimeSettingsPort } from '@/infra/repos/pgAppRuntimeSettings';
import { inMemoryAppRuntimeSettingsPort } from '@/infra/repos/inMemoryAppRuntimeSettings';
import { createRuntimeConfigProvider } from '@/modules/system-settings/runtimeConfig';
import { createNotifTemplatesService } from '@/modules/notif-templates/notifTemplatesService';
import { createLfkExercisesService } from '@/modules/lfk-exercises/service';
import { pgLfkExercisesPort, pgListExerciseUsageForMediaIds } from '@/infra/repos/pgLfkExercises';
import { pgDoctorCalendarTimezonePort } from '@/infra/repos/pgDoctorCalendarTimezone';
import { inMemoryLfkExercisesPort } from '@/infra/repos/inMemoryLfkExercises';
import { createClinicalTestsService, createTestSetsService } from '@/modules/tests/service';
import { createClinicalTestMeasureKindsService } from '@/modules/tests/measureKindsService';
import { createRecommendationsService } from '@/modules/recommendations/service';
import { createCommentsService } from '@/modules/comments/service';
import { createProgramItemDiscussionService } from '@/modules/program-item-discussion/service';
import { createTreatmentProgramService } from '@/modules/treatment-program/service';
import { createTreatmentProgramInstanceService } from '@/modules/treatment-program/instance-service';
import { snapshotPromoDaysBeforeRefresh } from '@/app-layer/treatment-program/snapshotPromoDaysBeforeRefresh';
import { createTreatmentProgramProgressService } from '@/modules/treatment-program/progress-service';
import { createTreatmentProgramPatientActionService } from '@/modules/treatment-program/patient-program-actions';
import { createCoursesService } from '@/modules/courses/service';
import { pgClinicalTestsPort } from '@/infra/repos/pgClinicalTests';
import { pgClinicalTestMeasureKindsPort } from '@/infra/repos/pgClinicalTestMeasureKinds';
import { inMemoryClinicalTestMeasureKindsPort } from '@/infra/repos/inMemoryClinicalTestMeasureKinds';
import { pgTestSetsPort } from '@/infra/repos/pgTestSets';
import { inMemoryClinicalTestsPort } from '@/infra/repos/inMemoryClinicalTests';
import { inMemoryTestSetsPort } from '@/infra/repos/inMemoryTestSets';
import { pgRecommendationsPort } from '@/infra/repos/pgRecommendations';
import { inMemoryRecommendationsPort } from '@/infra/repos/inMemoryRecommendations';
import { createPgCommentsPort } from '@/infra/repos/pgComments';
import { createInMemoryCommentsPort } from '@/infra/repos/inMemoryComments';
import { createPgTreatmentProgramPort } from '@/infra/repos/pgTreatmentProgram';
import { createInMemoryTreatmentProgramPort } from '@/infra/repos/inMemoryTreatmentProgram';
import { createPgTreatmentProgramItemRefValidationPort } from '@/infra/repos/pgTreatmentProgramItemRefValidation';
import { createInMemoryTreatmentProgramItemRefValidationPort } from '@/infra/repos/inMemoryTreatmentProgramItemRefValidation';
import { createPgTreatmentProgramInstancePort } from '@/infra/repos/pgTreatmentProgramInstance';
import { createInMemoryTreatmentProgramPersistence } from '@/infra/repos/inMemoryTreatmentProgramInstance';
import { createPgTreatmentProgramTestAttemptsPort } from '@/infra/repos/pgTreatmentProgramTestAttempts';
import { createPgProgramActionLogPort } from '@/infra/repos/pgProgramActionLog';
import { createInMemoryProgramActionLogPort } from '@/infra/repos/inMemoryProgramActionLog';
import { createPgProgramItemDiscussionPort } from '@/infra/repos/pgProgramItemDiscussion';
import { createInMemoryProgramItemDiscussionPort } from '@/infra/repos/inMemoryProgramItemDiscussion';
import { createPgPatientDiarySnapshotsPort } from '@/infra/repos/pgPatientDiarySnapshots';
import { createInMemoryPatientDiarySnapshotsPort } from '@/infra/repos/inMemoryPatientDiarySnapshots';
import { createPgTreatmentProgramEventsPort } from '@/infra/repos/pgTreatmentProgramEvents';
import { createPgTreatmentProgramItemSnapshotPort } from '@/infra/repos/pgTreatmentProgramItemSnapshot';
import { createInMemoryTreatmentProgramItemSnapshotPort } from '@/infra/repos/inMemoryTreatmentProgramItemSnapshot';
import { createPgCoursesPort } from '@/infra/repos/pgCourses';
import { createInMemoryCoursesPort } from '@/infra/repos/inMemoryCourses';
import { createLfkTemplatesService } from '@/modules/lfk-templates/service';
import { pgLfkTemplatesPort } from '@/infra/repos/pgLfkTemplates';
import { inMemoryLfkTemplatesPort } from '@/infra/repos/inMemoryLfkTemplates';
import { createLfkAssignmentsService } from '@/modules/lfk-assignments/service';
import type { LfkAssignmentsPort } from '@/modules/lfk-assignments/ports';
import { pgLfkAssignmentsPort } from '@/infra/repos/pgLfkAssignments';
import { checkDbHealth } from '@/infra/db/client';
import { pgOperatorHealthReadPort } from '@/infra/repos/pgOperatorHealthRead';
import { inMemoryOperatorHealthReadPort } from '@/infra/repos/inMemoryOperatorHealthRead';
import { inMemorySaasIsolationDiagnosticsPort } from '@/infra/repos/inMemorySaasIsolationDiagnostics';
import { runtimeSaasIsolationDiagnostics } from '@/infra/saasIsolationReporterRuntime';
import { createSaasIsolationDiagnosticsService } from '@/modules/operator-health/saasIsolationDiagnostics';
import { pgOperatorHealthDigestReadPort } from '@/infra/repos/pgOperatorHealthDigestRead';
import { inMemoryOperatorHealthDigestReadPort } from '@/infra/repos/inMemoryOperatorHealthDigestRead';
import { pgOperatorHealthWritePort } from '@/infra/repos/pgOperatorHealthWrite';
import { inMemoryOperatorHealthWritePort } from '@/infra/repos/inMemoryOperatorHealthWrite';
import { pgHealthFailureArchivePort } from '@/infra/repos/pgHealthFailureArchive';
import { inMemoryHealthFailureArchivePort } from '@/infra/repos/inMemoryHealthFailureArchive';
import { createHealthFailureArchiveService } from '@/modules/operator-health/healthFailureArchiveService';
import { createNotificationDeliveryService } from '@/modules/notification-delivery/service';
import { pgNotificationDeliveryAttemptsPort } from '@/infra/repos/pgNotificationDeliveryAttempts';
import { inMemoryNotificationDeliveryAttemptsPort } from '@/infra/repos/inMemoryNotificationDeliveryAttempts';
import {
  env,
  integratorWebhookSecret,
  isS3MediaEnabled,
  webappReposAreInMemory,
} from '@/config/env';
import { reconcileDbRoleWithEnvRole, resolveRoleFromEnv } from '@/modules/auth/envRole';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { getDeliveryTargetsForIntegrator } from '@/modules/integrator/deliveryTargetsApi';
import { createPatientBookingService } from '@/modules/patient-booking/service';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import { createAppointmentPaymentConfirmedHandler } from '@/app-layer/booking/appointmentPaymentConfirmedHandler';
import { loadBookingLifecycleNotificationsFromSystemSettings } from '@/modules/booking-notifications/settings';
import { pgPatientBookingsPort } from '@/infra/repos/pgPatientBookings';
import { inMemoryPatientBookingsPort } from '@/infra/repos/inMemoryPatientBookings';
import { createPgPatientMaintenanceHistoryPort } from '@/infra/repos/pgPatientMaintenanceHistory';
import { inMemoryPatientMaintenanceHistoryPort } from '@/infra/repos/inMemoryPatientMaintenanceHistory';
import { createPatientMaintenanceHistoryService } from '@/modules/patient-booking/maintenanceHistory';
import { createPgClinicDirectoryPort } from '@/infra/repos/pgClinicDirectory';
import { createClinicDirectoryService } from '@/modules/clinic-directory/service';
import { createPgOrganizationMembershipPort } from '@/infra/repos/pgOrganizationMembership';
import { createInMemoryOrganizationMembershipPort } from '@/infra/repos/inMemoryOrganizationMembership';
import { createOrganizationMembershipService } from '@/modules/organization-membership/service';
import { createPgOrgEntitlementsPort } from '@/infra/repos/pgOrgEntitlements';
import { assertMechanicWriteClearance } from '@/app-layer/entitlements/mechanicWriteClearance';
import {
  wrapContentPagesPortWithWriteClearance,
  wrapContentSectionsPortWithWriteClearance,
} from '@/app-layer/content/contentWriteClearancePorts';
import { wrapSystemSettingsServiceWithPatientHomeWriteClearance } from '@/app-layer/patient-home/patientHomeSettingsWriteClearance';
import { createInMemoryOrgEntitlementsPort } from '@/infra/repos/inMemoryOrgEntitlements';
import { createPgPlatformEntitlementsPort } from '@/infra/repos/pgPlatformEntitlements';
import { createInMemoryPlatformEntitlementsPort } from '@/infra/repos/inMemoryPlatformEntitlements';
import {
  createPlatformEntitlementsService,
  resolveMechanicAccess,
  resolveOwnTariffTransition,
} from '@/modules/org-entitlements/service';
import { createPgOrgBrandingPort } from '@/infra/repos/pgOrgBranding';
import { createInMemoryOrgBrandingPort } from '@/infra/repos/inMemoryOrgBranding';
import { createOrgBrandingService } from '@/modules/org-branding/service';
import { createPgPatientOrganizationPort } from '@/infra/repos/pgPatientOrganization';
import { createPatientOrganizationService } from '@/modules/patient-organization/service';
import { createPgOrganizationProvisioningPort } from '@/infra/repos/pgOrganizationProvisioning';
import { createInMemoryOrganizationProvisioningPort } from '@/infra/repos/inMemoryOrganizationProvisioning';
import { createOrganizationProvisioningService } from '@/modules/organization-provisioning/service';
import { createPgStaffSecurityPort } from '@/infra/repos/pgStaffSecurity';
import { createInMemoryStaffSecurityPort } from '@/infra/repos/inMemoryStaffSecurity';
import { createStaffSecurityService } from '@/modules/staff-security/service';
import { createLazyStaffSecurityCryptoFromEnv } from '@/modules/staff-security/crypto';
import { createPgOrganizationInvitesPort } from '@/infra/repos/pgOrganizationInvites';
import { createInMemoryOrganizationInvitesPort } from '@/infra/repos/inMemoryOrganizationInvites';
import { createOrganizationInvitesService } from '@/modules/organization-invites/service';
import { createPgPatientInvitesPort } from '@/infra/repos/pgPatientInvites';
import { createInMemoryPatientInvitesPort } from '@/infra/repos/inMemoryPatientInvites';
import { createPatientInvitesService } from '@/modules/patient-invites/service';
import { createClinicSeatsService } from '@/modules/clinic-seats/service';
import { createDoctorWorkspaceDirectoryService } from '@/modules/doctor-workspace/service';
import { createPgBookingEnginePort } from '@/infra/repos/pgBookingEngine';
import { createBookingEngineService } from '@/modules/booking-engine/service';
import { createPgBookingSchedulingPort } from '@/infra/repos/pgBookingScheduling';
import { createBookingSchedulingService } from '@/modules/booking-scheduling/service';
import { createBookingCalendarService } from '@/modules/booking-calendar/service';
import { createPgBookingCalendarPort } from '@/infra/repos/pgBookingCalendar';
import { createClientHistoryService } from '@/modules/client-history/service';
import { createPgClientHistoryPort } from '@/infra/repos/pgClientHistory';
import { inMemoryClientHistoryPort } from '@/infra/repos/inMemoryClientHistory';
import { createPgBookingFormPort } from '@/infra/repos/pgBookingForm';
import { createBookingFormService } from '@/modules/booking-form/service';
import { createPgPatientMergeCandidatePort } from '@/infra/repos/pgPatientMergeCandidate';
import { createPatientMergeCandidateService } from '@/modules/patient-merge-candidate/service';
import { createPgPlatformUserContactsPort } from '@/infra/repos/pgPlatformUserContacts';
import { createInMemoryPlatformUserContactsPort } from '@/infra/repos/inMemoryPlatformUserContacts';
import { createPlatformUserContactsService } from '@/modules/platform-user-contacts/service';
import { toDoctorSupplementaryContacts } from '@/modules/platform-user-contacts/bookingContactUpsert';
import { createPgBookingPoliciesPort } from '@/infra/repos/pgBookingPolicies';
import { createBookingPoliciesService } from '@/modules/booking-policies/service';
import { createPgBookingAppointmentLifecyclePort } from '@/infra/repos/pgBookingAppointmentLifecycle';
import { createBookingAppointmentLifecycleService } from '@/modules/booking-appointment-lifecycle/service';
import { createPgPaymentsPort } from '@/infra/repos/pgPayments';
import { createPgPaymentCaptureUnitOfWork } from '@/infra/repos/pgPaymentCaptureUnitOfWork';
import { createPaymentsService, createPaymentsConfigReader } from '@/modules/payments/service';
import { createPgMembershipsPort } from '@/infra/repos/pgMemberships';
import { createMembershipsService } from '@/modules/memberships/service';
import { createPgEntitlementsPort } from '@/infra/repos/pgEntitlements';
import { createEntitlementsService } from '@/modules/entitlements/service';
import { wrapBookingEngineMembershipHooks } from '@/app-layer/booking/wrapBookingEngineMembershipHooks';
import { createPgPatientHomeBlocksPort } from '@/infra/repos/pgPatientHomeBlocks';
import { createInMemoryPatientHomeBlocksPort } from '@/infra/repos/inMemoryPatientHomeBlocks';
import { createPgPatientHomeLegacyContentPort } from '@/infra/repos/pgPatientHomeLegacyContent';
import { createInMemoryPatientHomeLegacyContentPort } from '@/infra/repos/inMemoryPatientHomeLegacyContent';
import { createPgPatientPracticeCompletionsPort } from '@/infra/repos/pgPatientPracticeCompletions';
import { createInMemoryPatientPracticeCompletionsPort } from '@/infra/repos/inMemoryPatientPracticeCompletions';
import { createPgPatientDailyWarmupPresentationPort } from '@/infra/repos/pgPatientDailyWarmupPresentation';
import { createInMemoryPatientDailyWarmupPresentationPort } from '@/infra/repos/inMemoryPatientDailyWarmupPresentation';
import { createPgPatientDailyWarmupVideoViewPort } from '@/infra/repos/pgPatientDailyWarmupVideoView';
import { createInMemoryPatientDailyWarmupVideoViewPort } from '@/infra/repos/inMemoryPatientDailyWarmupVideoView';
import { createPgMaterialRatingPort } from '@/infra/repos/pgMaterialRating';
import { createInMemoryMaterialRatingPort } from '@/infra/repos/inMemoryMaterialRating';
import { createMaterialRatingService } from '@/modules/material-rating/service';
import { createPgMaterialRatingFeedbackPort } from '@/infra/repos/pgMaterialRatingFeedback';
import { createInMemoryMaterialRatingFeedbackPort } from '@/infra/repos/inMemoryMaterialRatingFeedback';
import { createMaterialRatingFeedbackService } from '@/modules/material-rating-feedback/service';
import { isContentPageInDailyWarmupBlock } from '@/modules/patient-home/todayConfig';
import { createPgWarmupFeelingCompletionPort } from '@/infra/repos/pgWarmupFeelingCompletion';
import { createInMemoryWarmupFeelingCompletionPort } from '@/infra/repos/inMemoryWarmupFeelingCompletion';
import { createPatientHomeBlocksService } from '@/modules/patient-home/service';
import { createPatientPracticeService } from '@/modules/patient-practice/service';
import { createPatientMoodService } from '@/modules/patient-mood/service';

const inMemoryRepos = webappReposAreInMemory();

const adminPlatformUserStatsPort = !inMemoryRepos
  ? createPgAdminPlatformUserStatsPort()
  : createInMemoryAdminPlatformUserStatsPort();
const adminPlatformUserStats = createAdminPlatformUserStatsService(adminPlatformUserStatsPort);

const productAnalyticsPort = !inMemoryRepos
  ? createPgProductAnalyticsPort()
  : createInMemoryProductAnalyticsPort();
const productAnalytics = createProductAnalyticsService(productAnalyticsPort);

const operatorHealthReadPort = !inMemoryRepos
  ? pgOperatorHealthReadPort
  : inMemoryOperatorHealthReadPort;
const saasIsolationDiagnostics = !inMemoryRepos
  ? runtimeSaasIsolationDiagnostics
  : createSaasIsolationDiagnosticsService(inMemorySaasIsolationDiagnosticsPort);
const operatorHealthDigestReadPort = !inMemoryRepos
  ? pgOperatorHealthDigestReadPort
  : inMemoryOperatorHealthDigestReadPort;
const operatorHealthWritePort = !inMemoryRepos
  ? pgOperatorHealthWritePort
  : inMemoryOperatorHealthWritePort;
const healthFailureArchivePort = !inMemoryRepos
  ? pgHealthFailureArchivePort
  : inMemoryHealthFailureArchivePort;
const healthFailureArchive = createHealthFailureArchiveService(healthFailureArchivePort);
const notificationDeliveryAttemptsPort = !inMemoryRepos
  ? pgNotificationDeliveryAttemptsPort
  : inMemoryNotificationDeliveryAttemptsPort;
const notificationDelivery = createNotificationDeliveryService(notificationDeliveryAttemptsPort);

const symptomDiaryPort = !inMemoryRepos ? pgSymptomDiaryPort : inMemorySymptomDiaryPort;
const lfkDiaryPort = !inMemoryRepos ? pgLfkDiaryPort : inMemoryLfkDiaryPort;
const channelPreferencesPort = !inMemoryRepos
  ? pgChannelPreferencesPort
  : inMemoryChannelPreferencesPort;
const webPushSubscriptionsPort = !inMemoryRepos
  ? createPgWebPushSubscriptionsPort()
  : inMemoryWebPushSubscriptionsPort;
const reminderTransactionalEmailCooldownPort = !inMemoryRepos
  ? createPgReminderTransactionalEmailCooldownPort()
  : createNoOpReminderTransactionalEmailCooldownPort();
const topicChannelPrefsPort = !inMemoryRepos
  ? createPgTopicChannelPrefsPort()
  : inMemoryTopicChannelPrefsPort;
const staffUsersPort = !inMemoryRepos ? createPgStaffUsersPort() : inMemoryStaffUsersPort;
const globalAdminWebPushRecipientsPort: GlobalAdminWebPushRecipientsPort = !inMemoryRepos
  ? createPgGlobalAdminWebPushRecipientsPort()
  : emptyGlobalAdminWebPushRecipientsPort;
const patientNotificationTopicsPort = !inMemoryRepos
  ? createPgPatientNotificationTopicsPort()
  : inMemoryPatientNotificationTopicsPort;
const userByPhonePort = !inMemoryRepos ? pgUserByPhonePort : inMemoryUserByPhonePort;
const passwordLoginProtectionPort = !inMemoryRepos
  ? createPgPasswordLoginProtectionPort()
  : inMemoryPasswordLoginProtectionPort;
const userPasswordCredentialsPort = !inMemoryRepos
  ? createPgUserPasswordCredentialsPort(passwordLoginProtectionPort)
  : inMemoryUserPasswordCredentialsPort;
const passwordAltchaService = createPasswordAltchaService(passwordLoginProtectionPort);
const emailPasswordLookupPort = !inMemoryRepos
  ? createPgEmailPasswordLookupPort()
  : inMemoryEmailPasswordLookupPort;
const emailOtpPublicDbPort = !inMemoryRepos
  ? createPgEmailOtpPublicPort()
  : inMemoryEmailOtpPublicPort;
const oauthBindingsPort = !inMemoryRepos ? pgOAuthBindingsPort : inMemoryOAuthBindingsPort;
const loginTokensPort = !inMemoryRepos ? pgLoginTokensPort : inMemoryLoginTokensPort;
const identityResolutionPort = !inMemoryRepos
  ? pgIdentityResolutionPort
  : inMemoryIdentityResolutionPort;
const doctorClientsPort = !inMemoryRepos ? createPgDoctorClientsPort() : inMemoryDoctorClientsPort;
const challengeStore = !inMemoryRepos ? createPgPhoneChallengeStore() : inMemoryPhoneChallengeStore;
const phoneMessengerBindPort = !inMemoryRepos ? createPgPhoneMessengerBindPort() : undefined;
registerPhoneMessengerBindPort(phoneMessengerBindPort ?? null);
const messageLogPort = !inMemoryRepos ? createPgMessageLogPort() : inMemoryMessageLogPort;
const broadcastAuditPort = !inMemoryRepos
  ? createPgBroadcastAuditPort()
  : inMemoryBroadcastAuditPort;
const doctorBroadcastDeliveryCommitPort = !inMemoryRepos
  ? createPgDoctorBroadcastDeliveryCommitPort()
  : createInMemoryDoctorBroadcastDeliveryCommitPort();
const patientBroadcastsPort = !inMemoryRepos
  ? createPgPatientBroadcastsPort()
  : inMemoryPatientBroadcastsPort;
const broadcastDraftPort = !inMemoryRepos
  ? createPgBroadcastDraftPort()
  : createInMemoryBroadcastDraftPort();
const broadcastChannelCountsPort = !inMemoryRepos
  ? createPgBroadcastChannelCountsPort()
  : createInMemoryBroadcastChannelCountsPort();
const broadcastEmailRecipientsPort = !inMemoryRepos
  ? createPgBroadcastEmailRecipientsPort()
  : createInMemoryBroadcastEmailRecipientsPort();
const doctorMotivationQuotesEditorPort = !inMemoryRepos
  ? createPgDoctorMotivationQuotesEditorPort()
  : inMemoryDoctorMotivationQuotesEditorPort;
const userProjectionPort = !inMemoryRepos ? pgUserProjectionPort : inMemoryUserProjectionPort;
/** D15b/3: the identity port — see `modules/identity/ports.ts` for what it aggregates and why. */
const identityPort = assembleIdentityPort({
  projection: userProjectionPort,
  session: userByPhonePort,
  channelResolution: identityResolutionPort,
  clients: doctorClientsPort,
});
const emailSetupAccessService = createEmailSetupAccessService(
  !inMemoryRepos
    ? createPgEmailSetupAccessPort(pgEmailSetupTokensPort)
    : createNoopEmailSetupAccessPort(),
);
const emailSetupTokensService = createEmailSetupTokensService(pgEmailSetupTokensPort);
const emailSetupFlowService = createEmailSetupFlowService({
  tokens: emailSetupTokensService,
  flowPort: !inMemoryRepos ? pgEmailSetupFlowPort : noopEmailSetupFlowPort,
  emailSetupAccess: emailSetupAccessService,
});
const supportCommunicationPort = !inMemoryRepos
  ? createPgSupportCommunicationPort()
  : inMemorySupportCommunicationPort;
const integratorSupportQuestionOwnershipPort = !inMemoryRepos
  ? pgIntegratorSupportQuestionOwnershipPort
  : inMemoryIntegratorSupportQuestionOwnershipPort;
const reminderProjectionPort = !inMemoryRepos
  ? createPgReminderProjectionPort()
  : inMemoryReminderProjectionPort;
const reminderRulesPort = !inMemoryRepos
  ? createPgReminderRulesPort()
  : createInMemoryReminderRulesPort();
const reminderJournalPort = !inMemoryRepos ? createPgReminderJournalPort() : undefined;
const appointmentProjectionPort = !inMemoryRepos
  ? createPgAppointmentProjectionPort()
  : inMemoryAppointmentProjectionPort;
const patientBookingsPort = !inMemoryRepos ? pgPatientBookingsPort : inMemoryPatientBookingsPort;
const patientMaintenanceHistoryService = createPatientMaintenanceHistoryService(
  !inMemoryRepos ? createPgPatientMaintenanceHistoryPort() : inMemoryPatientMaintenanceHistoryPort,
);
const organizationMembershipPort = !inMemoryRepos
  ? createPgOrganizationMembershipPort()
  : createInMemoryOrganizationMembershipPort();
const organizationMembershipService = createOrganizationMembershipService({
  membershipPort: organizationMembershipPort,
});
const orgEntitlementsPort = !inMemoryRepos
  ? createPgOrgEntitlementsPort()
  : createInMemoryOrgEntitlementsPort();
/**
 * UX-05 B1: organization brand publication. Paid additions resolve through the SAME entitlement
 * resolver as every other mechanic; core organization context is never gated by it.
 */
const orgBrandingService = createOrgBrandingService({
  port: !inMemoryRepos ? createPgOrgBrandingPort() : createInMemoryOrgBrandingPort(),
  assertWriteClearance: assertMechanicWriteClearance,
  resolveBrandingAccess: (organizationId: string) =>
    resolveMechanicAccess(orgEntitlementsPort, organizationId, 'branding'),
});
const patientOrganizationService = !inMemoryRepos
  ? createPatientOrganizationService({
      port: createPgPatientOrganizationPort(),
      assertWriteClearance: assertMechanicWriteClearance,
    })
  : null;
const organizationProvisioningPort = !inMemoryRepos
  ? createPgOrganizationProvisioningPort()
  : createInMemoryOrganizationProvisioningPort();
const organizationProvisioningService = createOrganizationProvisioningService({
  provisioningPort: organizationProvisioningPort,
});
const staffSecurityService = createStaffSecurityService(
  !inMemoryRepos ? createPgStaffSecurityPort() : createInMemoryStaffSecurityPort(),
  createLazyStaffSecurityCryptoFromEnv(() => env.STAFF_SECURITY_KEYRING_JSON),
);
const passwordChangeService = createPasswordChangeService({
  credentials: userPasswordCredentialsPort,
  users: userByPhonePort,
  staffSecurity: staffSecurityService,
  hashPassword: hashPin,
});
const organizationInvitesPort = !inMemoryRepos
  ? createPgOrganizationInvitesPort()
  : createInMemoryOrganizationInvitesPort();
const organizationInvitesService = createOrganizationInvitesService({
  invitesPort: organizationInvitesPort,
  assertWriteClearance: assertMechanicWriteClearance,
});
const saasBillingRepository = !inMemoryRepos
  ? createPgSaasBillingRepository()
  : createInMemorySaasBillingRepository();
const patientInvitesPort = !inMemoryRepos
  ? createPgPatientInvitesPort()
  : createInMemoryPatientInvitesPort();
const patientInvitesService = createPatientInvitesService({ port: patientInvitesPort });
const doctorWorkspaceDirectoryService = createDoctorWorkspaceDirectoryService({
  membershipPort: organizationMembershipPort,
});
const clinicSeatsService = createClinicSeatsService({
  membershipPort: organizationMembershipPort,
  invitesPort: organizationInvitesPort,
  orgEntitlementsPort,
  billingPort: saasBillingRepository,
});
const clinicDirectoryService = !inMemoryRepos
  ? createClinicDirectoryService(createPgClinicDirectoryPort())
  : null;
const bookingEngineCorePort = !inMemoryRepos ? createPgBookingEnginePort() : null;
const doctorAppointmentsCanonicalPort =
  !inMemoryRepos && bookingEngineCorePort
    ? createPgDoctorCanonicalAppointmentsPort(() =>
        bookingEngineCorePort.getDefaultOrganizationId(),
      )
    : inMemoryDoctorAppointmentsPort;
const bookingEnginePort = bookingEngineCorePort;
const bookingEngineService = bookingEnginePort
  ? createBookingEngineService(bookingEnginePort, {
      getLocationPaletteSetting: () =>
        systemSettingsService
          .getSetting('booking_location_default_palette', 'admin', { organizationId: null })
          .then((row) => row?.valueJson ?? null),
      assertWriteClearance: assertMechanicWriteClearance,
    })
  : null;
const bookingSchedulingPort =
  bookingEngineCorePort && !inMemoryRepos
    ? createPgBookingSchedulingPort(() => bookingEngineCorePort.getDefaultOrganizationId())
    : null;
const bookingSchedulingService = bookingSchedulingPort
  ? createBookingSchedulingService(bookingSchedulingPort)
  : null;
const bookingCalendarPort = !inMemoryRepos ? createPgBookingCalendarPort() : null;
const bookingCalendarService =
  bookingCalendarPort && bookingSchedulingPort
    ? createBookingCalendarService({
        calendarPort: bookingCalendarPort,
        listScheduleBlocks: (input) => bookingSchedulingPort.listScheduleBlocks(input),
        schedulingPort: bookingSchedulingPort,
        resolveShowWorkingHours: async () => {
          if (inMemoryRepos) return true;
          const row = await systemSettingsService.getSetting(
            'booking_calendar_show_working_hours',
            'admin',
          );
          const raw =
            row?.valueJson && typeof row.valueJson === 'object'
              ? (row.valueJson as { value?: unknown }).value
              : null;
          if (typeof raw === 'boolean') return raw;
          if (raw === 'true' || raw === 1) return true;
          if (raw === 'false' || raw === 0) return false;
          return true;
        },
      })
    : null;
const clientHistoryPort = !inMemoryRepos ? createPgClientHistoryPort() : inMemoryClientHistoryPort;
const clientHistoryService = createClientHistoryService(clientHistoryPort);
const bookingFormPort = !inMemoryRepos ? createPgBookingFormPort() : null;
const bookingFormService = bookingFormPort ? createBookingFormService(bookingFormPort) : null;
const patientMergeCandidatePort = !inMemoryRepos ? createPgPatientMergeCandidatePort() : null;
const patientMergeCandidateService = patientMergeCandidatePort
  ? createPatientMergeCandidateService(patientMergeCandidatePort)
  : null;
const platformUserContactsPort = !inMemoryRepos
  ? createPgPlatformUserContactsPort()
  : createInMemoryPlatformUserContactsPort();
const platformUserContactsService = createPlatformUserContactsService(platformUserContactsPort);
const bookingPoliciesPort = !inMemoryRepos ? createPgBookingPoliciesPort() : null;
const bookingPoliciesService = bookingPoliciesPort
  ? createBookingPoliciesService(bookingPoliciesPort)
  : null;
const bookingAppointmentLifecyclePort = !inMemoryRepos
  ? createPgBookingAppointmentLifecyclePort()
  : null;
const bookingAppointmentLifecycleService =
  bookingAppointmentLifecyclePort && bookingPoliciesService
    ? createBookingAppointmentLifecycleService({
        lifecyclePort: bookingAppointmentLifecyclePort,
        policies: bookingPoliciesService,
      })
    : null;
const contentPagesPort = !inMemoryRepos ? createPgContentPagesPort() : inMemoryContentPagesPort;
const contentSectionsPort = !inMemoryRepos
  ? createPgContentSectionsPort()
  : inMemoryContentSectionsPort;
const contentPagesPortForDeps = wrapContentPagesPortWithWriteClearance(
  contentPagesPort,
  contentSectionsPort,
  assertMechanicWriteClearance,
);
const contentSectionsPortForDeps = wrapContentSectionsPortWithWriteClearance(
  contentSectionsPort,
  assertMechanicWriteClearance,
);
const remindersService = createRemindersService(reminderRulesPort, {
  notifyIntegrator: notifyIntegratorRuleUpdated,
  journal: reminderJournalPort,
  webPushSubscriptions: webPushSubscriptionsPort,
  contentSections: contentSectionsPort,
});
const mediaStoragePort =
  !inMemoryRepos && isS3MediaEnabled(env) ? createS3MediaStoragePort() : mockMediaStoragePort;
const referencesPort = !inMemoryRepos ? pgReferencesPort : inMemoryReferencesPort;
const doctorNotesPort = !inMemoryRepos ? createPgDoctorNotesPort() : inMemoryDoctorNotesPort;
const doctorNotesService = createDoctorNotesService(doctorNotesPort);
const patientFilesPort = !inMemoryRepos ? createPgPatientFilesPort() : inMemoryPatientFilesPort;
const patientFilesService = createPatientFilesService({
  patientFilesPort,
  assertWriteClearance: assertMechanicWriteClearance,
});
const patientClinicalPort = !inMemoryRepos
  ? createPgPatientClinicalPort()
  : inMemoryPatientClinicalPort;
const patientClinicalService = createPatientClinicalService({ patientClinicalPort });

const patientComorbiditiesPort = !inMemoryRepos
  ? createPgPatientComorbiditiesPort()
  : inMemoryPatientComorbiditiesPort;
const patientComorbiditiesService = createPatientComorbiditiesService({ patientComorbiditiesPort });

const patientPaymentsPort = !inMemoryRepos
  ? createPgPatientPaymentsPort()
  : inMemoryPatientPaymentsPort;
const patientPaymentsService = createPatientPaymentsService({ patientPaymentsPort });
// acquiringGateway is initialized below, after systemSettingsService + paymentsConfigReader are set up.

const systemSettingsPort = !inMemoryRepos
  ? createPgSystemSettingsPort()
  : inMemorySystemSettingsPort;
const appRuntimeSettingsPort = !inMemoryRepos
  ? createPgAppRuntimeSettingsPort()
  : inMemoryAppRuntimeSettingsPort;
const systemSettingsServiceBase = createSystemSettingsService(systemSettingsPort, {
  runtimeRepository: appRuntimeSettingsPort,
  writeUnitOfWork: !inMemoryRepos ? createPgSystemSettingsWriteUnitOfWork() : undefined,
});
const systemSettingsService = wrapSystemSettingsServiceWithPatientHomeWriteClearance(
  systemSettingsServiceBase,
  assertMechanicWriteClearance,
);
const specialistTasksPort = !inMemoryRepos
  ? createPgSpecialistTasksPort((task) =>
      prepareSpecialistTaskReminderDeliveries(task, {
        topicChannelPrefs: topicChannelPrefsPort,
        channelPreferences: channelPreferencesPort,
        webPushSubscriptions: webPushSubscriptionsPort,
        systemSettings: systemSettingsService,
        getChannelBindings: loadPlatformUserChannelBindings,
        getProfileEmail: async (platformUserId) => {
          const fields = await userProjectionPort.getProfileEmailFields(platformUserId);
          return fields?.email?.trim() || null;
        },
        getProfileEmailVerified: async (platformUserId) => {
          const fields = await userProjectionPort.getProfileEmailFields(platformUserId);
          return Boolean(fields?.emailVerifiedAt);
        },
        resolvePatientDisplayName: async (patientUserId) => {
          const identity = await doctorClientsPort.getClientIdentity(patientUserId);
          return identity?.displayName?.trim() || null;
        },
      }),
    )
  : inMemorySpecialistTasksPort;
const specialistTasksService = createSpecialistTasksService(specialistTasksPort, {
  assertWriteClearance: assertMechanicWriteClearance,
});
let platformEntitlementsService!: ReturnType<typeof createPlatformEntitlementsService>;
const saasBillingService = createSaasBillingService({
  repository: saasBillingRepository,
  settings: {
    getSaasBillingPaymentProviderValue: () =>
      inMemoryRepos
        ? systemSettingsService
            .getSetting('saas_billing_payment_provider', 'admin')
            .then((row) => row?.valueJson ?? null)
        : readSaasBillingPaymentProviderValue(),
  },
  resolvePaymentProvider: getPaymentProviderAdapter,
  getTariffTransition: (organizationId, tariffId) =>
    resolveOwnTariffTransition(orgEntitlementsPort, organizationId, tariffId),
});
platformEntitlementsService = createPlatformEntitlementsService(
  !inMemoryRepos
    ? createPgPlatformEntitlementsPort({
        assignManualTariff: saasBillingService.assignManualTariff,
      })
    : createInMemoryPlatformEntitlementsPort(),
);
const runtimeConfig = createRuntimeConfigProvider(appRuntimeSettingsPort);
const notifTemplatesService = createNotifTemplatesService(systemSettingsService, {
  assertWriteClearance: assertMechanicWriteClearance,
});
const doctorAppointmentsPort = doctorAppointmentsCanonicalPort;
const doctorAnalyticsMetricAccountsPort =
  !inMemoryRepos && bookingEngineCorePort
    ? createPgDoctorAnalyticsMetricAccountsPort(() =>
        bookingEngineCorePort.getDefaultOrganizationId(),
      )
    : inMemoryDoctorAnalyticsMetricAccountsPort;
const membershipsPort = !inMemoryRepos ? createPgMembershipsPort() : null;
const entitlementsPort = !inMemoryRepos ? createPgEntitlementsPort() : null;
const entitlementsService = entitlementsPort
  ? createEntitlementsService({ port: entitlementsPort })
  : null;
const resolveMembershipServiceTitle = bookingEngineService
  ? async (serviceId: string) => {
      const svc = await bookingEngineService.services.getService(serviceId);
      return svc?.title ?? null;
    }
  : undefined;

const membershipsService =
  membershipsPort && bookingEngineService
    ? createMembershipsService({
        port: membershipsPort,
        payments: null,
        bookingEngine: bookingEngineService,
        resolveServiceTitle: resolveMembershipServiceTitle,
        assertWriteClearance: assertMechanicWriteClearance,
      })
    : null;

const paymentsPort = !inMemoryRepos ? createPgPaymentsPort() : null;
const bookingSyncPortForPayments = createBookingSyncPort();
const onAppointmentPaymentConfirmed = bookingEngineService
  ? createAppointmentPaymentConfirmedHandler({
      patientBookings: patientBookingsPort,
      bookingEngine: bookingEngineService,
      loadNotificationSettings: () =>
        loadBookingLifecycleNotificationsFromSystemSettings((key, scope) =>
          systemSettingsService.getSetting(key, scope),
        ),
      bookingSync: bookingSyncPortForPayments,
    })
  : undefined;
const paymentsService =
  paymentsPort && bookingEngineService
    ? createPaymentsService({
        port: paymentsPort,
        config: createPaymentsConfigReader((key, organizationId) =>
          systemSettingsService.getSetting(
            key,
            'admin',
            organizationId ? { organizationId } : undefined,
          ),
        ),
        captureUnitOfWork: createPgPaymentCaptureUnitOfWork(),
        bookingEngine: bookingEngineService,
        canCreatePaymentIntent: async (organizationId) => {
          const access = await orgEntitlementsPort.resolveMechanicAccess(
            organizationId,
            'payments',
          );
          return access.state === 'full_access' || access.state === 'grace';
        },
        onPackagePaymentCaptured: membershipsService
          ? async ({ patientPackageId, paymentId, organizationId }) => {
              await membershipsService.activatePatientPackage(
                patientPackageId,
                organizationId,
                paymentId,
              );
            }
          : undefined,
        onAppointmentPaymentConfirmed,
        syncServicePrepaymentApplicable: async (serviceId, applicable) => {
          const svc = await bookingEngineService.services.getService(serviceId);
          if (!svc) return;
          await bookingEngineService.services.upsertService({
            organizationId: svc.organizationId,
            id: svc.id,
            title: svc.title,
            description: svc.description,
            durationMinutes: svc.durationMinutes,
            bufferAfterMinutes: svc.bufferAfterMinutes,
            priceMinor: svc.priceMinor,
            isActive: svc.isActive,
            prepaymentApplicable: applicable,
            usableInPackages: svc.usableInPackages,
            onlinePaymentApplicable: svc.onlinePaymentApplicable,
            publicWidgetVisible: svc.publicWidgetVisible,
            adminManualOnly: svc.adminManualOnly,
            sortOrder: svc.sortOrder,
          });
        },
      })
    : null;

// Registry-backed acquiring gateway: delegates to the same PaymentProviderPort adapters
// used by booking payments, sharing system_settings.booking_payment_providers as config.
// Falls back to noopAcquiringGateway when repos are in-memory (test mode).
const acquiringGateway = !inMemoryRepos
  ? createRegistryAcquiringGateway({
      getConfig: () =>
        createPaymentsConfigReader((key, organizationId) =>
          systemSettingsService.getSetting(
            key,
            'admin',
            organizationId ? { organizationId } : undefined,
          ),
        ).getBookingPaymentSettings(),
    })
  : noopAcquiringGateway;

const refreshPackageCalendarForAppointment = bookingEngineService
  ? async (appointmentId: string) => {
      const { syncPackageCalendarAfterUsageChange } =
        await import('@/app-layer/booking/emitPackageCalendarSync');
      await syncPackageCalendarAfterUsageChange({
        appointmentId,
        bookingEngine: bookingEngineService,
        resolveBookingRow: (id) => patientBookingsPort.getByCanonicalAppointmentId(id),
      });
    }
  : undefined;

const membershipsServiceResolved =
  membershipsPort && bookingEngineService && paymentsService
    ? createMembershipsService({
        port: membershipsPort,
        payments: paymentsService,
        bookingEngine: bookingEngineService,
        resolveServiceTitle: resolveMembershipServiceTitle,
        refreshPackageCalendar: refreshPackageCalendarForAppointment,
        assertWriteClearance: assertMechanicWriteClearance,
      })
    : membershipsService;

if (bookingEngineService && membershipsServiceResolved) {
  wrapBookingEngineMembershipHooks(bookingEngineService, membershipsServiceResolved);
}

let patientBookingService: ReturnType<typeof createPatientBookingService>;

const lfkExercisesPort = !inMemoryRepos ? pgLfkExercisesPort : inMemoryLfkExercisesPort;
const lfkExercisesService = createLfkExercisesService(lfkExercisesPort);

const clinicalTestsPort = !inMemoryRepos ? pgClinicalTestsPort : inMemoryClinicalTestsPort;
const clinicalTestMeasureKindsPort = !inMemoryRepos
  ? pgClinicalTestMeasureKindsPort
  : inMemoryClinicalTestMeasureKindsPort;
const clinicalTestMeasureKindsService = createClinicalTestMeasureKindsService(
  clinicalTestMeasureKindsPort,
);
const testSetsPort = !inMemoryRepos ? pgTestSetsPort : inMemoryTestSetsPort;
const recommendationsPort = !inMemoryRepos ? pgRecommendationsPort : inMemoryRecommendationsPort;
const commentsPort = !inMemoryRepos ? createPgCommentsPort() : createInMemoryCommentsPort();

const clinicalTestsService = createClinicalTestsService(clinicalTestsPort, referencesPort);
const testSetsService = createTestSetsService(testSetsPort, clinicalTestsPort);
const recommendationsService = createRecommendationsService(recommendationsPort, referencesPort);
const commentsService = createCommentsService(commentsPort);

const treatmentProgramPort = !inMemoryRepos
  ? createPgTreatmentProgramPort()
  : createInMemoryTreatmentProgramPort();
const treatmentProgramItemRefValidationPort = !inMemoryRepos
  ? createPgTreatmentProgramItemRefValidationPort()
  : createInMemoryTreatmentProgramItemRefValidationPort();
const treatmentProgramService = createTreatmentProgramService(
  treatmentProgramPort,
  treatmentProgramItemRefValidationPort,
);
const treatmentProgramInMemoryPersistence = inMemoryRepos
  ? createInMemoryTreatmentProgramPersistence()
  : null;
const treatmentProgramInstancePort = treatmentProgramInMemoryPersistence
  ? treatmentProgramInMemoryPersistence.instancePort
  : createPgTreatmentProgramInstancePort();
const treatmentProgramTestAttemptsPort = treatmentProgramInMemoryPersistence
  ? treatmentProgramInMemoryPersistence.testAttemptsPort
  : createPgTreatmentProgramTestAttemptsPort();
const treatmentProgramEventsPort = treatmentProgramInMemoryPersistence
  ? treatmentProgramInMemoryPersistence.eventsPort
  : createPgTreatmentProgramEventsPort();
const programActionLogPort = !inMemoryRepos
  ? createPgProgramActionLogPort()
  : createInMemoryProgramActionLogPort();
const programItemDiscussionPort = !inMemoryRepos
  ? createPgProgramItemDiscussionPort()
  : createInMemoryProgramItemDiscussionPort();
const programItemDiscussionService = createProgramItemDiscussionService(programItemDiscussionPort);
const patientDiarySnapshotsPort = !inMemoryRepos
  ? createPgPatientDiarySnapshotsPort()
  : createInMemoryPatientDiarySnapshotsPort();
const patientCalendarTimezoneGet = inMemoryRepos
  ? async (_userId: string) => null as string | null
  : getPatientCalendarTimezoneIana;
const patientCalendarTimezoneSet = inMemoryRepos
  ? async (_userId: string, _value: string | null) => true
  : setPatientCalendarTimezoneIana;
const patientCalendarTimezoneTryInitial = inMemoryRepos
  ? async (_userId: string, _raw: string | null) => {}
  : trySetInitialCalendarTimezoneIfEmpty;
const doctorPatientMessageStaffDeps = {
  staffUsers: staffUsersPort,
  topicChannelPrefs: topicChannelPrefsPort,
  channelPreferences: channelPreferencesPort,
  webPushSubscriptions: webPushSubscriptionsPort,
  systemSettings: systemSettingsService,
  getChannelBindings: loadPlatformUserChannelBindings,
};
registerAdminIncidentStaffPushDeps({
  staffUsers: staffUsersPort,
  channelPreferences: channelPreferencesPort,
  webPushSubscriptions: webPushSubscriptionsPort,
  systemSettings: systemSettingsService,
});
registerOperatorAlertDedupPort(
  !inMemoryRepos ? pgOperatorHealthAlertSentPort : inMemoryOperatorHealthAlertSentPort,
);
// C-4 (2026-07-26): operator-alert recipients resolved from who holds the admin role, not from
// the admin_telegram_ids/admin_max_ids/admin_phones DB-resident address lists. No in-memory repo
// exists for this (there is nothing to fake — an in-memory `platform_users` table isn't modeled);
// the empty-target fallback is the same "nobody configured" shape `dispatchOperatorAlert` already
// treats as a normal, reported empty audience.
registerAdminNotificationTargetsPort({
  loadTargets: !inMemoryRepos
    ? loadAdminNotificationTargetsFromDb
    : async () => ({ telegram: [], max: [], sms: [], email: [] }),
});
// D-b: счётчик пустой аудитории и env-fallback подключаются на краю, домен их не импортирует.
registerEmptyAudienceReporter(emptyAudienceReporter);
const resolvePatientLabelForDoctorNotify = async (platformUserId: string): Promise<string> => {
  const identity = await doctorClientsPort.getClientIdentity(platformUserId);
  return (
    selectPersonalChatSenderDisplayName(
      formatDoctorFio({
        lastName: identity?.lastName ?? null,
        firstName: identity?.firstName ?? null,
        patronymic: null,
      }),
      identity?.displayName,
    ) ?? ''
  );
};
const notifyDoctorOfProgramNoteImpl = async (
  input: Parameters<typeof notifyDoctorPatientProgramNote>[0],
) => {
  await notifyDoctorPatientProgramNote(input, { staffDeps: doctorPatientMessageStaffDeps });
};
const treatmentProgramPatientActions = createTreatmentProgramPatientActionService({
  instances: treatmentProgramInstancePort,
  actionLog: programActionLogPort,
  patientDiarySnapshots: patientDiarySnapshotsPort,
  discussion: programItemDiscussionService,
  getAppDefaultTimezoneIana: getAppDisplayTimeZone,
  getPatientCalendarTimezoneIana: patientCalendarTimezoneGet,
  resolvePatientLabel: resolvePatientLabelForDoctorNotify,
  notifyDoctorOfProgramNote: notifyDoctorOfProgramNoteImpl,
});
const treatmentProgramItemSnapshotPort = !inMemoryRepos
  ? createPgTreatmentProgramItemSnapshotPort()
  : createInMemoryTreatmentProgramItemSnapshotPort();
const coursesPort = !inMemoryRepos ? createPgCoursesPort() : createInMemoryCoursesPort();
const patientHomeBlocksPort = !inMemoryRepos
  ? createPgPatientHomeBlocksPort()
  : createInMemoryPatientHomeBlocksPort();
const patientHomeLegacyContentPort = !inMemoryRepos
  ? createPgPatientHomeLegacyContentPort()
  : createInMemoryPatientHomeLegacyContentPort();
const patientPracticeCompletionsPort = !inMemoryRepos
  ? createPgPatientPracticeCompletionsPort()
  : createInMemoryPatientPracticeCompletionsPort();
const patientDailyWarmupPresentationPort = !inMemoryRepos
  ? createPgPatientDailyWarmupPresentationPort()
  : createInMemoryPatientDailyWarmupPresentationPort();
const patientDailyWarmupVideoViewsPort = !inMemoryRepos
  ? createPgPatientDailyWarmupVideoViewPort()
  : createInMemoryPatientDailyWarmupVideoViewPort();
const materialRatingPort = !inMemoryRepos
  ? createPgMaterialRatingPort()
  : createInMemoryMaterialRatingPort();
const materialRatingService = createMaterialRatingService({
  ratings: materialRatingPort,
  contentPages: {
    async getById({ id, organizationId }) {
      const row = await contentPagesPort.getById(id, { organizationId });
      return row
        ? {
            organizationId: row.organizationId ?? null,
            deletedAt: row.deletedAt,
            archivedAt: row.archivedAt,
            isPublished: row.isPublished,
            requiresAuth: row.requiresAuth,
          }
        : null;
    },
  },
  itemRefs: treatmentProgramItemRefValidationPort,
  instances: treatmentProgramInstancePort,
});
const materialRatingFeedbackPort = !inMemoryRepos
  ? createPgMaterialRatingFeedbackPort()
  : createInMemoryMaterialRatingFeedbackPort();
const materialRatingFeedbackService = createMaterialRatingFeedbackService({
  feedback: materialRatingFeedbackPort,
  isDailyWarmupContentPage: ({ contentPageId, organizationId }) =>
    isContentPageInDailyWarmupBlock(
      contentPageId,
      {
        patientHomeBlocks: patientHomeBlocksPort,
        contentPages: contentPagesPort,
        contentSections: contentSectionsPort,
        systemSettings: systemSettingsService,
      },
      organizationId,
    ),
});
const warmupFeelingCompletionPort = !inMemoryRepos
  ? createPgWarmupFeelingCompletionPort({
      diaries: symptomDiaryPort,
      completions: patientPracticeCompletionsPort,
    })
  : createInMemoryWarmupFeelingCompletionPort({
      completions: patientPracticeCompletionsPort,
    });
const patientPracticeService = createPatientPracticeService({
  completions: patientPracticeCompletionsPort,
  contentPages: contentPagesPort,
});
const treatmentProgramInstanceService = createTreatmentProgramInstanceService({
  instances: treatmentProgramInstancePort,
  templates: treatmentProgramService,
  snapshots: treatmentProgramItemSnapshotPort,
  itemRefs: treatmentProgramItemRefValidationPort,
  events: treatmentProgramEventsPort,
  testAttempts: treatmentProgramTestAttemptsPort,
  getDefaultPromoTemplateId: ({ organizationId } = {}) =>
    systemSettingsService.getPatientDefaultPromoTreatmentProgramTemplateId({ organizationId }),
  // patient_diaries is a critical mechanic (#1069, owner 31.07) — always runs.
  snapshotDiaryDaysBeforePromoRefresh: async (input) => {
    await snapshotPromoDaysBeforeRefresh(
      {
        reminders: remindersService,
        patientPractice: patientPracticeService,
        programActionLog: programActionLogPort,
        treatmentProgramInstance: {
          listInstancesForPatient: (userId) =>
            treatmentProgramInstancePort.listInstancesForPatient(userId),
          getInstanceForPatient: (userId, instanceId) =>
            treatmentProgramInstancePort.getInstanceForPatient(userId, instanceId),
        },
        diarySnapshots: patientDiarySnapshotsPort,
        getAppDefaultTimezoneIana: getAppDisplayTimeZone,
        getPatientCalendarTimezoneIana: patientCalendarTimezoneGet,
      },
      input,
    );
  },
});
const coursesService = createCoursesService({
  courses: coursesPort,
  introPages: contentPagesPort,
  assertWriteClearance: assertMechanicWriteClearance,
  assignTemplateToPatient: (input) =>
    treatmentProgramInstanceService.assignTemplateToPatient(input),
});

patientBookingService = createPatientBookingService({
  bookingsPort: patientBookingsPort,
  syncPort: createBookingSyncPort(),
  bookingEngine: bookingEngineService,
  bookingScheduling: bookingSchedulingService,
  bookingForm: bookingFormService,
  appointmentProjection: appointmentProjectionPort,
  appointmentLifecycle: bookingAppointmentLifecycleService,
  payments: paymentsService,
  canAcceptBookingPrepayment: async (organizationId) => {
    const [prepaymentAccess, paymentsAccess] = await Promise.all([
      orgEntitlementsPort.resolveMechanicAccess(organizationId, 'booking_prepayment'),
      orgEntitlementsPort.resolveMechanicAccess(organizationId, 'payments'),
    ]);
    return (
      (prepaymentAccess.state === 'full_access' ||
        prepaymentAccess.state === 'grace' ||
        prepaymentAccess.state === 'read_only') &&
      (paymentsAccess.state === 'full_access' || paymentsAccess.state === 'grace')
    );
  },
  memberships: membershipsServiceResolved,
  clientHistory: clientHistoryService,
  platformUserContacts: platformUserContactsService,
  getPlatformUserIdentityContacts: async (userId) => {
    const identity = await doctorClientsPort.getClientIdentity(userId);
    if (!identity) return null;
    return { phone: identity.phone, email: identity.email ?? null };
  },
  getBookingLifecycleNotificationSettings: async () => {
    const row = await systemSettingsService.getSetting('booking_lifecycle_notifications', 'admin');
    const { parseBookingLifecycleNotificationsSettings } =
      await import('@/modules/booking-notifications/settings');
    return parseBookingLifecycleNotificationsSettings(row?.valueJson ?? null);
  },
  getAppDisplayTimeZone,
});

const patientHomeBlocksService = createPatientHomeBlocksService({
  port: patientHomeBlocksPort,
  contentPages: contentPagesPort,
  contentSections: contentSectionsPort,
  courses: coursesService,
  assertWriteClearance: assertMechanicWriteClearance,
});
const treatmentProgramProgressService = createTreatmentProgramProgressService({
  instances: treatmentProgramInstancePort,
  tests: treatmentProgramTestAttemptsPort,
  events: treatmentProgramEventsPort,
  actionLog: programActionLogPort,
});

const lfkTemplatesPort = !inMemoryRepos ? pgLfkTemplatesPort : inMemoryLfkTemplatesPort;
const lfkTemplatesService = createLfkTemplatesService(lfkTemplatesPort);

const lfkAssignmentsStubPort: LfkAssignmentsPort = {
  async assignPublishedTemplateToPatient() {
    throw new Error('Назначение шаблона ЛФК доступно только при подключённой базе данных.');
  },
};
const lfkAssignmentsPortResolved: LfkAssignmentsPort = !inMemoryRepos
  ? pgLfkAssignmentsPort
  : lfkAssignmentsStubPort;
const lfkAssignmentsService = createLfkAssignmentsService(lfkAssignmentsPortResolved);

const notifyPatientDoctorReply = createNotifyPatientDoctorReply({
  shouldDispatchRelay: (ctx) => systemSettingsService.shouldDispatchRelayToRecipient(ctx),
  channelPreferences: channelPreferencesPort,
  topicChannelPrefs: topicChannelPrefsPort,
  webPushSubscriptions: webPushSubscriptionsPort,
  systemSettings: systemSettingsService,
  readReminderNotifyGate: readReminderWebappNotifyGate,
  getProfileEmailFields: (platformUserId) =>
    userProjectionPort.getProfileEmailFields(platformUserId),
  getChannelBindings: loadPlatformUserChannelBindings,
});
const sendProgramNoteReply = createSendProgramNoteReply({
  supportCommunication: supportCommunicationPort,
  discussion: programItemDiscussionService,
  resolveProgramNoteReplyContext,
  notifyPatientOfDoctorReply: notifyPatientDoctorReply,
});

const notifyDoctorOfPatientMessageImpl = async (input: {
  organizationId: string;
  platformUserId: string;
  conversationId: string;
  messageId: string;
  messageText: string;
  patientLabel: string;
  source: 'webapp' | 'telegram' | 'max';
}) => {
  await notifyDoctorPatientMessage(input, { staffDeps: doctorPatientMessageStaffDeps });
};

const integratorSupportBridge = createIntegratorSupportBridge({
  port: supportCommunicationPort,
  questionPort: integratorSupportQuestionOwnershipPort,
  resolvePatientOrganization: async (platformUserId, verifiedOrganizationId) => {
    if (!patientOrganizationService) return { ok: false, error: 'organization_not_resolved' };
    const result = await patientOrganizationService.resolveActiveOrganizationForPatient(
      platformUserId,
      verifiedOrganizationId ? { verifiedTargetOrganizationId: verifiedOrganizationId } : {},
    );
    return result.ok
      ? { ok: true, organizationId: result.organizationId }
      : { ok: false, error: result.reason };
  },
  withOrganizationPrincipal: (organizationId, fn) =>
    withExplicitOrganizationPrincipal(
      { organizationId, source: 'integrator.support-canonical-write' },
      fn,
    ),
  notifyPatientOfDoctorReply: notifyPatientDoctorReply,
  sendProgramNoteReply,
  notifyDoctorOfPatientMessage: notifyDoctorOfPatientMessageImpl,
  resolvePatientLabel: resolvePatientLabelForDoctorNotify,
});
const patientMessagingService = createPatientMessagingService(supportCommunicationPort, {
  isUserMessagingBlocked: (uid) => doctorClientsPort.isClientMessagingBlocked(uid),
  notifyDoctorOfPatientMessage: async (input) => {
    await notifyDoctorOfPatientMessageImpl({ ...input, source: 'webapp' });
  },
  resolvePatientLabel: resolvePatientLabelForDoctorNotify,
});
const patientNotificationInboxService =
  createPatientNotificationInboxService(supportCommunicationPort);
const doctorSupportMessagingService = createDoctorSupportMessagingService(
  supportCommunicationPort,
  {
    shouldDispatchRelay: (ctx) => systemSettingsService.shouldDispatchRelayToRecipient(ctx),
    notifyPatientOfDoctorReply: notifyPatientDoctorReply,
  },
);

function linkFromPayload(payload: Record<string, unknown>): string | null {
  const link = payload?.link;
  if (typeof link === 'string' && link.trim()) return link.trim();
  const url = payload?.url;
  if (typeof url === 'string' && url.trim()) return url.trim();
  const recordUrl = payload?.record_url;
  if (typeof recordUrl === 'string' && recordUrl.trim()) return recordUrl.trim();
  return null;
}

function cancelReasonFromPayload(payload: Record<string, unknown>): string | null {
  const a = payload?.cancellation_reason;
  const b = payload?.cancel_reason;
  if (typeof a === 'string' && a.trim()) return a.trim();
  if (typeof b === 'string' && b.trim()) return b.trim();
  return null;
}

function mapRecordStatus(raw: string): AppointmentRecordStatus {
  const x = raw.toLowerCase();
  if (x.includes('cancel')) return 'cancelled';
  if (x.includes('resched')) return 'rescheduled';
  if (x === 'confirmed' || x === 'updated') return 'confirmed';
  return 'created';
}

const getUpcomingAppointments: (userId: string) => Promise<AppointmentSummary[]> =
  !inMemoryRepos && appointmentProjectionPort
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

const symptomDiaryService = createSymptomDiaryService(symptomDiaryPort);
const patientMoodService = createPatientMoodService({
  diaries: symptomDiaryService,
  references: referencesPort,
});
const lfkDiaryService = createLfkDiaryService(lfkDiaryPort);
const channelPreferencesService = createChannelPreferencesService(channelPreferencesPort, {
  webPushHasSubscription: (userId) => webPushSubscriptionsPort.hasAnyForUserId(userId),
});
const appointmentReminderMaterialization: AppointmentReminderMaterializationPort = !inMemoryRepos
  ? createPgAppointmentReminderMaterializationPort()
  : {
      async replaceGeneration(input) {
        return { current: true, inserted: input.deliveries.length };
      },
    };
const mediaService = createMediaService(mediaStoragePort);
const contentCatalog = createContentCatalogResolver({
  testVideoUrl: env.MEDIA_TEST_VIDEO_URL?.length ? env.MEDIA_TEST_VIDEO_URL : undefined,
  contentPages: contentPagesPort,
  loadMediaById: (id) => mediaService.getById(id),
});

const smsPort =
  env.INTEGRATOR_API_URL && integratorWebhookSecret()
    ? createIntegratorSmsAdapter({
        challengeStore,
        integratorBaseUrl: env.INTEGRATOR_API_URL,
        sharedSecret: integratorWebhookSecret(),
      })
    : createStubSmsAdapter({ challengeStore });

/**
 * A-3: the anonymous booking OTP path stores through `app.phone_otp_public_booking_*`
 * (SECURITY DEFINER) rather than touching `phone_challenges`/`phone_otp_locks` directly — both
 * booking handlers run as app_patient, which has no grant on either table.
 */
const publicBookingOtpPort = !inMemoryRepos
  ? createPgPublicBookingOtpPort()
  : inMemoryPublicBookingOtpPort;

/** Delivery only; the same signed integrator call the login path uses, minus the storage. */
const deliverPublicBookingCode: PublicBookingCodeDelivery =
  env.INTEGRATOR_API_URL && integratorWebhookSecret()
    ? (phone, code) =>
        deliverSmsCodeViaIntegrator(phone, code, {
          integratorBaseUrl: env.INTEGRATOR_API_URL,
          sharedSecret: integratorWebhookSecret(),
        })
    : // No integrator configured (local dev / stub SMS): nothing is sent, exactly as
      // `createStubSmsAdapter` sends nothing. The code lives only in the challenge row.
      async () => ({ ok: true });
const phoneAuthDeps = {
  smsPort,
  challengeStore,
  userByPhonePort,
};

async function listAppointmentHistoryForPhone(
  phone: string | null,
): Promise<ClientAppointmentHistoryItem[]> {
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
  ensureAuthModulePortsBound();
  ensureSystemSettingsConfigAdapterBound();
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
    listSupplementaryContacts: async (userId, identity) =>
      toDoctorSupplementaryContacts(await platformUserContactsService.listForPlatformUser(userId), {
        phone: identity.phone,
        email: identity.email ?? null,
      }),
    getDoctorSupportDefault: (key, context) => runtimeConfig.getBoolean(key, context),
  });
  const integratorDeliveryTargetsDeps = {
    userByPhonePort,
    identityResolutionPort,
    preferencesPort: channelPreferencesPort,
    topicChannelPrefsPort,
    readReminderNotifyGate: readReminderWebappNotifyGate,
    getProfileEmailFields: userProjectionPort.getProfileEmailFields,
    webPushSubscriptions: webPushSubscriptionsPort,
    systemSettings: systemSettingsService,
    hasActivePatientEnrollment: (platformUserId: string, organizationId: string) =>
      patientOrganizationService?.hasActiveEnrollment(platformUserId, organizationId) ??
      Promise.resolve(false),
    findPlatformUserByIntegratorId: userProjectionPort.findByIntegratorId,
    getChannelBindings: loadPlatformUserChannelBindings,
  };
  return {
    auth: {
      getCurrentSession,
      exchangeIntegratorToken: (token: string) =>
        exchangeIntegratorToken(token, identityResolutionPort, userProjectionPort.updateRole),
      exchangeTelegramInitData: (initData: string) =>
        exchangeTelegramInitData(initData, identityResolutionPort, userProjectionPort.updateRole),
      exchangeMaxInitData: (initData: string) =>
        exchangeMaxInitData(initData, identityResolutionPort, userProjectionPort.updateRole),
      exchangeTelegramLoginWidget: (
        payload: TelegramLoginWidgetPayload,
        webappEntryToken?: string | null,
      ) =>
        exchangeTelegramLoginWidget(
          payload,
          identityResolutionPort,
          userProjectionPort.updateRole,
          webappEntryToken,
        ),
      clearSession,
      setSessionFromUser,
      startPhoneAuth: (phone: string, context: ChannelContext, opts?: StartPhoneAuthOptions) =>
        startPhoneAuthFlow(phone, context, phoneAuthDeps, opts),
      getPhoneChallenge: (challengeId: string) => challengeStore.get(challengeId),
      confirmPhoneAuth: async (challengeId: string, code: string) => {
        const result = await confirmPhoneAuthFlow(challengeId, code, phoneAuthDeps);
        if (!result.ok) return result;
        const envRole = resolveRoleFromEnv({
          phone: result.user.phone,
          telegramId: result.user.bindings?.telegramId,
          maxId: result.user.bindings?.maxId,
        });
        const effectiveRole = reconcileDbRoleWithEnvRole(result.user.role, envRole);
        try {
          await markPhoneMessengerBindConsumedByChallenge(challengeId, phoneMessengerBindPort);
          if (result.user.role !== effectiveRole) {
            await userProjectionPort.updateRole(result.user.userId, effectiveRole);
          }
          await consumePhoneOtpChallenge(challengeId, phoneAuthDeps);
        } catch {
          return { ok: false as const, code: 'server_error' };
        }
        const user =
          result.user.role === effectiveRole
            ? result.user
            : { ...result.user, role: effectiveRole };
        return {
          ok: true as const,
          user,
          redirectTo: getRedirectPathForRole(effectiveRole),
          deliveryChannel: result.deliveryChannel,
          wasCreated: result.wasCreated,
          registrationAttemptId: result.registrationAttemptId,
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
    patientBooking: patientBookingService,
    /**
     * A-3: the OTP seam the anonymous booking path proves contact ownership with. Storage goes
     * through the SECURITY DEFINER accessors (no table grant for the anonymous runtime role);
     * delivery goes through the same signed integrator call the login path uses. The per-phone
     * cooldown and lockout still apply — they are enforced inside the accessors against the same
     * `phone_challenges` / `phone_otp_locks` rows, with the constants from `otpConstants.ts`.
     */
    publicBookingVerification: {
      otp: publicBookingOtpPort,
      deliverCode: deliverPublicBookingCode,
    },
    patientMaintenanceHistory: patientMaintenanceHistoryService,
    doctorCabinet: {
      getDoctorWorkspaceState,
      getOverviewState,
    },
    doctorClients,
    /** Прямой порт для API (идентичность, блокировка) без лишней агрегации профиля. */
    doctorClientsPort,
    doctorNotes: doctorNotesService,
    specialistTasks: specialistTasksService,
    patientFiles: patientFilesService,
    patientClinical: patientClinicalService,
    patientComorbidities: patientComorbiditiesService,
    patientPayments: patientPaymentsService,
    acquiringGateway,
    doctorMessaging: createDoctorMessagingService({
      getClientIdentity: async (userId) => {
        const p = await doctorClients.getClientProfile(userId);
        return p?.identity ?? null;
      },
      getDeliveryTargets: (params) =>
        getDeliveryTargetsForIntegrator(params, integratorDeliveryTargetsDeps),
      messageLogPort,
    }),
    doctorAppointments: createDoctorAppointmentsService({
      appointmentsPort: doctorAppointmentsPort,
    }),
    doctorStats: createDoctorStatsService({
      getAppointmentStats: (filter, audience) =>
        doctorAppointmentsPort.getAppointmentStats(filter, audience),
      getClientContactBreakdown: (audience) =>
        doctorClientsPort.getClientContactBreakdown(audience),
      getDashboardPatientMetrics: (audience) =>
        doctorClientsPort.getDashboardPatientMetrics(audience),
      getDashboardAppointmentMetrics: (audience) =>
        doctorAppointmentsPort.getDashboardAppointmentMetrics(audience),
    }),
    doctorAnalyticsMetricAccounts: doctorAnalyticsMetricAccountsPort,
    adminPlatformUserStats,
    productAnalytics,
    doctorBroadcasts: createDoctorBroadcastsService({
      assertWriteClearance: assertMechanicWriteClearance,
      resolveBroadcastAudience: async (filter, channels, category) => {
        const clients = await listClientsForBroadcastAudience(doctorClientsPort, filter);
        const { devMode, testAccounts } = await systemSettingsService.getRelayDevContext();
        const { effective, nominal, cappedByDevMode } = resolveBroadcastEffectiveClients(
          clients,
          channels,
          devMode,
          testAccounts,
        );
        const prefsMap = await channelPreferencesPort.getBroadcastNotificationFlagsBatch(
          effective.map((c) => c.userId),
        );
        const webPushEligibleUserIds = channels.includes('push')
          ? await resolveBroadcastWebPushEligibleUserIds(effective, category, {
              webPushSubscriptions: webPushSubscriptionsPort,
              channelPreferences: channelPreferencesPort,
              topicChannelPrefs: topicChannelPrefsPort,
              systemSettings: systemSettingsService,
              readReminderNotifyGate: readReminderWebappNotifyGate,
            })
          : new Set<string>();
        const eligibleClients = filterEligibleBroadcastClients(
          effective,
          channels,
          filter,
          prefsMap,
          webPushEligibleUserIds,
        );
        const recipientsPreview = buildRecipientsPreviewFromClients(eligibleClients);
        const policy = deriveBroadcastDeliveryPolicy(filter, channels);
        const base = {
          audienceSize: eligibleClients.length,
          recipientsPreview,
          effectiveClients: effective,
          eligibleClients,
          audienceFilter: filter,
          notificationPrefsByUserId: prefsMap,
          deliveryPolicyKind: policy.kind,
          deliveryPolicyDescriptionRu: policy.descriptionRu,
          webPushEligibleUserIds,
        };
        if (!devMode) {
          return base;
        }
        if (cappedByDevMode) {
          return { ...base, segmentSize: nominal };
        }
        return base;
      },
      broadcastAuditPort,
      doctorBroadcastDeliveryCommitPort,
      patientInboundChatPort: supportCommunicationPort,
      fanOutBroadcastWebPush,
      patientWebPushNotifyDeps: {
        findPlatformUserByIntegratorId: async (integratorUserId) => {
          const row = await userProjectionPort.findByIntegratorId(integratorUserId);
          return row ? { platformUserId: row.platformUserId } : null;
        },
        findPlatformUserByPhone: async (phoneNormalized) =>
          userProjectionPort.findByPhoneNormalized(phoneNormalized),
        channelPreferences: channelPreferencesPort,
        topicChannelPrefs: topicChannelPrefsPort,
        webPushSubscriptions: webPushSubscriptionsPort,
        systemSettings: systemSettingsService,
        readReminderNotifyGate: readReminderWebappNotifyGate,
        recordDeliveryAttempt: (input) =>
          notificationDelivery.recordNotificationDeliveryAttempt(input),
        patientInboundChatPort: supportCommunicationPort,
      },
      fanOutBroadcastEmailDeps: {
        emailRecipientsPort: broadcastEmailRecipientsPort,
        getSmtpValueJson: () =>
          systemSettingsService
            .getSetting('smtp_outbound', 'admin')
            .then((s) => s?.valueJson ?? null)
            .catch(() => null),
      },
    }),
    doctorBroadcastComposer: {
      loadDraft: (doctorUserId: string) => broadcastDraftPort.loadDraft(doctorUserId),
      saveDraft: (doctorUserId: string, draft: BroadcastDraft) => {
        assertMechanicWriteClearance('mailings');
        return broadcastDraftPort.saveDraft(doctorUserId, draft);
      },
      getChannelCounts: () => broadcastChannelCountsPort.getChannelConnectionCounts(),
      getChannelCountsByAudience: async (filter: BroadcastAudienceFilter) => {
        if (filter === 'all') return broadcastChannelCountsPort.getChannelConnectionCounts();
        const clients = await listClientsForBroadcastAudience(doctorClientsPort, filter);
        const userIds = clients.map((c) => c.userId);
        return broadcastChannelCountsPort.getChannelCountsByUserIds(userIds);
      },
    },
    doctorMotivationQuotesEditor: doctorMotivationQuotesEditorPort,
    purchases: {
      getPurchaseSectionState,
    },
    diaries: {
      listSymptomEntries: symptomDiaryService.listSymptomEntries,
      createSymptomTracking: symptomDiaryService.createTracking,
      ensureGeneralWellbeingTracking: symptomDiaryService.ensureGeneralWellbeingTracking,
      ensureWarmupFeelingTracking: symptomDiaryService.ensureWarmupFeelingTracking,
      upsertWarmupFeelingTrackingIdInTx: symptomDiaryService.upsertWarmupFeelingTrackingIdInTx,
      listSymptomTrackings: symptomDiaryService.listTrackings,
      addSymptomEntry: symptomDiaryService.addEntry,
      renameSymptomTracking: symptomDiaryService.renameTracking,
      archiveSymptomTracking: symptomDiaryService.archiveTracking,
      deleteSymptomTracking: symptomDiaryService.deleteTracking,
      getSymptomTrackingForUser: symptomDiaryService.getSymptomTrackingForUser,
      listSymptomEntriesForTrackingInRange:
        symptomDiaryService.listSymptomEntriesForTrackingInRange,
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
      listLfkComplexExerciseLinesForUser: lfkDiaryService.listLfkComplexExerciseLinesForUser,
      updateLfkComplexExerciseLocalCommentForUser:
        lfkDiaryService.updateLfkComplexExerciseLocalCommentForUser,
      purgeAllDiaryDataForUser: async (userId: string) => {
        if (!inMemoryRepos) {
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
    operatorHealthRead: operatorHealthReadPort,
    saasIsolationDiagnostics,
    operatorHealthDigestRead: operatorHealthDigestReadPort,
    operatorHealthDigestDelivery: {
      loadRecipients: async () => ({
        ...(await loadAdminNotificationTargetsFromDb()),
        web_push: await resolveOperatorHealthDigestWebPushRecipients({
          globalAdmins: globalAdminWebPushRecipientsPort,
          channelPreferences: channelPreferencesPort,
          webPushSubscriptions: webPushSubscriptionsPort,
        }),
      }),
      enqueue: inMemoryRepos
        ? async (deliveries: readonly OperatorHealthDigestReadyOutgoingDelivery[]) =>
            deliveries.length
        : enqueueOperatorHealthDigestDeliveries,
      loadLatestSentAt: inMemoryRepos ? async () => null : loadLatestSentOperatorHealthDigestAt,
    },
    operatorHealthWrite: operatorHealthWritePort,
    healthFailureArchive,
    notificationDelivery,
    media: mediaService,
    mediaDeleteErrors: {
      list: listMediaDeleteErrors,
    },
    doctorCalendarTimezone: pgDoctorCalendarTimezonePort,
    channelPreferences: channelPreferencesService,
    channelPreferencesPort,
    webPushSubscriptions: webPushSubscriptionsPort,
    readReminderNotifyGate: readReminderWebappNotifyGate,
    loadPlatformUserChannelBindings,
    reminderTransactionalEmailCooldown: reminderTransactionalEmailCooldownPort,
    contentCatalog,
    deliveryTargetsApi: {
      getTargets: (params: {
        organizationId: string;
        phone?: string;
        telegramId?: string;
        maxId?: string;
        platformUserId?: string;
        topic?: string;
        integratorUserId?: string;
      }) => getDeliveryTargetsForIntegrator(params, integratorDeliveryTargetsDeps),
    },
    appointmentReminderMaterialization,
    appDisplayTimeZone: getAppDisplayTimeZone,
    topicChannelPrefs: topicChannelPrefsPort,
    staffUsers: staffUsersPort,
    patientNotificationTopics: patientNotificationTopicsPort,
    userProjection: {
      upsertFromProjection: userProjectionPort.upsertFromProjection,
      findByIntegratorId: userProjectionPort.findByIntegratorId,
      findByPhoneNormalized: userProjectionPort.findByPhoneNormalized,
      updatePhone: userProjectionPort.updatePhone,
      updateProfileByPhone: userProjectionPort.updateProfileByPhone,
      upsertNotificationTopics: userProjectionPort.upsertNotificationTopics,
      updateRole: userProjectionPort.updateRole,
      getProfileEmailFields: userProjectionPort.getProfileEmailFields,
      clearStaffAccountEmail: userProjectionPort.clearStaffAccountEmail,
      patchAdminClientProfile: userProjectionPort.patchAdminClientProfile,
      findPlatformUserIdWithEmailConflict: userProjectionPort.findPlatformUserIdWithEmailConflict,
      findPlatformUserIdWithPhoneConflict: userProjectionPort.findPlatformUserIdWithPhoneConflict,
    },
    supportCommunication: supportCommunicationPort,
    integratorSupportBridge,
    sendProgramNoteReply,
    /** Поддержка: чат webapp ↔ админ (этап 8). */
    messaging: {
      patient: patientMessagingService,
      patientNotifications: patientNotificationInboxService,
      doctorSupport: doctorSupportMessagingService,
    },
    reminders: remindersService,
    /** Журнал snooze/skip/done; `undefined` в Vitest без БД. */
    reminderJournal: reminderJournalPort,
    reminderProjection: reminderProjectionPort,
    appointmentProjection: appointmentProjectionPort,
    contentPages: contentPagesPortForDeps,
    contentSections: contentSectionsPortForDeps,
    userByPhone: userByPhonePort,
    phoneMessengerBind: {
      start: (params: Parameters<typeof startPhoneMessengerBind>[0]) =>
        startPhoneMessengerBind(params, phoneMessengerBindPort),
      getStatus: (setupToken: string) =>
        getPhoneMessengerBindStatus(setupToken, phoneMessengerBindPort),
      completeFromIntegrator: (
        params: Parameters<typeof completePhoneMessengerBindFromIntegrator>[0],
      ) => completePhoneMessengerBindFromIntegrator(params, phoneAuthDeps, phoneMessengerBindPort),
      markConsumedByChallenge: (challengeId: string) =>
        markPhoneMessengerBindConsumedByChallenge(challengeId, phoneMessengerBindPort),
      resolveLoginChallenge: (setupToken: string) =>
        resolvePhoneMessengerBindLoginChallenge(setupToken, phoneAuthDeps, phoneMessengerBindPort),
    },
    userPasswordCredentials: userPasswordCredentialsPort,
    passwordAltcha: passwordAltchaService,
    passwordChange: passwordChangeService,
    emailPasswordLookup: emailPasswordLookupPort,
    emailOtpPublicDb: emailOtpPublicDbPort,
    emailSetupAccess: emailSetupAccessService,
    emailSetupFlow: emailSetupFlowService,
    oauthBindings: oauthBindingsPort,
    loginTokens: loginTokensPort,
    systemSettings: systemSettingsService,
    runtimeConfig,
    notifTemplates: notifTemplatesService,
    lfkExercises: lfkExercisesService,
    lfkExerciseMediaUsage: {
      listForMediaIds: pgListExerciseUsageForMediaIds,
    },
    clinicalTests: clinicalTestsService,
    measureKinds: clinicalTestMeasureKindsService,
    testSets: testSetsService,
    recommendations: recommendationsService,
    comments: commentsService,
    treatmentProgram: treatmentProgramService,
    treatmentProgramInstance: treatmentProgramInstanceService,
    courses: coursesService,
    patientHomeBlocks: patientHomeBlocksService,
    /** Legacy новости / рассылки / цитаты главной пациента (Drizzle или in-memory в Vitest). */
    patientHomeLegacy: patientHomeLegacyContentPort,
    patientBroadcasts: patientBroadcastsPort,
    patientPractice: patientPracticeService,
    patientDailyWarmupPresentation: patientDailyWarmupPresentationPort,
    patientDailyWarmupVideoViews: patientDailyWarmupVideoViewsPort,
    organizationMembership: organizationMembershipService,
    orgEntitlements: orgEntitlementsPort,
    saasBilling: saasBillingService,
    /** Effective organization brand (core context always, paid additions only when entitled+published). */
    orgBranding: orgBrandingService,
    platformEntitlements: platformEntitlementsService,
    patientOrganization: patientOrganizationService,
    organizationProvisioning: organizationProvisioningService,
    staffSecurity: staffSecurityService,
    organizationInvites: organizationInvitesService,
    patientInvites: patientInvitesService,
    clinicSeats: clinicSeatsService,
    doctorWorkspace: doctorWorkspaceDirectoryService,
    materialRating: materialRatingService,
    materialRatingFeedback: materialRatingFeedbackService,
    warmupFeelingCompletion: warmupFeelingCompletionPort,
    patientMood: patientMoodService,
    treatmentProgramProgress: treatmentProgramProgressService,
    treatmentProgramPatientActions,
    programItemDiscussion: programItemDiscussionService,
    /** Журнал действий пациента по программе (дневник недели и др.). */
    programActionLog: programActionLogPort,
    patientDiarySnapshots: patientDiarySnapshotsPort,
    patientCalendarTimezone: {
      getIanaForUser: patientCalendarTimezoneGet,
      setIanaForPatient: patientCalendarTimezoneSet,
      trySetInitialIfEmpty: patientCalendarTimezoneTryInitial,
    },
    lfkTemplates: lfkTemplatesService,
    lfkAssignments: lfkAssignmentsService,
    /** `/book/{publicSlug}` bootstrap resolver (owner canon OWNER_RULINGS_2026-07-17.md §1). */
    clinicDirectory: clinicDirectoryService,
    bookingEngine: bookingEngineService,
    bookingSync: bookingSyncPortForPayments,
    /** Raw PG port for admin booking-engine API (null only in Vitest without DB). */
    bookingEnginePort,
    bookingScheduling: bookingSchedulingService,
    bookingCalendar: bookingCalendarService,
    clientHistory: clientHistoryService,
    bookingForm: bookingFormService,
    bookingPolicies: bookingPoliciesService,
    bookingAppointmentLifecycle: bookingAppointmentLifecycleService,
    payments: paymentsService,
    memberships: membershipsServiceResolved,
    entitlements: entitlementsService,
    patientMergeCandidate: patientMergeCandidateService,
    platformUserContacts: platformUserContactsService,
    /** D15b/3 — see `modules/identity/ports.ts`. */
    identity: identityPort,
  };
}

/**
 * Одна мемоизированная сборка на один server request (React.cache в Next RSC).
 * В юнит-тестах без request-scope повторные вызовы могут давать разные объекты.
 */
export const buildAppDeps = cache(_buildAppDeps);
