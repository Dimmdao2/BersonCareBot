/**
 * Сборка зависимостей приложения: авторизация, меню, дневники, каталог контента, настройки каналов и т.д.
 * Используется на страницах приложения для доступа к сервисам. При наличии базы данных подключаются
 * хранилища в БД. In-memory — если `webappReposAreInMemory()` (Vitest без БД; `next build` без URL в CI). В `next dev` без `DATABASE_URL` — throw в `config/env`.
 */

import { cache } from "react";
import { ensureAuthModulePortsBound } from "@/app-layer/di/bindAuthModulePorts";
import {
  getCurrentSession,
  exchangeIntegratorToken,
  exchangeTelegramInitData,
  exchangeMaxInitData,
  exchangeTelegramLoginWidget,
  clearSession,
  setSessionFromUser,
} from "@/modules/auth/service";
import type { TelegramLoginWidgetPayload } from "@/modules/auth/telegramLoginVerify";
import {
  startPhoneAuth as startPhoneAuthFlow,
  confirmPhoneAuth as confirmPhoneAuthFlow,
  consumePhoneOtpChallenge,
  type StartPhoneAuthOptions,
} from "@/modules/auth/phoneAuth";
import {
  completePhoneMessengerBindFromIntegrator,
  getPhoneMessengerBindStatus,
  markPhoneMessengerBindConsumedByChallenge,
  registerPhoneMessengerBindPort,
  resolvePhoneMessengerBindLoginChallenge,
  startPhoneMessengerBind,
} from "@/modules/auth/phoneMessengerBind";
import { createPgPhoneMessengerBindPort } from "@/infra/repos/pgPhoneMessengerBind";
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
import { parseDoctorSupportDefaultEnabled } from "@/modules/doctor-clients/supportPolicy";
import { createDoctorAppointmentsService } from "@/modules/doctor-appointments/service";
import { createDoctorMessagingService } from "@/modules/doctor-messaging/service";
import { createDoctorStatsService } from "@/modules/doctor-stats/service";
import { createAdminPlatformUserStatsService } from "@/modules/admin-platform-stats/service";
import { createProductAnalyticsService } from "@/modules/product-analytics/service";
import { createPgProductAnalyticsPort } from "@/infra/repos/pgProductAnalytics";
import { createInMemoryProductAnalyticsPort } from "@/infra/repos/inMemoryProductAnalytics";
import { createDoctorNotesService } from "@/modules/doctor-notes/service";
import type { ClientAppointmentHistoryItem } from "@/modules/doctor-clients/service";
import { createDoctorBroadcastsService } from "@/modules/doctor-broadcasts/service";
import {
  listClientsForBroadcastAudience,
  resolveBroadcastEffectiveClients,
  buildRecipientsPreviewFromClients,
} from "@/modules/doctor-broadcasts/broadcastAudienceMetrics";
import {
  deriveBroadcastDeliveryPolicy,
  filterEligibleBroadcastClients,
} from "@/modules/doctor-broadcasts/broadcastEligible";
import { resolveBroadcastWebPushEligibleUserIds } from "@/modules/doctor-broadcasts/resolveBroadcastWebPushEligibleUserIds";
import { fanOutBroadcastWebPush } from "@/modules/doctor-broadcasts/fanOutBroadcastWebPush";
import { inMemoryDoctorClientsPort } from "@/infra/repos/inMemoryDoctorClients";
import { inMemoryBroadcastAuditPort } from "@/infra/repos/inMemoryBroadcastAudit";
import { createPgBroadcastAuditPort } from "@/infra/repos/pgBroadcastAudit";
import { createPgDoctorBroadcastDeliveryCommitPort } from "@/infra/repos/pgDoctorBroadcastDelivery";
import { createInMemoryDoctorBroadcastDeliveryCommitPort } from "@/infra/repos/inMemoryDoctorBroadcastDelivery";
import { createPgPatientBroadcastsPort } from "@/infra/repos/pgPatientBroadcasts";
import { inMemoryPatientBroadcastsPort } from "@/infra/repos/inMemoryPatientBroadcasts";
import { createPgDoctorMotivationQuotesEditorPort } from "@/infra/repos/pgDoctorMotivationQuotesEditor";
import { inMemoryDoctorMotivationQuotesEditorPort } from "@/infra/repos/inMemoryDoctorMotivationQuotesEditor";
import { inMemoryDoctorAppointmentsPort } from "@/infra/repos/inMemoryDoctorAppointments";
import { inMemoryMessageLogPort } from "@/infra/repos/inMemoryMessageLog";
import { createPgMessageLogPort } from "@/infra/repos/pgMessageLog";
import { createPgDoctorClientsPort } from "@/infra/repos/pgDoctorClients";
import { createPgAdminPlatformUserStatsPort } from "@/infra/repos/pgAdminPlatformUserStats";
import { createInMemoryAdminPlatformUserStatsPort } from "@/infra/repos/inMemoryAdminPlatformUserStats";
import { createPgDoctorAnalyticsMetricAccountsPort } from "@/infra/repos/pgDoctorAnalyticsMetricAccounts";
import { inMemoryDoctorAnalyticsMetricAccountsPort } from "@/infra/repos/inMemoryDoctorAnalyticsMetricAccounts";
import {
  createDoctorAppointmentsReadSwitchPort,
  parseDoctorAppointmentsReadSource,
} from "@/infra/repos/doctorAppointmentsReadSwitch";
import { createPgDoctorCanonicalAppointmentsPort } from "@/infra/repos/pgDoctorCanonicalAppointments";
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
  getPatientCalendarTimezoneIana,
  setPatientCalendarTimezoneIana,
  trySetInitialCalendarTimezoneIfEmpty,
} from "@/infra/repos/pgPatientCalendarTimezone";
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
import { readReminderWebappNotifyGate } from "@/infra/repos/pgReminderWebappNotifyGate";
import { loadPlatformUserChannelBindings } from "@/infra/repos/loadPlatformUserChannelBindings";
import {
  createNoOpReminderTransactionalEmailCooldownPort,
  createPgReminderTransactionalEmailCooldownPort,
} from "@/infra/repos/pgReminderTransactionalEmailCooldown";
import { purgeInMemoryLfkDiaryForUser } from "@/infra/repos/lfkDiary";
import { purgeInMemorySymptomDiaryForUser } from "@/infra/repos/symptomDiary";
import { inMemoryChannelPreferencesPort } from "@/infra/repos/inMemoryChannelPreferences";
import { inMemoryWebPushSubscriptionsPort } from "@/infra/repos/inMemoryWebPushSubscriptions";
import { pgChannelPreferencesPort } from "@/infra/repos/pgChannelPreferences";
import { createPgWebPushSubscriptionsPort } from "@/infra/repos/pgWebPushSubscriptions";
import {
  createPgPatientNotificationTopicsPort,
  inMemoryPatientNotificationTopicsPort,
} from "@/infra/repos/pgPatientNotificationTopics";
import { createPgTopicChannelPrefsPort, inMemoryTopicChannelPrefsPort } from "@/infra/repos/pgTopicChannelPrefs";
import { createPgStaffUsersPort, inMemoryStaffUsersPort } from "@/infra/repos/pgStaffUsers";
import { pgUserProjectionPort, inMemoryUserProjectionPort } from "@/infra/repos/pgUserProjection";
import { pgUserPinsPort } from "@/infra/repos/pgUserPins";
import { inMemoryUserPinsPort } from "@/infra/repos/inMemoryUserPins";
import {
  createPgUserPasswordCredentialsPort,
  inMemoryUserPasswordCredentialsPort,
} from "@/infra/repos/pgUserPasswordCredentials";
import {
  createPgEmailPasswordLookupPort,
  inMemoryEmailPasswordLookupPort,
} from "@/infra/repos/pgEmailPasswordLookup";
import { createEmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";
import { createNoopEmailSetupAccessPort } from "@/modules/auth/emailSetupAccess/noopPort";
import { createPgEmailSetupAccessPort } from "@/infra/repos/pgEmailSetupAccessPort";
import { pgEmailSetupTokensPort } from "@/infra/repos/pgEmailSetupTokens";
import { createEmailSetupTokensService } from "@/modules/auth/emailSetupTokens/service";
import { createEmailSetupFlowService } from "@/modules/auth/emailSetupFlow/service";
import { pgEmailSetupFlowPort } from "@/infra/repos/pgEmailSetupFlowPort";
import { noopEmailSetupFlowPort } from "@/modules/auth/emailSetupFlow/noopPort";
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
import { createNotifyPatientDoctorReply } from "@/modules/messaging/notifyPatientDoctorReply";
import { notifyDoctorPatientMessage } from "@/modules/messaging/notifyDoctorPatientMessage";
import { notifyDoctorPatientProgramNote } from "@/modules/messaging/notifyDoctorPatientProgramNote";
import { registerAdminIncidentStaffPushDeps } from "@/modules/admin-incidents/adminIncidentStaffPushRuntime";
import { registerOperatorAlertDedupPort } from "@/modules/operator-alerts/operatorAlertRuntime";
import { pgOperatorHealthAlertSentPort } from "@/infra/repos/pgOperatorHealthAlertSent";
import { inMemoryOperatorHealthAlertSentPort } from "@/infra/repos/inMemoryOperatorHealthAlertSent";
import { createIntegratorSupportBridge } from "@/modules/messaging/integratorSupportBridge";
import { createSendProgramNoteReply } from "@/modules/messaging/sendProgramNoteReply";
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
import { createPgSpecialistTasksPort } from "@/infra/repos/pgSpecialistTasks";
import { inMemorySpecialistTasksPort } from "@/infra/repos/inMemorySpecialistTasks";
import { createSpecialistTasksService } from "@/modules/specialist-tasks/service";
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
import { createClinicalTestsService, createTestSetsService } from "@/modules/tests/service";
import { createClinicalTestMeasureKindsService } from "@/modules/tests/measureKindsService";
import { createRecommendationsService } from "@/modules/recommendations/service";
import { createCommentsService } from "@/modules/comments/service";
import { createProgramItemDiscussionService } from "@/modules/program-item-discussion/service";
import { createTreatmentProgramService } from "@/modules/treatment-program/service";
import { createTreatmentProgramInstanceService } from "@/modules/treatment-program/instance-service";
import { snapshotPromoDaysBeforeRefresh } from "@/app-layer/treatment-program/snapshotPromoDaysBeforeRefresh";
import { createTreatmentProgramProgressService } from "@/modules/treatment-program/progress-service";
import { createTreatmentProgramPatientActionService } from "@/modules/treatment-program/patient-program-actions";
import { createCoursesService } from "@/modules/courses/service";
import { pgClinicalTestsPort } from "@/infra/repos/pgClinicalTests";
import { pgClinicalTestMeasureKindsPort } from "@/infra/repos/pgClinicalTestMeasureKinds";
import { inMemoryClinicalTestMeasureKindsPort } from "@/infra/repos/inMemoryClinicalTestMeasureKinds";
import { pgTestSetsPort } from "@/infra/repos/pgTestSets";
import { inMemoryClinicalTestsPort } from "@/infra/repos/inMemoryClinicalTests";
import { inMemoryTestSetsPort } from "@/infra/repos/inMemoryTestSets";
import { pgRecommendationsPort } from "@/infra/repos/pgRecommendations";
import { inMemoryRecommendationsPort } from "@/infra/repos/inMemoryRecommendations";
import { createPgCommentsPort } from "@/infra/repos/pgComments";
import { createInMemoryCommentsPort } from "@/infra/repos/inMemoryComments";
import { createPgTreatmentProgramPort } from "@/infra/repos/pgTreatmentProgram";
import { createInMemoryTreatmentProgramPort } from "@/infra/repos/inMemoryTreatmentProgram";
import { createPgTreatmentProgramItemRefValidationPort } from "@/infra/repos/pgTreatmentProgramItemRefValidation";
import { createInMemoryTreatmentProgramItemRefValidationPort } from "@/infra/repos/inMemoryTreatmentProgramItemRefValidation";
import { createPgTreatmentProgramInstancePort } from "@/infra/repos/pgTreatmentProgramInstance";
import {
  createInMemoryTreatmentProgramPersistence,
} from "@/infra/repos/inMemoryTreatmentProgramInstance";
import { createPgTreatmentProgramTestAttemptsPort } from "@/infra/repos/pgTreatmentProgramTestAttempts";
import { createPgProgramActionLogPort } from "@/infra/repos/pgProgramActionLog";
import { createInMemoryProgramActionLogPort } from "@/infra/repos/inMemoryProgramActionLog";
import { createPgDoctorProactiveInsightsPort } from "@/infra/repos/pgDoctorProactiveInsights";
import { createInMemoryDoctorProactiveInsightsPort } from "@/infra/repos/inMemoryDoctorProactiveInsights";
import { createPgProgramItemDiscussionPort } from "@/infra/repos/pgProgramItemDiscussion";
import { createInMemoryProgramItemDiscussionPort } from "@/infra/repos/inMemoryProgramItemDiscussion";
import { createPgPatientDiarySnapshotsPort } from "@/infra/repos/pgPatientDiarySnapshots";
import { createInMemoryPatientDiarySnapshotsPort } from "@/infra/repos/inMemoryPatientDiarySnapshots";
import { createPgTreatmentProgramEventsPort } from "@/infra/repos/pgTreatmentProgramEvents";
import { createPgTreatmentProgramItemSnapshotPort } from "@/infra/repos/pgTreatmentProgramItemSnapshot";
import { createInMemoryTreatmentProgramItemSnapshotPort } from "@/infra/repos/inMemoryTreatmentProgramItemSnapshot";
import { createPgCoursesPort } from "@/infra/repos/pgCourses";
import { createInMemoryCoursesPort } from "@/infra/repos/inMemoryCourses";
import { createLfkTemplatesService } from "@/modules/lfk-templates/service";
import { pgLfkTemplatesPort } from "@/infra/repos/pgLfkTemplates";
import { inMemoryLfkTemplatesPort } from "@/infra/repos/inMemoryLfkTemplates";
import { createLfkAssignmentsService } from "@/modules/lfk-assignments/service";
import type { LfkAssignmentsPort } from "@/modules/lfk-assignments/ports";
import { pgLfkAssignmentsPort } from "@/infra/repos/pgLfkAssignments";
import { checkDbHealth } from "@/infra/db/client";
import { pgOperatorHealthReadPort } from "@/infra/repos/pgOperatorHealthRead";
import { inMemoryOperatorHealthReadPort } from "@/infra/repos/inMemoryOperatorHealthRead";
import { pgOperatorHealthDigestReadPort } from "@/infra/repos/pgOperatorHealthDigestRead";
import { inMemoryOperatorHealthDigestReadPort } from "@/infra/repos/inMemoryOperatorHealthDigestRead";
import { pgOperatorHealthWritePort } from "@/infra/repos/pgOperatorHealthWrite";
import { inMemoryOperatorHealthWritePort } from "@/infra/repos/inMemoryOperatorHealthWrite";
import { pgHealthFailureArchivePort } from "@/infra/repos/pgHealthFailureArchive";
import { inMemoryHealthFailureArchivePort } from "@/infra/repos/inMemoryHealthFailureArchive";
import { createHealthFailureArchiveService } from "@/modules/operator-health/healthFailureArchiveService";
import { createNotificationDeliveryService } from "@/modules/notification-delivery/service";
import { pgNotificationDeliveryAttemptsPort } from "@/infra/repos/pgNotificationDeliveryAttempts";
import { inMemoryNotificationDeliveryAttemptsPort } from "@/infra/repos/inMemoryNotificationDeliveryAttempts";
import { env, integratorWebhookSecret, isS3MediaEnabled, webappReposAreInMemory } from "@/config/env";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { getDeliveryTargetsForIntegrator } from "@/modules/integrator/deliveryTargetsApi";
import { createPatientBookingService } from "@/modules/patient-booking/service";
import { parseBookingSlotsReadSource } from "@/modules/patient-booking/slotsReadSource";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { pgPatientBookingsPort } from "@/infra/repos/pgPatientBookings";
import { inMemoryPatientBookingsPort } from "@/infra/repos/inMemoryPatientBookings";
import { createPgBookingCatalogPort } from "@/infra/repos/pgBookingCatalog";
import { createPgBookingEnginePort } from "@/infra/repos/pgBookingEngine";
import {
  createPgBookingRubitimeBridgePort,
  loadExternalMappingLookup,
  loadReverseMappingLookup,
  stampBeAppointmentMirrorAttribution,
} from "@/infra/repos/pgBookingRubitimeBridge";
import { createAppointmentMirrorSyncService } from "@/modules/booking-appointment-sync/service";
import { createBookingCatalogService } from "@/modules/booking-catalog/service";
import { createBookingEngineService } from "@/modules/booking-engine/service";
import { createPgBookingSchedulingPort } from "@/infra/repos/pgBookingScheduling";
import { createBookingSchedulingService } from "@/modules/booking-scheduling/service";
import { createPgRubitimeMappingPort } from "@/infra/repos/pgRubitimeMapping";
import { createRubitimeMappingService } from "@/modules/rubitime-mapping/service";
import { createBookingCalendarService } from "@/modules/booking-calendar/service";
import { createPgBookingCalendarPort } from "@/infra/repos/pgBookingCalendar";
import { createClientHistoryService } from "@/modules/client-history/service";
import { createPgClientHistoryPort } from "@/infra/repos/pgClientHistory";
import { inMemoryClientHistoryPort } from "@/infra/repos/inMemoryClientHistory";
import { createPgBookingFormPort } from "@/infra/repos/pgBookingForm";
import { createBookingFormService } from "@/modules/booking-form/service";
import { createPgPatientMergeCandidatePort } from "@/infra/repos/pgPatientMergeCandidate";
import { createPatientMergeCandidateService } from "@/modules/patient-merge-candidate/service";
import { createPgPlatformUserContactsPort } from "@/infra/repos/pgPlatformUserContacts";
import { createInMemoryPlatformUserContactsPort } from "@/infra/repos/inMemoryPlatformUserContacts";
import { createPlatformUserContactsService } from "@/modules/platform-user-contacts/service";
import { toDoctorSupplementaryContacts } from "@/modules/platform-user-contacts/bookingContactUpsert";
import { createPgBookingPoliciesPort } from "@/infra/repos/pgBookingPolicies";
import { createBookingPoliciesService } from "@/modules/booking-policies/service";
import { createPgBookingAppointmentLifecyclePort } from "@/infra/repos/pgBookingAppointmentLifecycle";
import { createBookingAppointmentLifecycleService } from "@/modules/booking-appointment-lifecycle/service";
import { createPgPaymentsPort } from "@/infra/repos/pgPayments";
import { createPaymentsService, createPaymentsConfigReader } from "@/modules/payments/service";
import { createPgMembershipsPort } from "@/infra/repos/pgMemberships";
import { createMembershipsService } from "@/modules/memberships/service";
import { createPgProductsPort } from "@/infra/repos/pgProducts";
import { createProductsService } from "@/modules/products/service";
import type { ProductsService } from "@/modules/products/service";
import { createPgEntitlementsPort } from "@/infra/repos/pgEntitlements";
import { createEntitlementsService } from "@/modules/entitlements/service";
import { wrapBookingEngineMembershipHooks } from "@/app-layer/booking/wrapBookingEngineMembershipHooks";
import { createPgPatientHomeBlocksPort } from "@/infra/repos/pgPatientHomeBlocks";
import { createInMemoryPatientHomeBlocksPort } from "@/infra/repos/inMemoryPatientHomeBlocks";
import { createPgPatientHomeLegacyContentPort } from "@/infra/repos/pgPatientHomeLegacyContent";
import { createInMemoryPatientHomeLegacyContentPort } from "@/infra/repos/inMemoryPatientHomeLegacyContent";
import { createPgPatientPracticeCompletionsPort } from "@/infra/repos/pgPatientPracticeCompletions";
import { createInMemoryPatientPracticeCompletionsPort } from "@/infra/repos/inMemoryPatientPracticeCompletions";
import { createPgPatientDailyWarmupPresentationPort } from "@/infra/repos/pgPatientDailyWarmupPresentation";
import { createInMemoryPatientDailyWarmupPresentationPort } from "@/infra/repos/inMemoryPatientDailyWarmupPresentation";
import { createPgPatientDailyWarmupVideoViewPort } from "@/infra/repos/pgPatientDailyWarmupVideoView";
import { createInMemoryPatientDailyWarmupVideoViewPort } from "@/infra/repos/inMemoryPatientDailyWarmupVideoView";
import { createPgMaterialRatingPort } from "@/infra/repos/pgMaterialRating";
import { createInMemoryMaterialRatingPort } from "@/infra/repos/inMemoryMaterialRating";
import { createMaterialRatingService } from "@/modules/material-rating/service";
import { createPgMaterialRatingFeedbackPort } from "@/infra/repos/pgMaterialRatingFeedback";
import { createInMemoryMaterialRatingFeedbackPort } from "@/infra/repos/inMemoryMaterialRatingFeedback";
import { createMaterialRatingFeedbackService } from "@/modules/material-rating-feedback/service";
import { isContentPageInDailyWarmupBlock } from "@/modules/patient-home/todayConfig";
import { createPgWarmupFeelingCompletionPort } from "@/infra/repos/pgWarmupFeelingCompletion";
import { createInMemoryWarmupFeelingCompletionPort } from "@/infra/repos/inMemoryWarmupFeelingCompletion";
import { createPatientHomeBlocksService } from "@/modules/patient-home/service";
import { createPatientPracticeService } from "@/modules/patient-practice/service";
import { createPatientMoodService } from "@/modules/patient-mood/service";

const inMemoryRepos = webappReposAreInMemory();

const adminPlatformUserStatsPort = !inMemoryRepos
  ? createPgAdminPlatformUserStatsPort()
  : createInMemoryAdminPlatformUserStatsPort();
const adminPlatformUserStats = createAdminPlatformUserStatsService(adminPlatformUserStatsPort);

const productAnalyticsPort = !inMemoryRepos
  ? createPgProductAnalyticsPort()
  : createInMemoryProductAnalyticsPort();
const productAnalytics = createProductAnalyticsService(productAnalyticsPort);

const operatorHealthReadPort = !inMemoryRepos ? pgOperatorHealthReadPort : inMemoryOperatorHealthReadPort;
const operatorHealthDigestReadPort = !inMemoryRepos
  ? pgOperatorHealthDigestReadPort
  : inMemoryOperatorHealthDigestReadPort;
const operatorHealthWritePort = !inMemoryRepos ? pgOperatorHealthWritePort : inMemoryOperatorHealthWritePort;
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
const channelPreferencesPort = !inMemoryRepos ? pgChannelPreferencesPort : inMemoryChannelPreferencesPort;
const webPushSubscriptionsPort = !inMemoryRepos
  ? createPgWebPushSubscriptionsPort()
  : inMemoryWebPushSubscriptionsPort;
const reminderTransactionalEmailCooldownPort = !inMemoryRepos
  ? createPgReminderTransactionalEmailCooldownPort()
  : createNoOpReminderTransactionalEmailCooldownPort();
const topicChannelPrefsPort = !inMemoryRepos ? createPgTopicChannelPrefsPort() : inMemoryTopicChannelPrefsPort;
const staffUsersPort = !inMemoryRepos ? createPgStaffUsersPort() : inMemoryStaffUsersPort;
const patientNotificationTopicsPort = !inMemoryRepos
  ? createPgPatientNotificationTopicsPort()
  : inMemoryPatientNotificationTopicsPort;
const userByPhonePort = !inMemoryRepos ? pgUserByPhonePort : inMemoryUserByPhonePort;
const userPinsPort = !inMemoryRepos ? pgUserPinsPort : inMemoryUserPinsPort;
const userPasswordCredentialsPort = !inMemoryRepos
  ? createPgUserPasswordCredentialsPort()
  : inMemoryUserPasswordCredentialsPort;
const emailPasswordLookupPort = !inMemoryRepos
  ? createPgEmailPasswordLookupPort()
  : inMemoryEmailPasswordLookupPort;
const oauthBindingsPort = !inMemoryRepos ? pgOAuthBindingsPort : inMemoryOAuthBindingsPort;
const loginTokensPort = !inMemoryRepos ? pgLoginTokensPort : inMemoryLoginTokensPort;
const identityResolutionPort = !inMemoryRepos ? pgIdentityResolutionPort : inMemoryIdentityResolutionPort;
const doctorClientsPort = !inMemoryRepos ? createPgDoctorClientsPort() : inMemoryDoctorClientsPort;
const challengeStore = !inMemoryRepos ? createPgPhoneChallengeStore() : inMemoryPhoneChallengeStore;
const phoneMessengerBindPort = !inMemoryRepos ? createPgPhoneMessengerBindPort() : undefined;
registerPhoneMessengerBindPort(phoneMessengerBindPort ?? null);
const messageLogPort = !inMemoryRepos ? createPgMessageLogPort() : inMemoryMessageLogPort;
const broadcastAuditPort = !inMemoryRepos ? createPgBroadcastAuditPort() : inMemoryBroadcastAuditPort;
const doctorBroadcastDeliveryCommitPort = !inMemoryRepos
  ? createPgDoctorBroadcastDeliveryCommitPort()
  : createInMemoryDoctorBroadcastDeliveryCommitPort();
const patientBroadcastsPort = !inMemoryRepos ? createPgPatientBroadcastsPort() : inMemoryPatientBroadcastsPort;
const doctorMotivationQuotesEditorPort = !inMemoryRepos
  ? createPgDoctorMotivationQuotesEditorPort()
  : inMemoryDoctorMotivationQuotesEditorPort;
const userProjectionPort = !inMemoryRepos ? pgUserProjectionPort : inMemoryUserProjectionPort;
const emailSetupAccessService = createEmailSetupAccessService(
  !inMemoryRepos ? createPgEmailSetupAccessPort(pgEmailSetupTokensPort) : createNoopEmailSetupAccessPort(),
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
const patientBookingsPort = !inMemoryRepos
  ? pgPatientBookingsPort
  : inMemoryPatientBookingsPort;
const bookingCatalogPort = !inMemoryRepos ? createPgBookingCatalogPort() : null;
const bookingCatalogService = bookingCatalogPort
  ? createBookingCatalogService(bookingCatalogPort)
  : null;
const bookingEngineCorePort = !inMemoryRepos ? createPgBookingEnginePort() : null;
const doctorAppointmentsLegacyPort = !inMemoryRepos
  ? createPgDoctorAppointmentsPort()
  : inMemoryDoctorAppointmentsPort;
const doctorAppointmentsCanonicalPort =
  !inMemoryRepos && bookingEngineCorePort
    ? createPgDoctorCanonicalAppointmentsPort(() => bookingEngineCorePort.getDefaultOrganizationId())
    : null;
const bookingRubitimeBridgePort = !inMemoryRepos ? createPgBookingRubitimeBridgePort() : null;
const appointmentMirrorSync =
  bookingRubitimeBridgePort && bookingEngineCorePort
    ? createAppointmentMirrorSyncService({
        bridge: bookingRubitimeBridgePort,
        syncPort: createBookingSyncPort(),
        getDefaultOrganizationId: () => bookingEngineCorePort.getDefaultOrganizationId(),
        loadForwardMapping: loadExternalMappingLookup,
        loadReverseMapping: loadReverseMappingLookup,
        stampCanonicalOutbound: (appointmentId) =>
          stampBeAppointmentMirrorAttribution(appointmentId, "canonical"),
      })
    : null;
const bookingEnginePort =
  bookingEngineCorePort && bookingRubitimeBridgePort
    ? { ...bookingEngineCorePort, ...bookingRubitimeBridgePort }
    : null;
const bookingEngineService = bookingEnginePort
  ? createBookingEngineService(bookingEnginePort)
  : null;
const bookingSchedulingPort =
  bookingEngineCorePort && !inMemoryRepos
    ? createPgBookingSchedulingPort(() => bookingEngineCorePort.getDefaultOrganizationId())
    : null;
const bookingSchedulingService = bookingSchedulingPort
  ? createBookingSchedulingService(bookingSchedulingPort)
  : null;
const rubitimeMappingPort =
  bookingCatalogPort && bookingSchedulingPort && bookingEngineCorePort && !inMemoryRepos
    ? createPgRubitimeMappingPort({
        bookingCatalogPort,
        resolveLegacyBranchServiceId: (input) => bookingSchedulingPort.resolveLegacyBranchServiceId(input),
        upsertSpecialistServiceAvailability: (input) =>
          bookingEngineCorePort.upsertSpecialistServiceAvailability(input),
      })
    : null;
const rubitimeMappingService = rubitimeMappingPort
  ? createRubitimeMappingService(rubitimeMappingPort)
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
          const row = await systemSettingsService.getSetting("booking_calendar_show_working_hours", "admin");
          const raw =
            row?.valueJson && typeof row.valueJson === "object"
              ? (row.valueJson as { value?: unknown }).value
              : null;
          if (typeof raw === "boolean") return raw;
          if (raw === "true" || raw === 1) return true;
          if (raw === "false" || raw === 0) return false;
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
const bookingPoliciesService = bookingPoliciesPort ? createBookingPoliciesService(bookingPoliciesPort) : null;
const bookingAppointmentLifecyclePort = !inMemoryRepos ? createPgBookingAppointmentLifecyclePort() : null;
const bookingAppointmentLifecycleService =
  bookingAppointmentLifecyclePort && bookingPoliciesService
    ? createBookingAppointmentLifecycleService({
        lifecyclePort: bookingAppointmentLifecyclePort,
        policies: bookingPoliciesService,
      })
    : null;
const branchesProjectionPort = !inMemoryRepos ? createPgBranchesProjectionPort() : null;
const subscriptionMailingProjectionPort = !inMemoryRepos
  ? createPgSubscriptionMailingProjectionPort()
  : inMemorySubscriptionMailingProjectionPort;
const contentPagesPort = !inMemoryRepos ? createPgContentPagesPort() : inMemoryContentPagesPort;
const contentSectionsPort = !inMemoryRepos ? createPgContentSectionsPort() : inMemoryContentSectionsPort;
const remindersService = createRemindersService(reminderRulesPort, {
  notifyIntegrator: notifyIntegratorRuleUpdated,
  journal: reminderJournalPort,
  webPushSubscriptions: webPushSubscriptionsPort,
  contentSections: contentSectionsPort,
});
const mediaStoragePort =
  !inMemoryRepos && isS3MediaEnabled(env)
    ? createS3MediaStoragePort()
    : mockMediaStoragePort;
const referencesPort = !inMemoryRepos ? pgReferencesPort : inMemoryReferencesPort;
const doctorNotesPort = !inMemoryRepos ? createPgDoctorNotesPort() : inMemoryDoctorNotesPort;
const doctorNotesService = createDoctorNotesService(doctorNotesPort);
const specialistTasksPort = !inMemoryRepos ? createPgSpecialistTasksPort() : inMemorySpecialistTasksPort;
const specialistTasksService = createSpecialistTasksService(specialistTasksPort);

const systemSettingsPort = !inMemoryRepos ? createPgSystemSettingsPort() : inMemorySystemSettingsPort;
const systemSettingsService = createSystemSettingsService(systemSettingsPort);
const resolveDoctorAppointmentsReadSource = async () => {
  if (inMemoryRepos) return "rubitime_legacy" as const;
  const row = await systemSettingsService.getSetting("booking_doctor_appointments_read_source", "admin");
  return parseDoctorAppointmentsReadSource(row?.valueJson ?? null);
};
const doctorAppointmentsPort = createDoctorAppointmentsReadSwitchPort({
  legacyPort: doctorAppointmentsLegacyPort,
  canonicalPort: doctorAppointmentsCanonicalPort,
  resolveReadSource: resolveDoctorAppointmentsReadSource,
});
const doctorAnalyticsMetricAccountsPort =
  !inMemoryRepos && bookingEngineCorePort
    ? createPgDoctorAnalyticsMetricAccountsPort(
        () => bookingEngineCorePort.getDefaultOrganizationId(),
        resolveDoctorAppointmentsReadSource,
      )
    : inMemoryDoctorAnalyticsMetricAccountsPort;
const membershipsPort = !inMemoryRepos ? createPgMembershipsPort() : null;
const productsPort = !inMemoryRepos ? createPgProductsPort() : null;
const entitlementsPort = !inMemoryRepos ? createPgEntitlementsPort() : null;
const entitlementsService = entitlementsPort ? createEntitlementsService({ port: entitlementsPort }) : null;
let productsServiceResolved: ProductsService | null = null;
const resolveMembershipServiceTitle =
  bookingEngineService
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
      })
    : null;

const paymentsPort = !inMemoryRepos ? createPgPaymentsPort() : null;
const bookingSyncPortForPayments = createBookingSyncPort();
const paymentsService =
  paymentsPort && bookingEngineService
    ? createPaymentsService({
        port: paymentsPort,
        config: createPaymentsConfigReader((key) => systemSettingsService.getSetting(key, "admin")),
        bookingEngine: bookingEngineService,
        onPackagePaymentCaptured: membershipsService
          ? async ({ patientPackageId, paymentId, organizationId }) => {
              await membershipsService.activatePatientPackage(
                patientPackageId,
                organizationId,
                paymentId,
              );
            }
          : undefined,
        onProductPaymentCaptured: async ({ productPurchaseId, paymentId, organizationId }) => {
          if (productsServiceResolved) {
            await productsServiceResolved.activatePurchase(
              productPurchaseId,
              organizationId,
              paymentId,
            );
          }
        },
        onAppointmentPaymentConfirmed: async ({ appointmentId, paymentId, platformUserId }) => {
          const row = await patientBookingsPort.markConfirmedByCanonicalAppointment(appointmentId, null);
          if (!row) return;
          try {
            const { loadBookingLifecycleNotificationsFromSystemSettings, resolveBookingNotifyTargets } = await import(
              "@/modules/booking-notifications/settings"
            );
            const notificationSettings = await loadBookingLifecycleNotificationsFromSystemSettings((key, scope) =>
              systemSettingsService.getSetting(key, scope),
            );
            const paymentNotify = resolveBookingNotifyTargets(
              "booking.payment_captured",
              { notifyPatient: true, notifyStaff: true },
              notificationSettings,
            );
            if (paymentNotify.notifyPatient || paymentNotify.notifyStaff) {
              await bookingSyncPortForPayments.emitBookingEvent({
                eventType: "booking.payment_captured",
                idempotencyKey: `booking.payment_captured:${paymentId}`,
                payload: {
                  bookingId: row.id,
                  userId: platformUserId ?? row.userId ?? row.id,
                  rubitimeId: row.rubitimeId,
                  bookingType: row.bookingType,
                  city: row.city ?? undefined,
                  category: row.category,
                  slotStart: row.slotStart,
                  slotEnd: row.slotEnd,
                  contactName: row.contactName,
                  contactPhone: row.contactPhone,
                  contactEmail: row.contactEmail ?? undefined,
                  branchServiceId: row.branchServiceId,
                  cityCodeSnapshot: row.cityCodeSnapshot,
                  serviceTitleSnapshot: row.serviceTitleSnapshot,
                  canonicalAppointmentId: appointmentId,
                },
              });
            }
          } catch {
            // Notifications are best-effort.
          }
        },
        syncServicePrepaymentApplicable: async (serviceId, applicable) => {
          const svc = await bookingEngineService.services.getService(serviceId);
          if (!svc) return;
          await bookingEngineService.services.upsertService({
            organizationId: svc.organizationId,
            id: svc.id,
            title: svc.title,
            description: svc.description,
            durationMinutes: svc.durationMinutes,
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

const refreshPackageCalendarForAppointment = bookingEngineService
  ? async (appointmentId: string) => {
      const { syncPackageCalendarAfterUsageChange } = await import(
        "@/app-layer/booking/emitPackageCalendarSync"
      );
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
const clinicalTestMeasureKindsService = createClinicalTestMeasureKindsService(clinicalTestMeasureKindsPort);
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
const treatmentProgramInMemoryPersistence = inMemoryRepos ? createInMemoryTreatmentProgramPersistence() : null;
const treatmentProgramInstancePort = treatmentProgramInMemoryPersistence
  ? treatmentProgramInMemoryPersistence.instancePort
  : createPgTreatmentProgramInstancePort();
const treatmentProgramTestAttemptsPort = treatmentProgramInMemoryPersistence
  ? treatmentProgramInMemoryPersistence.testAttemptsPort
  : createPgTreatmentProgramTestAttemptsPort();
const treatmentProgramEventsPort = treatmentProgramInMemoryPersistence
  ? treatmentProgramInMemoryPersistence.eventsPort
  : createPgTreatmentProgramEventsPort();
const programActionLogPort = !inMemoryRepos ? createPgProgramActionLogPort() : createInMemoryProgramActionLogPort();
const doctorProactiveInsightsPort = !inMemoryRepos
  ? createPgDoctorProactiveInsightsPort()
  : createInMemoryDoctorProactiveInsightsPort();
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
const resolvePatientLabelForDoctorNotify = async (platformUserId: string): Promise<string> => {
  const identity = await doctorClientsPort.getClientIdentity(platformUserId);
  return identity?.displayName?.trim() || identity?.phone?.trim() || "Пациент";
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
const materialRatingPort = !inMemoryRepos ? createPgMaterialRatingPort() : createInMemoryMaterialRatingPort();
const materialRatingService = createMaterialRatingService({
  ratings: materialRatingPort,
  contentPages: contentPagesPort,
  itemRefs: treatmentProgramItemRefValidationPort,
  instances: treatmentProgramInstancePort,
});
const materialRatingFeedbackPort = !inMemoryRepos
  ? createPgMaterialRatingFeedbackPort()
  : createInMemoryMaterialRatingFeedbackPort();
const materialRatingFeedbackService = createMaterialRatingFeedbackService({
  feedback: materialRatingFeedbackPort,
  isDailyWarmupContentPage: (contentPageId) =>
    isContentPageInDailyWarmupBlock(contentPageId, {
      patientHomeBlocks: patientHomeBlocksPort,
      contentPages: contentPagesPort,
      contentSections: contentSectionsPort,
      systemSettings: systemSettingsService,
    }),
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
  getDefaultPromoTemplateId: () => systemSettingsService.getPatientDefaultPromoTreatmentProgramTemplateId(),
  snapshotDiaryDaysBeforePromoRefresh: (input) =>
    snapshotPromoDaysBeforeRefresh(
      {
        reminders: remindersService,
        patientPractice: patientPracticeService,
        programActionLog: programActionLogPort,
        treatmentProgramInstance: {
          listInstancesForPatient: (userId) => treatmentProgramInstancePort.listInstancesForPatient(userId),
          getInstanceForPatient: (userId, instanceId) =>
            treatmentProgramInstancePort.getInstanceForPatient(userId, instanceId),
        },
        diarySnapshots: patientDiarySnapshotsPort,
        getAppDefaultTimezoneIana: getAppDisplayTimeZone,
        getPatientCalendarTimezoneIana: patientCalendarTimezoneGet,
      },
      input,
    ),
});
const coursesService = createCoursesService({
  courses: coursesPort,
  introPages: contentPagesPort,
  assignTemplateToPatient: (input) => treatmentProgramInstanceService.assignTemplateToPatient(input),
});

productsServiceResolved =
  productsPort && paymentsService
    ? createProductsService({
        port: productsPort,
        payments: paymentsService,
        entitlements: entitlementsService,
        memberships: membershipsServiceResolved,
        courses: coursesService,
        resolvePlatformUserByPhone: (phone, name) =>
          import("@/app-layer/platform-user/resolveOrCreateUserByPhone").then((m) =>
            m.resolveOrCreateUserByPhone(phone, name),
          ),
      })
    : null;

patientBookingService = createPatientBookingService({
  bookingsPort: patientBookingsPort,
  syncPort: createBookingSyncPort(),
  appointmentMirrorSync: appointmentMirrorSync ?? undefined,
  bookingCatalog: bookingCatalogService,
  bookingEngine: bookingEngineService,
  bookingScheduling: bookingSchedulingService,
  bookingForm: bookingFormService,
  appointmentProjection: appointmentProjectionPort,
  appointmentLifecycle: bookingAppointmentLifecycleService,
  payments: paymentsService,
  memberships: membershipsServiceResolved,
  products: productsServiceResolved,
  clientHistory: clientHistoryService,
  platformUserContacts: platformUserContactsService,
  getPlatformUserIdentityContacts: async (userId) => {
    const identity = await doctorClientsPort.getClientIdentity(userId);
    if (!identity) return null;
    return { phone: identity.phone, email: identity.email ?? null };
  },
  resolveSlotsReadSource: async () => {
    if (inMemoryRepos) return "rubitime";
    const row = await systemSettingsService.getSetting("booking_slots_read_source", "admin");
    return parseBookingSlotsReadSource(row?.valueJson ?? null);
  },
  isRubitimeBridgeEnabled: bookingRubitimeBridgePort
    ? () => bookingRubitimeBridgePort.isBridgeEnabled()
    : undefined,
  getBookingLifecycleNotificationSettings: async () => {
    const row = await systemSettingsService.getSetting("booking_lifecycle_notifications", "admin");
    const { parseBookingLifecycleNotificationsSettings } = await import(
      "@/modules/booking-notifications/settings"
    );
    return parseBookingLifecycleNotificationsSettings(row?.valueJson ?? null);
  },
  branches: branchesProjectionPort ?? undefined,
});

const patientHomeBlocksService = createPatientHomeBlocksService({
  port: patientHomeBlocksPort,
  contentPages: contentPagesPort,
  contentSections: contentSectionsPort,
  courses: coursesService,
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
    throw new Error("Назначение шаблона ЛФК доступно только при подключённой базе данных.");
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
  getProfileEmailFields: (platformUserId) => userProjectionPort.getProfileEmailFields(platformUserId),
  getChannelBindings: loadPlatformUserChannelBindings,
});
const sendProgramNoteReply = createSendProgramNoteReply({
  supportCommunication: supportCommunicationPort,
  discussion: programItemDiscussionService,
  notifyPatientOfDoctorReply: notifyPatientDoctorReply,
});

const notifyDoctorOfPatientMessageImpl = async (input: {
  platformUserId: string;
  messageId: string;
  messageText: string;
  patientLabel: string;
  source: "webapp" | "telegram" | "max";
}) => {
  await notifyDoctorPatientMessage(input, { staffDeps: doctorPatientMessageStaffDeps });
};

const integratorSupportBridge = createIntegratorSupportBridge({
  port: supportCommunicationPort,
  notifyPatientOfDoctorReply: notifyPatientDoctorReply,
  sendProgramNoteReply,
  notifyDoctorOfPatientMessage: notifyDoctorOfPatientMessageImpl,
  resolvePatientLabel: resolvePatientLabelForDoctorNotify,
});
const patientMessagingService = createPatientMessagingService(supportCommunicationPort, {
  isUserMessagingBlocked: (uid) => doctorClientsPort.isClientMessagingBlocked(uid),
  notifyDoctorOfPatientMessage: async (input) => {
    await notifyDoctorOfPatientMessageImpl({ ...input, source: "webapp" });
  },
  resolvePatientLabel: resolvePatientLabelForDoctorNotify,
});
const doctorSupportMessagingService = createDoctorSupportMessagingService(supportCommunicationPort, {
  shouldDispatchRelay: (ctx) => systemSettingsService.shouldDispatchRelayToRecipient(ctx),
  notifyPatientOfDoctorReply: notifyPatientDoctorReply,
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

function isStillUpcomingSlot(row: { recordAt: string | null; status: string }): boolean {
  const st = row.status.toLowerCase();
  if (st !== "created" && st !== "updated") return false;
  const nowMs = Date.now();
  if (row.recordAt == null) return true;
  return new Date(row.recordAt).getTime() >= nowMs;
}

const getPastAppointments: (userId: string) => Promise<PastAppointmentSummary[]> =
  !inMemoryRepos && appointmentProjectionPort
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
const patientMoodService = createPatientMoodService({
  diaries: symptomDiaryService,
  references: referencesPort,
});
const lfkDiaryService = createLfkDiaryService(lfkDiaryPort);
const channelPreferencesService = createChannelPreferencesService(channelPreferencesPort, {
  webPushHasSubscription: (userId) => webPushSubscriptionsPort.hasAnyForUserId(userId),
});
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
  ensureAuthModulePortsBound();
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
    getDoctorSupportDefault: async (key) => {
      const row = await systemSettingsService.getSetting(key, "doctor");
      return parseDoctorSupportDefaultEnabled(row?.valueJson ?? null);
    },
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
      exchangeTelegramLoginWidget: (payload: TelegramLoginWidgetPayload, webappEntryToken?: string | null) =>
        exchangeTelegramLoginWidget(payload, identityResolutionPort, userProjectionPort.updateRole, webappEntryToken),
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
        try {
          await markPhoneMessengerBindConsumedByChallenge(challengeId, phoneMessengerBindPort);
          if (result.user.role !== envRole) {
            await userProjectionPort.updateRole(result.user.userId, envRole);
          }
          await consumePhoneOtpChallenge(challengeId, phoneAuthDeps);
        } catch {
          return { ok: false as const, code: "server_error" };
        }
        const user =
          result.user.role === envRole ? result.user : { ...result.user, role: envRole };
        return {
          ok: true as const,
          user,
          redirectTo: getRedirectPathForRole(envRole),
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
    specialistTasks: specialistTasksService,
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
      getClientContactBreakdown: (audience) => doctorClientsPort.getClientContactBreakdown(audience),
      getDashboardPatientMetrics: (audience) => doctorClientsPort.getDashboardPatientMetrics(audience),
      getDashboardAppointmentMetrics: (audience) =>
        doctorAppointmentsPort.getDashboardAppointmentMetrics(audience),
    }),
    doctorAnalyticsMetricAccounts: doctorAnalyticsMetricAccountsPort,
    adminPlatformUserStats,
    productAnalytics,
    doctorBroadcasts: createDoctorBroadcastsService({
      resolveBroadcastAudience: async (filter, channels, category) => {
        const clients = await listClientsForBroadcastAudience(doctorClientsPort, filter);
        const { devMode, testAccounts } = await systemSettingsService.getRelayDevContext();
        const { effective, nominal, cappedByDevMode } = resolveBroadcastEffectiveClients(
          clients,
          channels,
          devMode,
          testAccounts,
        );
        const prefsMap = await channelPreferencesPort.getBroadcastNotificationFlagsBatch(effective.map((c) => c.userId));
        const webPushEligibleUserIds = channels.includes("push")
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
        recordDeliveryAttempt: (input) => notificationDelivery.recordNotificationDeliveryAttempt(input),
        patientInboundChatPort: supportCommunicationPort,
      },
    }),
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
      listLfkComplexExerciseLinesForUser: lfkDiaryService.listLfkComplexExerciseLinesForUser,
      updateLfkComplexExerciseLocalCommentForUser: lfkDiaryService.updateLfkComplexExerciseLocalCommentForUser,
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
    operatorHealthDigestRead: operatorHealthDigestReadPort,
    operatorHealthWrite: operatorHealthWritePort,
    healthFailureArchive,
    notificationDelivery,
    media: mediaService,
    channelPreferences: channelPreferencesService,
    channelPreferencesPort,
    webPushSubscriptions: webPushSubscriptionsPort,
    readReminderNotifyGate: readReminderWebappNotifyGate,
    loadPlatformUserChannelBindings,
    reminderTransactionalEmailCooldown: reminderTransactionalEmailCooldownPort,
    contentCatalog,
    deliveryTargetsApi: {
      getTargets: (params: {
        phone?: string;
        telegramId?: string;
        maxId?: string;
        topic?: string;
        integratorUserId?: string;
      }) => getDeliveryTargetsForIntegrator(params, integratorDeliveryTargetsDeps),
    },
    topicChannelPrefs: topicChannelPrefsPort,
    staffUsers: staffUsersPort,
    patientNotificationTopics: patientNotificationTopicsPort,
    userProjection: {
      upsertFromProjection: userProjectionPort.upsertFromProjection,
      ensureClientFromAppointmentProjection: userProjectionPort.ensureClientFromAppointmentProjection,
      findByIntegratorId: userProjectionPort.findByIntegratorId,
      findByPhoneNormalized: userProjectionPort.findByPhoneNormalized,
      updatePhone: userProjectionPort.updatePhone,
      updateDisplayName: userProjectionPort.updateDisplayName,
      updateProfileByPhone: userProjectionPort.updateProfileByPhone,
      upsertNotificationTopics: userProjectionPort.upsertNotificationTopics,
      updateRole: userProjectionPort.updateRole,
      getProfileEmailFields: userProjectionPort.getProfileEmailFields,
      clearStaffAccountEmail: userProjectionPort.clearStaffAccountEmail,
      applyRubitimeEmailAutobind: userProjectionPort.applyRubitimeEmailAutobind,
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
      doctorSupport: doctorSupportMessagingService,
    },
    reminders: remindersService,
    /** Журнал snooze/skip/done; `undefined` в Vitest без БД. */
    reminderJournal: reminderJournalPort,
    reminderProjection: reminderProjectionPort,
    appointmentProjection: appointmentProjectionPort,
    branches: branchesProjectionPort ?? undefined,
    subscriptionMailingProjection: subscriptionMailingProjectionPort,
    contentPages: contentPagesPort,
    contentSections: contentSectionsPort,
    userByPhone: userByPhonePort,
    phoneMessengerBind: {
      start: (params: Parameters<typeof startPhoneMessengerBind>[0]) =>
        startPhoneMessengerBind(params, phoneMessengerBindPort),
      getStatus: (setupToken: string) => getPhoneMessengerBindStatus(setupToken, phoneMessengerBindPort),
      completeFromIntegrator: (params: Parameters<typeof completePhoneMessengerBindFromIntegrator>[0]) =>
        completePhoneMessengerBindFromIntegrator(params, phoneAuthDeps, phoneMessengerBindPort),
      markConsumedByChallenge: (challengeId: string) =>
        markPhoneMessengerBindConsumedByChallenge(challengeId, phoneMessengerBindPort),
      resolveLoginChallenge: (setupToken: string) =>
        resolvePhoneMessengerBindLoginChallenge(setupToken, phoneAuthDeps, phoneMessengerBindPort),
    },
    userPins: userPinsPort,
    userPasswordCredentials: userPasswordCredentialsPort,
    emailPasswordLookup: emailPasswordLookupPort,
    emailSetupAccess: emailSetupAccessService,
    emailSetupFlow: emailSetupFlowService,
    oauthBindings: oauthBindingsPort,
    loginTokens: loginTokensPort,
    systemSettings: systemSettingsService,
    lfkExercises: lfkExercisesService,
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
    materialRating: materialRatingService,
    materialRatingFeedback: materialRatingFeedbackService,
    warmupFeelingCompletion: warmupFeelingCompletionPort,
    patientMood: patientMoodService,
    treatmentProgramProgress: treatmentProgramProgressService,
    doctorProactiveInsights: doctorProactiveInsightsPort,
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
    bookingCatalog: bookingCatalogService,
    /** Raw PG port for admin booking-catalog API (null only in Vitest without DB). */
    bookingCatalogPort,
    bookingEngine: bookingEngineService,
    /** Raw PG port for admin booking-engine API (null only in Vitest without DB). */
    bookingEnginePort,
    rubitimeCanonicalProjection: bookingRubitimeBridgePort ?? undefined,
    appointmentMirrorSync: appointmentMirrorSync ?? undefined,
    bookingScheduling: bookingSchedulingService,
    rubitimeMapping: rubitimeMappingService,
    bookingCalendar: bookingCalendarService,
    clientHistory: clientHistoryService,
    bookingForm: bookingFormService,
    bookingPolicies: bookingPoliciesService,
    bookingAppointmentLifecycle: bookingAppointmentLifecycleService,
    payments: paymentsService,
    memberships: membershipsServiceResolved,
    products: productsServiceResolved,
    entitlements: entitlementsService,
    patientMergeCandidate: patientMergeCandidateService,
    platformUserContacts: platformUserContactsService,
  };
}

/**
 * Одна мемоизированная сборка на один server request (React.cache в Next RSC).
 * В юнит-тестах без request-scope повторные вызовы могут давать разные объекты.
 */
export const buildAppDeps = cache(_buildAppDeps);
