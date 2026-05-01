import { relations } from "drizzle-orm/relations";
import { clinicalTests, testSets, testSetItems } from "./clinicalTests";
import { recommendations } from "./recommendations";
import {
	treatmentProgramTemplates,
	treatmentProgramTemplateStages,
	treatmentProgramTemplateStageItems,
} from "./treatmentProgramTemplates";
import {
	treatmentProgramInstances,
	treatmentProgramInstanceStages,
	treatmentProgramInstanceStageItems,
} from "./treatmentProgramInstances";
import { treatmentProgramEvents } from "./treatmentProgramEvents";
import {
	treatmentProgramTestAttempts,
	treatmentProgramTestResults,
} from "./treatmentProgramTestAttempts";
import { entityComments } from "./entityComments";
import { courses } from "./courses";
import { platformUsers, supportConversations, messageLog, userChannelBindings, supportQuestions, supportQuestionMessages, supportConversationMessages, supportDeliveryEvents, symptomEntries, symptomTrackings, contentAccessGrantsWebapp, branches, appointmentRecords, emailChallenges, userPins, channelLinkSecrets, userChannelPreferences, userOauthBindings, lfkComplexes, lfkSessions, loginTokens, referenceCategories, referenceItems, doctorNotes, lfkExercises, lfkComplexTemplateExercises, lfkComplexTemplates, lfkExerciseMedia, patientLfkAssignments, lfkComplexExercises, mediaFolders, mediaFiles, bookingCities, bookingBranches, bookingSpecialists, bookingBranchServices, bookingServices, onlineIntakeRequests, patientBookings, onlineIntakeAnswers, onlineIntakeAttachments, onlineIntakeStatusHistory, reminderRules, reminderOccurrenceHistory, reminderJournal, adminAuditLog, mediaUploadSessions, users, identities, contacts, contentPages, messageDrafts, conversations, conversationMessages, userQuestions, questionMessages, userReminderRules, userReminderOccurrences, userReminderDeliveryLogs, contentAccessGrants, mailingTopics, mailings, telegramState, rubitimeBranches, rubitimeBookingProfiles, rubitimeCooperators, rubitimeServices, emailSendCooldowns, userNotificationTopics, userSubscriptions, systemSettings, mailingLogs } from "./schema";

export const supportConversationsRelations = relations(supportConversations, ({one, many}) => ({
	platformUser: one(platformUsers, {
		fields: [supportConversations.platformUserId],
		references: [platformUsers.id]
	}),
	supportQuestions: many(supportQuestions),
	supportConversationMessages: many(supportConversationMessages),
}));

export const platformUsersRelations = relations(platformUsers, ({one, many}) => ({
	supportConversations: many(supportConversations),
	platformUser_blockedBy: one(platformUsers, {
		fields: [platformUsers.blockedBy],
		references: [platformUsers.id],
		relationName: "platformUsers_blockedBy_platformUsers_id"
	}),
	platformUsers_blockedBy: many(platformUsers, {
		relationName: "platformUsers_blockedBy_platformUsers_id"
	}),
	platformUser_mergedIntoId: one(platformUsers, {
		fields: [platformUsers.mergedIntoId],
		references: [platformUsers.id],
		relationName: "platformUsers_mergedIntoId_platformUsers_id"
	}),
	platformUsers_mergedIntoId: many(platformUsers, {
		relationName: "platformUsers_mergedIntoId_platformUsers_id"
	}),
	messageLogs: many(messageLog),
	userChannelBindings: many(userChannelBindings),
	symptomEntries: many(symptomEntries),
	contentAccessGrantsWebapps: many(contentAccessGrantsWebapp),
	emailChallenges: many(emailChallenges),
	userPins: many(userPins),
	channelLinkSecrets: many(channelLinkSecrets),
	userChannelPreferences: many(userChannelPreferences),
	userOauthBindings: many(userOauthBindings),
	lfkSessions: many(lfkSessions),
	loginTokens: many(loginTokens),
	doctorNotes_authorId: many(doctorNotes, {
		relationName: "doctorNotes_authorId_platformUsers_id"
	}),
	doctorNotes_userId: many(doctorNotes, {
		relationName: "doctorNotes_userId_platformUsers_id"
	}),
	symptomTrackings: many(symptomTrackings),
	lfkComplexes: many(lfkComplexes),
	lfkExercises: many(lfkExercises),
	lfkComplexTemplates: many(lfkComplexTemplates),
	patientLfkAssignments_assignedBy: many(patientLfkAssignments, {
		relationName: "patientLfkAssignments_assignedBy_platformUsers_id"
	}),
	patientLfkAssignments_patientUserId: many(patientLfkAssignments, {
		relationName: "patientLfkAssignments_patientUserId_platformUsers_id"
	}),
	mediaFiles: many(mediaFiles),
	onlineIntakeRequests: many(onlineIntakeRequests),
	patientBookings: many(patientBookings),
	onlineIntakeStatusHistories: many(onlineIntakeStatusHistory),
	reminderRules: many(reminderRules),
	adminAuditLogs: many(adminAuditLog),
	mediaFolders: many(mediaFolders),
	mediaUploadSessions: many(mediaUploadSessions),
	emailSendCooldowns: many(emailSendCooldowns),
	userNotificationTopics: many(userNotificationTopics),
	systemSettings: many(systemSettings),
	clinicalTests: many(clinicalTests),
	testSets: many(testSets),
	recommendations: many(recommendations),
	treatmentProgramTemplates: many(treatmentProgramTemplates),
	treatmentProgramInstancesAsPatient: many(treatmentProgramInstances, {
		relationName: "treatment_program_instances_patient",
	}),
	treatmentProgramInstancesAssignedByDoctor: many(treatmentProgramInstances, {
		relationName: "treatment_program_instances_assigned_by",
	}),
	entityComments: many(entityComments),
}));

export const messageLogRelations = relations(messageLog, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [messageLog.platformUserId],
		references: [platformUsers.id]
	}),
}));

export const userChannelBindingsRelations = relations(userChannelBindings, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [userChannelBindings.userId],
		references: [platformUsers.id]
	}),
}));

export const supportQuestionsRelations = relations(supportQuestions, ({one, many}) => ({
	supportConversation: one(supportConversations, {
		fields: [supportQuestions.conversationId],
		references: [supportConversations.id]
	}),
	supportQuestionMessages: many(supportQuestionMessages),
}));

export const supportQuestionMessagesRelations = relations(supportQuestionMessages, ({one}) => ({
	supportQuestion: one(supportQuestions, {
		fields: [supportQuestionMessages.questionId],
		references: [supportQuestions.id]
	}),
}));

export const supportDeliveryEventsRelations = relations(supportDeliveryEvents, ({one}) => ({
	supportConversationMessage: one(supportConversationMessages, {
		fields: [supportDeliveryEvents.conversationMessageId],
		references: [supportConversationMessages.id]
	}),
}));

export const supportConversationMessagesRelations = relations(supportConversationMessages, ({one, many}) => ({
	supportDeliveryEvents: many(supportDeliveryEvents),
	supportConversation: one(supportConversations, {
		fields: [supportConversationMessages.conversationId],
		references: [supportConversations.id]
	}),
}));

export const symptomEntriesRelations = relations(symptomEntries, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [symptomEntries.platformUserId],
		references: [platformUsers.id]
	}),
	symptomTracking: one(symptomTrackings, {
		fields: [symptomEntries.trackingId],
		references: [symptomTrackings.id]
	}),
}));

export const symptomTrackingsRelations = relations(symptomTrackings, ({one, many}) => ({
	symptomEntries: many(symptomEntries),
	referenceItem_diagnosisRefId: one(referenceItems, {
		fields: [symptomTrackings.diagnosisRefId],
		references: [referenceItems.id],
		relationName: "symptomTrackings_diagnosisRefId_referenceItems_id"
	}),
	platformUser: one(platformUsers, {
		fields: [symptomTrackings.platformUserId],
		references: [platformUsers.id]
	}),
	referenceItem_regionRefId: one(referenceItems, {
		fields: [symptomTrackings.regionRefId],
		references: [referenceItems.id],
		relationName: "symptomTrackings_regionRefId_referenceItems_id"
	}),
	referenceItem_stageRefId: one(referenceItems, {
		fields: [symptomTrackings.stageRefId],
		references: [referenceItems.id],
		relationName: "symptomTrackings_stageRefId_referenceItems_id"
	}),
	referenceItem_symptomTypeRefId: one(referenceItems, {
		fields: [symptomTrackings.symptomTypeRefId],
		references: [referenceItems.id],
		relationName: "symptomTrackings_symptomTypeRefId_referenceItems_id"
	}),
	lfkComplexes: many(lfkComplexes),
}));

export const contentAccessGrantsWebappRelations = relations(contentAccessGrantsWebapp, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [contentAccessGrantsWebapp.platformUserId],
		references: [platformUsers.id]
	}),
}));

export const appointmentRecordsRelations = relations(appointmentRecords, ({one}) => ({
	branch: one(branches, {
		fields: [appointmentRecords.branchId],
		references: [branches.id]
	}),
}));

export const branchesRelations = relations(branches, ({many}) => ({
	appointmentRecords: many(appointmentRecords),
}));

export const emailChallengesRelations = relations(emailChallenges, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [emailChallenges.userId],
		references: [platformUsers.id]
	}),
}));

export const userPinsRelations = relations(userPins, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [userPins.userId],
		references: [platformUsers.id]
	}),
}));

export const channelLinkSecretsRelations = relations(channelLinkSecrets, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [channelLinkSecrets.userId],
		references: [platformUsers.id]
	}),
}));

export const userChannelPreferencesRelations = relations(userChannelPreferences, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [userChannelPreferences.platformUserId],
		references: [platformUsers.id]
	}),
}));

export const userOauthBindingsRelations = relations(userOauthBindings, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [userOauthBindings.userId],
		references: [platformUsers.id]
	}),
}));

export const lfkSessionsRelations = relations(lfkSessions, ({one}) => ({
	lfkComplex: one(lfkComplexes, {
		fields: [lfkSessions.complexId],
		references: [lfkComplexes.id]
	}),
	platformUser: one(platformUsers, {
		fields: [lfkSessions.userId],
		references: [platformUsers.id]
	}),
}));

export const lfkComplexesRelations = relations(lfkComplexes, ({one, many}) => ({
	lfkSessions: many(lfkSessions),
	referenceItem_diagnosisRefId: one(referenceItems, {
		fields: [lfkComplexes.diagnosisRefId],
		references: [referenceItems.id],
		relationName: "lfkComplexes_diagnosisRefId_referenceItems_id"
	}),
	platformUser: one(platformUsers, {
		fields: [lfkComplexes.platformUserId],
		references: [platformUsers.id]
	}),
	referenceItem_regionRefId: one(referenceItems, {
		fields: [lfkComplexes.regionRefId],
		references: [referenceItems.id],
		relationName: "lfkComplexes_regionRefId_referenceItems_id"
	}),
	symptomTracking: one(symptomTrackings, {
		fields: [lfkComplexes.symptomTrackingId],
		references: [symptomTrackings.id]
	}),
	patientLfkAssignments: many(patientLfkAssignments),
	lfkComplexExercises: many(lfkComplexExercises),
}));

export const loginTokensRelations = relations(loginTokens, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [loginTokens.userId],
		references: [platformUsers.id]
	}),
}));

export const referenceItemsRelations = relations(referenceItems, ({one, many}) => ({
	referenceCategory: one(referenceCategories, {
		fields: [referenceItems.categoryId],
		references: [referenceCategories.id]
	}),
	symptomTrackings_diagnosisRefId: many(symptomTrackings, {
		relationName: "symptomTrackings_diagnosisRefId_referenceItems_id"
	}),
	symptomTrackings_regionRefId: many(symptomTrackings, {
		relationName: "symptomTrackings_regionRefId_referenceItems_id"
	}),
	symptomTrackings_stageRefId: many(symptomTrackings, {
		relationName: "symptomTrackings_stageRefId_referenceItems_id"
	}),
	symptomTrackings_symptomTypeRefId: many(symptomTrackings, {
		relationName: "symptomTrackings_symptomTypeRefId_referenceItems_id"
	}),
	lfkComplexes_diagnosisRefId: many(lfkComplexes, {
		relationName: "lfkComplexes_diagnosisRefId_referenceItems_id"
	}),
	lfkComplexes_regionRefId: many(lfkComplexes, {
		relationName: "lfkComplexes_regionRefId_referenceItems_id"
	}),
	lfkExercises: many(lfkExercises),
}));

export const referenceCategoriesRelations = relations(referenceCategories, ({many}) => ({
	referenceItems: many(referenceItems),
}));

export const doctorNotesRelations = relations(doctorNotes, ({one}) => ({
	platformUser_authorId: one(platformUsers, {
		fields: [doctorNotes.authorId],
		references: [platformUsers.id],
		relationName: "doctorNotes_authorId_platformUsers_id"
	}),
	platformUser_userId: one(platformUsers, {
		fields: [doctorNotes.userId],
		references: [platformUsers.id],
		relationName: "doctorNotes_userId_platformUsers_id"
	}),
}));

export const lfkExercisesRelations = relations(lfkExercises, ({one, many}) => ({
	platformUser: one(platformUsers, {
		fields: [lfkExercises.createdBy],
		references: [platformUsers.id]
	}),
	referenceItem: one(referenceItems, {
		fields: [lfkExercises.regionRefId],
		references: [referenceItems.id]
	}),
	lfkComplexTemplateExercises: many(lfkComplexTemplateExercises),
	lfkExerciseMedias: many(lfkExerciseMedia),
	lfkComplexExercises: many(lfkComplexExercises),
}));

export const lfkComplexTemplateExercisesRelations = relations(lfkComplexTemplateExercises, ({one}) => ({
	lfkExercise: one(lfkExercises, {
		fields: [lfkComplexTemplateExercises.exerciseId],
		references: [lfkExercises.id]
	}),
	lfkComplexTemplate: one(lfkComplexTemplates, {
		fields: [lfkComplexTemplateExercises.templateId],
		references: [lfkComplexTemplates.id]
	}),
}));

export const lfkComplexTemplatesRelations = relations(lfkComplexTemplates, ({one, many}) => ({
	lfkComplexTemplateExercises: many(lfkComplexTemplateExercises),
	platformUser: one(platformUsers, {
		fields: [lfkComplexTemplates.createdBy],
		references: [platformUsers.id]
	}),
	patientLfkAssignments: many(patientLfkAssignments),
}));

export const lfkExerciseMediaRelations = relations(lfkExerciseMedia, ({one}) => ({
	lfkExercise: one(lfkExercises, {
		fields: [lfkExerciseMedia.exerciseId],
		references: [lfkExercises.id]
	}),
}));

export const patientLfkAssignmentsRelations = relations(patientLfkAssignments, ({one}) => ({
	platformUser_assignedBy: one(platformUsers, {
		fields: [patientLfkAssignments.assignedBy],
		references: [platformUsers.id],
		relationName: "patientLfkAssignments_assignedBy_platformUsers_id"
	}),
	lfkComplex: one(lfkComplexes, {
		fields: [patientLfkAssignments.complexId],
		references: [lfkComplexes.id]
	}),
	platformUser_patientUserId: one(platformUsers, {
		fields: [patientLfkAssignments.patientUserId],
		references: [platformUsers.id],
		relationName: "patientLfkAssignments_patientUserId_platformUsers_id"
	}),
	lfkComplexTemplate: one(lfkComplexTemplates, {
		fields: [patientLfkAssignments.templateId],
		references: [lfkComplexTemplates.id]
	}),
}));

export const lfkComplexExercisesRelations = relations(lfkComplexExercises, ({one}) => ({
	lfkComplex: one(lfkComplexes, {
		fields: [lfkComplexExercises.complexId],
		references: [lfkComplexes.id]
	}),
	lfkExercise: one(lfkExercises, {
		fields: [lfkComplexExercises.exerciseId],
		references: [lfkExercises.id]
	}),
}));

export const mediaFilesRelations = relations(mediaFiles, ({one, many}) => ({
	mediaFolder: one(mediaFolders, {
		fields: [mediaFiles.folderId],
		references: [mediaFolders.id]
	}),
	platformUser: one(platformUsers, {
		fields: [mediaFiles.uploadedBy],
		references: [platformUsers.id]
	}),
	mediaUploadSessions: many(mediaUploadSessions),
}));

export const mediaFoldersRelations = relations(mediaFolders, ({one, many}) => ({
	mediaFiles: many(mediaFiles),
	platformUser: one(platformUsers, {
		fields: [mediaFolders.createdBy],
		references: [platformUsers.id]
	}),
	mediaFolder: one(mediaFolders, {
		fields: [mediaFolders.parentId],
		references: [mediaFolders.id],
		relationName: "mediaFolders_parentId_mediaFolders_id"
	}),
	mediaFolders: many(mediaFolders, {
		relationName: "mediaFolders_parentId_mediaFolders_id"
	}),
}));

export const bookingBranchesRelations = relations(bookingBranches, ({one, many}) => ({
	bookingCity: one(bookingCities, {
		fields: [bookingBranches.cityId],
		references: [bookingCities.id]
	}),
	bookingSpecialists: many(bookingSpecialists),
	bookingBranchServices: many(bookingBranchServices),
	patientBookings: many(patientBookings),
}));

export const bookingCitiesRelations = relations(bookingCities, ({many}) => ({
	bookingBranches: many(bookingBranches),
}));

export const bookingSpecialistsRelations = relations(bookingSpecialists, ({one, many}) => ({
	bookingBranch: one(bookingBranches, {
		fields: [bookingSpecialists.branchId],
		references: [bookingBranches.id]
	}),
	bookingBranchServices: many(bookingBranchServices),
}));

export const bookingBranchServicesRelations = relations(bookingBranchServices, ({one, many}) => ({
	bookingBranch: one(bookingBranches, {
		fields: [bookingBranchServices.branchId],
		references: [bookingBranches.id]
	}),
	bookingService: one(bookingServices, {
		fields: [bookingBranchServices.serviceId],
		references: [bookingServices.id]
	}),
	bookingSpecialist: one(bookingSpecialists, {
		fields: [bookingBranchServices.specialistId],
		references: [bookingSpecialists.id]
	}),
	patientBookings: many(patientBookings),
}));

export const bookingServicesRelations = relations(bookingServices, ({many}) => ({
	bookingBranchServices: many(bookingBranchServices),
	patientBookings: many(patientBookings),
}));

export const onlineIntakeRequestsRelations = relations(onlineIntakeRequests, ({one, many}) => ({
	platformUser: one(platformUsers, {
		fields: [onlineIntakeRequests.userId],
		references: [platformUsers.id]
	}),
	onlineIntakeAnswers: many(onlineIntakeAnswers),
	onlineIntakeAttachments: many(onlineIntakeAttachments),
	onlineIntakeStatusHistories: many(onlineIntakeStatusHistory),
}));

export const patientBookingsRelations = relations(patientBookings, ({one}) => ({
	bookingBranch: one(bookingBranches, {
		fields: [patientBookings.branchId],
		references: [bookingBranches.id]
	}),
	bookingBranchService: one(bookingBranchServices, {
		fields: [patientBookings.branchServiceId],
		references: [bookingBranchServices.id]
	}),
	platformUser: one(platformUsers, {
		fields: [patientBookings.platformUserId],
		references: [platformUsers.id]
	}),
	bookingService: one(bookingServices, {
		fields: [patientBookings.serviceId],
		references: [bookingServices.id]
	}),
}));

export const onlineIntakeAnswersRelations = relations(onlineIntakeAnswers, ({one}) => ({
	onlineIntakeRequest: one(onlineIntakeRequests, {
		fields: [onlineIntakeAnswers.requestId],
		references: [onlineIntakeRequests.id]
	}),
}));

export const onlineIntakeAttachmentsRelations = relations(onlineIntakeAttachments, ({one}) => ({
	onlineIntakeRequest: one(onlineIntakeRequests, {
		fields: [onlineIntakeAttachments.requestId],
		references: [onlineIntakeRequests.id]
	}),
}));

export const onlineIntakeStatusHistoryRelations = relations(onlineIntakeStatusHistory, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [onlineIntakeStatusHistory.changedBy],
		references: [platformUsers.id]
	}),
	onlineIntakeRequest: one(onlineIntakeRequests, {
		fields: [onlineIntakeStatusHistory.requestId],
		references: [onlineIntakeRequests.id]
	}),
}));

export const reminderRulesRelations = relations(reminderRules, ({one, many}) => ({
	platformUser: one(platformUsers, {
		fields: [reminderRules.platformUserId],
		references: [platformUsers.id]
	}),
	reminderJournals: many(reminderJournal),
}));

export const reminderJournalRelations = relations(reminderJournal, ({one}) => ({
	reminderOccurrenceHistory: one(reminderOccurrenceHistory, {
		fields: [reminderJournal.occurrenceId],
		references: [reminderOccurrenceHistory.integratorOccurrenceId]
	}),
	reminderRule: one(reminderRules, {
		fields: [reminderJournal.ruleId],
		references: [reminderRules.id]
	}),
}));

export const reminderOccurrenceHistoryRelations = relations(reminderOccurrenceHistory, ({many}) => ({
	reminderJournals: many(reminderJournal),
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [adminAuditLog.actorId],
		references: [platformUsers.id]
	}),
}));

export const mediaUploadSessionsRelations = relations(mediaUploadSessions, ({one}) => ({
	mediaFile: one(mediaFiles, {
		fields: [mediaUploadSessions.mediaId],
		references: [mediaFiles.id]
	}),
	platformUser: one(platformUsers, {
		fields: [mediaUploadSessions.ownerUserId],
		references: [platformUsers.id]
	}),
}));

export const identitiesRelations = relations(identities, ({one, many}) => ({
	user: one(users, {
		fields: [identities.userId],
		references: [users.id]
	}),
	messageDrafts: many(messageDrafts),
	conversations: many(conversations),
	userQuestions: many(userQuestions),
	telegramStates: many(telegramState),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	identities: many(identities),
	contacts: many(contacts),
	user: one(users, {
		fields: [users.mergedIntoUserId],
		references: [users.id],
		relationName: "users_mergedIntoUserId_users_id"
	}),
	users: many(users, {
		relationName: "users_mergedIntoUserId_users_id"
	}),
	userReminderRules: many(userReminderRules),
	contentAccessGrants: many(contentAccessGrants),
	userSubscriptions: many(userSubscriptions),
	mailingLogs: many(mailingLogs),
}));

export const contactsRelations = relations(contacts, ({one}) => ({
	user: one(users, {
		fields: [contacts.userId],
		references: [users.id]
	}),
}));

export const messageDraftsRelations = relations(messageDrafts, ({one}) => ({
	identity: one(identities, {
		fields: [messageDrafts.identityId],
		references: [identities.id]
	}),
}));

export const conversationsRelations = relations(conversations, ({one, many}) => ({
	identity: one(identities, {
		fields: [conversations.userIdentityId],
		references: [identities.id]
	}),
	conversationMessages: many(conversationMessages),
	userQuestions: many(userQuestions),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({one}) => ({
	conversation: one(conversations, {
		fields: [conversationMessages.conversationId],
		references: [conversations.id]
	}),
}));

export const userQuestionsRelations = relations(userQuestions, ({one, many}) => ({
	conversation: one(conversations, {
		fields: [userQuestions.conversationId],
		references: [conversations.id]
	}),
	identity: one(identities, {
		fields: [userQuestions.userIdentityId],
		references: [identities.id]
	}),
	questionMessages: many(questionMessages),
}));

export const questionMessagesRelations = relations(questionMessages, ({one}) => ({
	userQuestion: one(userQuestions, {
		fields: [questionMessages.questionId],
		references: [userQuestions.id]
	}),
}));

export const userReminderRulesRelations = relations(userReminderRules, ({one, many}) => ({
	user: one(users, {
		fields: [userReminderRules.userId],
		references: [users.id]
	}),
	userReminderOccurrences: many(userReminderOccurrences),
}));

export const userReminderOccurrencesRelations = relations(userReminderOccurrences, ({one, many}) => ({
	userReminderRule: one(userReminderRules, {
		fields: [userReminderOccurrences.ruleId],
		references: [userReminderRules.id]
	}),
	userReminderDeliveryLogs: many(userReminderDeliveryLogs),
}));

export const userReminderDeliveryLogsRelations = relations(userReminderDeliveryLogs, ({one}) => ({
	userReminderOccurrence: one(userReminderOccurrences, {
		fields: [userReminderDeliveryLogs.occurrenceId],
		references: [userReminderOccurrences.id]
	}),
}));

export const contentAccessGrantsRelations = relations(contentAccessGrants, ({one}) => ({
	user: one(users, {
		fields: [contentAccessGrants.userId],
		references: [users.id]
	}),
}));

export const mailingsRelations = relations(mailings, ({one, many}) => ({
	mailingTopic: one(mailingTopics, {
		fields: [mailings.topicId],
		references: [mailingTopics.id]
	}),
	mailingLogs: many(mailingLogs),
}));

export const mailingTopicsRelations = relations(mailingTopics, ({many}) => ({
	mailings: many(mailings),
	userSubscriptions: many(userSubscriptions),
}));

export const telegramStateRelations = relations(telegramState, ({one}) => ({
	identity: one(identities, {
		fields: [telegramState.identityId],
		references: [identities.id]
	}),
}));

export const rubitimeBookingProfilesRelations = relations(rubitimeBookingProfiles, ({one}) => ({
	rubitimeBranch: one(rubitimeBranches, {
		fields: [rubitimeBookingProfiles.branchId],
		references: [rubitimeBranches.id]
	}),
	rubitimeCooperator: one(rubitimeCooperators, {
		fields: [rubitimeBookingProfiles.cooperatorId],
		references: [rubitimeCooperators.id]
	}),
	rubitimeService: one(rubitimeServices, {
		fields: [rubitimeBookingProfiles.serviceId],
		references: [rubitimeServices.id]
	}),
}));

export const rubitimeBranchesRelations = relations(rubitimeBranches, ({many}) => ({
	rubitimeBookingProfiles: many(rubitimeBookingProfiles),
}));

export const rubitimeCooperatorsRelations = relations(rubitimeCooperators, ({many}) => ({
	rubitimeBookingProfiles: many(rubitimeBookingProfiles),
}));

export const rubitimeServicesRelations = relations(rubitimeServices, ({many}) => ({
	rubitimeBookingProfiles: many(rubitimeBookingProfiles),
}));

export const emailSendCooldownsRelations = relations(emailSendCooldowns, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [emailSendCooldowns.userId],
		references: [platformUsers.id]
	}),
}));

export const userNotificationTopicsRelations = relations(userNotificationTopics, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [userNotificationTopics.userId],
		references: [platformUsers.id]
	}),
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({one}) => ({
	mailingTopic: one(mailingTopics, {
		fields: [userSubscriptions.topicId],
		references: [mailingTopics.id]
	}),
	user: one(users, {
		fields: [userSubscriptions.userId],
		references: [users.id]
	}),
}));

export const systemSettingsRelations = relations(systemSettings, ({one}) => ({
	platformUser: one(platformUsers, {
		fields: [systemSettings.updatedBy],
		references: [platformUsers.id]
	}),
}));

export const mailingLogsRelations = relations(mailingLogs, ({one}) => ({
	mailing: one(mailings, {
		fields: [mailingLogs.mailingId],
		references: [mailings.id]
	}),
	user: one(users, {
		fields: [mailingLogs.userId],
		references: [users.id]
	}),
}));

export const clinicalTestsRelations = relations(clinicalTests, ({ one, many }) => ({
	platformUser: one(platformUsers, {
		fields: [clinicalTests.createdBy],
		references: [platformUsers.id],
	}),
	testSetItems: many(testSetItems),
}));

export const testSetsRelations = relations(testSets, ({ one, many }) => ({
	platformUser: one(platformUsers, {
		fields: [testSets.createdBy],
		references: [platformUsers.id],
	}),
	items: many(testSetItems),
}));

export const testSetItemsRelations = relations(testSetItems, ({ one }) => ({
	testSet: one(testSets, {
		fields: [testSetItems.testSetId],
		references: [testSets.id],
	}),
	clinicalTest: one(clinicalTests, {
		fields: [testSetItems.testId],
		references: [clinicalTests.id],
	}),
}));

export const recommendationsRelations = relations(recommendations, ({ one }) => ({
	platformUser: one(platformUsers, {
		fields: [recommendations.createdBy],
		references: [platformUsers.id],
	}),
}));

export const treatmentProgramTemplatesRelations = relations(treatmentProgramTemplates, ({ one, many }) => ({
	platformUser: one(platformUsers, {
		fields: [treatmentProgramTemplates.createdBy],
		references: [platformUsers.id],
	}),
	stages: many(treatmentProgramTemplateStages),
	courses: many(courses),
}));

export const coursesRelations = relations(courses, ({ one }) => ({
	programTemplate: one(treatmentProgramTemplates, {
		fields: [courses.programTemplateId],
		references: [treatmentProgramTemplates.id],
	}),
	introLesson: one(contentPages, {
		fields: [courses.introLessonPageId],
		references: [contentPages.id],
	}),
}));

export const treatmentProgramTemplateStagesRelations = relations(
	treatmentProgramTemplateStages,
	({ one, many }) => ({
		template: one(treatmentProgramTemplates, {
			fields: [treatmentProgramTemplateStages.templateId],
			references: [treatmentProgramTemplates.id],
		}),
		items: many(treatmentProgramTemplateStageItems),
	}),
);

export const treatmentProgramTemplateStageItemsRelations = relations(
	treatmentProgramTemplateStageItems,
	({ one }) => ({
		stage: one(treatmentProgramTemplateStages, {
			fields: [treatmentProgramTemplateStageItems.stageId],
			references: [treatmentProgramTemplateStages.id],
		}),
	}),
);

export const treatmentProgramInstancesRelations = relations(treatmentProgramInstances, ({ one, many }) => ({
	template: one(treatmentProgramTemplates, {
		fields: [treatmentProgramInstances.templateId],
		references: [treatmentProgramTemplates.id],
	}),
	patientUser: one(platformUsers, {
		fields: [treatmentProgramInstances.patientUserId],
		references: [platformUsers.id],
		relationName: "treatment_program_instances_patient",
	}),
	assignedByUser: one(platformUsers, {
		fields: [treatmentProgramInstances.assignedBy],
		references: [platformUsers.id],
		relationName: "treatment_program_instances_assigned_by",
	}),
	stages: many(treatmentProgramInstanceStages),
	programEvents: many(treatmentProgramEvents),
}));

export const treatmentProgramEventsRelations = relations(treatmentProgramEvents, ({ one }) => ({
	instance: one(treatmentProgramInstances, {
		fields: [treatmentProgramEvents.instanceId],
		references: [treatmentProgramInstances.id],
	}),
	actor: one(platformUsers, {
		fields: [treatmentProgramEvents.actorId],
		references: [platformUsers.id],
	}),
}));

export const treatmentProgramInstanceStagesRelations = relations(
	treatmentProgramInstanceStages,
	({ one, many }) => ({
		instance: one(treatmentProgramInstances, {
			fields: [treatmentProgramInstanceStages.instanceId],
			references: [treatmentProgramInstances.id],
		}),
		sourceStage: one(treatmentProgramTemplateStages, {
			fields: [treatmentProgramInstanceStages.sourceStageId],
			references: [treatmentProgramTemplateStages.id],
		}),
		items: many(treatmentProgramInstanceStageItems),
	}),
);

export const treatmentProgramInstanceStageItemsRelations = relations(
	treatmentProgramInstanceStageItems,
	({ one, many }) => ({
		stage: one(treatmentProgramInstanceStages, {
			fields: [treatmentProgramInstanceStageItems.stageId],
			references: [treatmentProgramInstanceStages.id],
		}),
		testAttempts: many(treatmentProgramTestAttempts),
	}),
);

export const treatmentProgramTestAttemptsRelations = relations(
	treatmentProgramTestAttempts,
	({ one, many }) => ({
		stageItem: one(treatmentProgramInstanceStageItems, {
			fields: [treatmentProgramTestAttempts.instanceStageItemId],
			references: [treatmentProgramInstanceStageItems.id],
		}),
		patient: one(platformUsers, {
			fields: [treatmentProgramTestAttempts.patientUserId],
			references: [platformUsers.id],
		}),
		results: many(treatmentProgramTestResults),
	}),
);

export const treatmentProgramTestResultsRelations = relations(treatmentProgramTestResults, ({ one }) => ({
	attempt: one(treatmentProgramTestAttempts, {
		fields: [treatmentProgramTestResults.attemptId],
		references: [treatmentProgramTestAttempts.id],
	}),
	test: one(clinicalTests, {
		fields: [treatmentProgramTestResults.testId],
		references: [clinicalTests.id],
	}),
	decidedByUser: one(platformUsers, {
		fields: [treatmentProgramTestResults.decidedBy],
		references: [platformUsers.id],
		relationName: "test_results_decided_by_user",
	}),
}));

export const entityCommentsRelations = relations(entityComments, ({ one }) => ({
	author: one(platformUsers, {
		fields: [entityComments.authorId],
		references: [platformUsers.id],
	}),
}));