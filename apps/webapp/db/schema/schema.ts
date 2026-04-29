import { pgTable, index, text, bigint, jsonb, timestamp, smallint, uniqueIndex, foreignKey, unique, uuid, check, boolean, integer, bigserial, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const phoneChallenges = pgTable("phone_challenges", {
	challengeId: text("challenge_id").primaryKey().notNull(),
	phone: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
	code: text(),
	channelContext: jsonb("channel_context"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	verifyAttempts: smallint("verify_attempts").default(0).notNull(),
}, (table) => [
	index("idx_phone_challenges_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("int8_ops")),
	index("idx_phone_challenges_phone").using("btree", table.phone.asc().nullsLast().op("text_ops")),
]);

export const supportConversations = pgTable("support_conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	integratorConversationId: text("integrator_conversation_id").notNull(),
	platformUserId: uuid("platform_user_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorUserId: bigint("integrator_user_id", { mode: "number" }),
	source: text().notNull(),
	adminScope: text("admin_scope").notNull(),
	status: text().notNull(),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }).notNull(),
	lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: 'string' }).notNull(),
	closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
	closeReason: text("close_reason"),
	channelCode: text("channel_code"),
	channelExternalId: text("channel_external_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_support_conversations_integrator_id").using("btree", table.integratorConversationId.asc().nullsLast().op("text_ops")),
	index("idx_support_conversations_integrator_user_id").using("btree", table.integratorUserId.asc().nullsLast().op("int8_ops")).where(sql`(integrator_user_id IS NOT NULL)`),
	index("idx_support_conversations_last_message").using("btree", table.lastMessageAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_support_conversations_platform_user_id").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")).where(sql`(platform_user_id IS NOT NULL)`),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "support_conversations_platform_user_id_fkey"
		}).onDelete("set null"),
	unique("support_conversations_integrator_conversation_id_key").on(table.integratorConversationId),
]);

export const platformUsers = pgTable("platform_users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	phoneNormalized: text("phone_normalized"),
	displayName: text("display_name").default('').notNull(),
	role: text().default('client').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorUserId: bigint("integrator_user_id", { mode: "number" }),
	firstName: text("first_name"),
	lastName: text("last_name"),
	email: text(),
	emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: 'string' }),
	isBlocked: boolean("is_blocked").default(false).notNull(),
	blockedAt: timestamp("blocked_at", { withTimezone: true, mode: 'string' }),
	blockedReason: text("blocked_reason"),
	blockedBy: uuid("blocked_by"),
	isArchived: boolean("is_archived").default(false).notNull(),
	mergedIntoId: uuid("merged_into_id"),
	patientPhoneTrustAt: timestamp("patient_phone_trust_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_platform_users_integrator_uid").using("btree", table.integratorUserId.asc().nullsLast().op("int8_ops")).where(sql`(integrator_user_id IS NOT NULL)`),
	index("idx_platform_users_merged_into").using("btree", table.mergedIntoId.asc().nullsLast().op("uuid_ops")).where(sql`(merged_into_id IS NOT NULL)`),
	index("idx_platform_users_phone").using("btree", table.phoneNormalized.asc().nullsLast().op("text_ops")).where(sql`(phone_normalized IS NOT NULL)`),
	foreignKey({
			columns: [table.blockedBy],
			foreignColumns: [table.id],
			name: "platform_users_blocked_by_fkey"
		}),
	foreignKey({
			columns: [table.mergedIntoId],
			foreignColumns: [table.id],
			name: "platform_users_merged_into_id_fkey"
		}).onDelete("set null"),
	unique("platform_users_phone_normalized_key").on(table.phoneNormalized),
	unique("platform_users_integrator_user_id_key").on(table.integratorUserId),
	check("platform_users_no_self_merge", sql`(merged_into_id IS NULL) OR (merged_into_id <> id)`),
	check("platform_users_role_check", sql`role = ANY (ARRAY['client'::text, 'doctor'::text, 'admin'::text])`),
]);

export const messageLog = pgTable("message_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	senderId: text("sender_id").notNull(),
	text: text().notNull(),
	category: text().notNull(),
	channelBindingsUsed: jsonb("channel_bindings_used").default({}).notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	outcome: text().notNull(),
	errorMessage: text("error_message"),
	platformUserId: uuid("platform_user_id"),
}, (table) => [
	index("idx_message_log_platform_user_id").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")).where(sql`(platform_user_id IS NOT NULL)`),
	index("idx_message_log_sent_at").using("btree", table.sentAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_message_log_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "message_log_platform_user_id_fkey"
		}).onDelete("set null"),
	check("message_log_outcome_check", sql`outcome = ANY (ARRAY['sent'::text, 'partial'::text, 'failed'::text])`),
]);

export const userChannelBindings = pgTable("user_channel_bindings", {
	userId: uuid("user_id").notNull(),
	channelCode: text("channel_code").notNull(),
	externalId: text("external_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_channel_bindings_lookup").using("btree", table.channelCode.asc().nullsLast().op("text_ops"), table.externalId.asc().nullsLast().op("text_ops")),
	index("idx_user_channel_bindings_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "user_channel_bindings_user_id_fkey"
		}).onDelete("cascade"),
	unique("user_channel_bindings_channel_code_external_id_key").on(table.channelCode, table.externalId),
	check("user_channel_bindings_channel_code_check", sql`channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text])`),
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
	key: text().primaryKey().notNull(),
	requestHash: text("request_hash").notNull(),
	status: smallint().notNull(),
	responseBody: jsonb("response_body").default({}).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idempotency_keys_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_idempotency_keys_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const broadcastAudit = pgTable("broadcast_audit", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	actorId: text("actor_id").notNull(),
	category: text().notNull(),
	audienceFilter: text("audience_filter").notNull(),
	messageTitle: text("message_title").notNull(),
	executedAt: timestamp("executed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	previewOnly: boolean("preview_only").default(false).notNull(),
	audienceSize: integer("audience_size").default(0).notNull(),
	sentCount: integer("sent_count").default(0).notNull(),
	errorCount: integer("error_count").default(0).notNull(),
}, (table) => [
	index("idx_broadcast_audit_executed_at").using("btree", table.executedAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const supportQuestions = pgTable("support_questions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	integratorQuestionId: text("integrator_question_id").notNull(),
	conversationId: uuid("conversation_id"),
	status: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	answeredAt: timestamp("answered_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_support_questions_conversation_id").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")).where(sql`(conversation_id IS NOT NULL)`),
	index("idx_support_questions_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("idx_support_questions_integrator_id").using("btree", table.integratorQuestionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [supportConversations.id],
			name: "support_questions_conversation_id_fkey"
		}).onDelete("set null"),
	unique("support_questions_integrator_question_id_key").on(table.integratorQuestionId),
]);

export const supportQuestionMessages = pgTable("support_question_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	integratorQuestionMessageId: text("integrator_question_message_id").notNull(),
	questionId: uuid("question_id").notNull(),
	senderRole: text("sender_role").notNull(),
	text: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("idx_support_question_messages_integrator_id").using("btree", table.integratorQuestionMessageId.asc().nullsLast().op("text_ops")),
	index("idx_support_question_messages_question_created").using("btree", table.questionId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.questionId],
			foreignColumns: [supportQuestions.id],
			name: "support_question_messages_question_id_fkey"
		}).onDelete("cascade"),
	unique("support_question_messages_integrator_question_message_id_key").on(table.integratorQuestionMessageId),
]);

export const supportDeliveryEvents = pgTable("support_delivery_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationMessageId: uuid("conversation_message_id"),
	integratorIntentEventId: text("integrator_intent_event_id"),
	correlationId: text("correlation_id"),
	channelCode: text("channel_code").notNull(),
	status: text().notNull(),
	attempt: integer().notNull(),
	reason: text(),
	payloadJson: jsonb("payload_json").default({}).notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_support_delivery_events_channel_occurred").using("btree", table.channelCode.asc().nullsLast().op("timestamptz_ops"), table.occurredAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_support_delivery_events_conversation_message").using("btree", table.conversationMessageId.asc().nullsLast().op("uuid_ops")).where(sql`(conversation_message_id IS NOT NULL)`),
	index("idx_support_delivery_events_correlation").using("btree", table.correlationId.asc().nullsLast().op("text_ops")).where(sql`(correlation_id IS NOT NULL)`),
	uniqueIndex("idx_support_delivery_events_integrator_intent_uniq").using("btree", table.integratorIntentEventId.asc().nullsLast().op("text_ops")).where(sql`(integrator_intent_event_id IS NOT NULL)`),
	index("idx_support_delivery_events_intent_event").using("btree", table.integratorIntentEventId.asc().nullsLast().op("text_ops")).where(sql`(integrator_intent_event_id IS NOT NULL)`),
	foreignKey({
			columns: [table.conversationMessageId],
			foreignColumns: [supportConversationMessages.id],
			name: "support_delivery_events_conversation_message_id_fkey"
		}).onDelete("set null"),
]);

export const reminderDeliveryEvents = pgTable("reminder_delivery_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	integratorDeliveryLogId: text("integrator_delivery_log_id").notNull(),
	integratorOccurrenceId: text("integrator_occurrence_id").notNull(),
	integratorRuleId: text("integrator_rule_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorUserId: bigint("integrator_user_id", { mode: "number" }).notNull(),
	channel: text().notNull(),
	status: text().notNull(),
	errorCode: text("error_code"),
	payloadJson: jsonb("payload_json").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_reminder_delivery_events_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("idx_reminder_delivery_events_integrator_log_id").using("btree", table.integratorDeliveryLogId.asc().nullsLast().op("text_ops")),
	index("idx_reminder_delivery_events_integrator_user_id").using("btree", table.integratorUserId.asc().nullsLast().op("int8_ops")),
	unique("reminder_delivery_events_integrator_delivery_log_id_key").on(table.integratorDeliveryLogId),
]);

export const symptomEntries = pgTable("symptom_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	trackingId: uuid("tracking_id").notNull(),
	value010: smallint("value_0_10").notNull(),
	entryType: text("entry_type").notNull(),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).notNull(),
	source: text().notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	platformUserId: uuid("platform_user_id").notNull(),
}, (table) => [
	index("idx_symptom_entries_platform_user_id").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")).where(sql`(platform_user_id IS NOT NULL)`),
	index("idx_symptom_entries_tracking_recorded").using("btree", table.trackingId.asc().nullsLast().op("timestamptz_ops"), table.recordedAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_symptom_entries_user_type_recorded").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.entryType.asc().nullsLast().op("text_ops"), table.recordedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "symptom_entries_platform_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.trackingId],
			foreignColumns: [symptomTrackings.id],
			name: "symptom_entries_tracking_id_fkey"
		}).onDelete("cascade"),
	check("symptom_entries_entry_type_check", sql`entry_type = ANY (ARRAY['instant'::text, 'daily'::text])`),
	check("symptom_entries_source_check", sql`source = ANY (ARRAY['bot'::text, 'webapp'::text, 'import'::text])`),
	check("symptom_entries_value_0_10_check", sql`(value_0_10 >= 0) AND (value_0_10 <= 10)`),
]);

export const webappSchemaMigrations = pgTable("webapp_schema_migrations", {
	filename: text().primaryKey().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const contentAccessGrantsWebapp = pgTable("content_access_grants_webapp", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	integratorGrantId: text("integrator_grant_id").notNull(),
	platformUserId: uuid("platform_user_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorUserId: bigint("integrator_user_id", { mode: "number" }).notNull(),
	contentId: text("content_id").notNull(),
	purpose: text().notNull(),
	tokenHash: text("token_hash"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	metaJson: jsonb("meta_json").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_content_access_grants_webapp_expires_at").using("btree", table.expiresAt.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("idx_content_access_grants_webapp_integrator_grant_id").using("btree", table.integratorGrantId.asc().nullsLast().op("text_ops")),
	index("idx_content_access_grants_webapp_integrator_user_id").using("btree", table.integratorUserId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "content_access_grants_webapp_platform_user_id_fkey"
		}).onDelete("set null"),
	unique("content_access_grants_webapp_integrator_grant_id_key").on(table.integratorGrantId),
]);

export const appointmentRecords = pgTable("appointment_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	integratorRecordId: text("integrator_record_id").notNull(),
	phoneNormalized: text("phone_normalized"),
	recordAt: timestamp("record_at", { withTimezone: true, mode: 'string' }),
	status: text().notNull(),
	payloadJson: jsonb("payload_json").default({}).notNull(),
	lastEvent: text("last_event").default('').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	branchId: uuid("branch_id"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_appointment_records_branch_id").using("btree", table.branchId.asc().nullsLast().op("uuid_ops")).where(sql`(branch_id IS NOT NULL)`),
	uniqueIndex("idx_appointment_records_integrator_record_id").using("btree", table.integratorRecordId.asc().nullsLast().op("text_ops")),
	index("idx_appointment_records_phone_normalized").using("btree", table.phoneNormalized.asc().nullsLast().op("text_ops")).where(sql`(phone_normalized IS NOT NULL)`),
	index("idx_appointment_records_phone_not_deleted").using("btree", table.phoneNormalized.asc().nullsLast().op("timestamptz_ops"), table.recordAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`((deleted_at IS NULL) AND (phone_normalized IS NOT NULL))`),
	index("idx_appointment_records_record_at").using("btree", table.recordAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(record_at IS NOT NULL)`),
	index("idx_appointment_records_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "appointment_records_branch_id_fkey"
		}).onDelete("set null"),
	unique("appointment_records_integrator_record_id_key").on(table.integratorRecordId),
	check("appointment_records_status_check", sql`status = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text])`),
]);

export const mailingTopicsWebapp = pgTable("mailing_topics_webapp", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorTopicId: bigint("integrator_topic_id", { mode: "number" }).notNull(),
	code: text().notNull(),
	title: text().notNull(),
	key: text().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_mailing_topics_webapp_integrator_id").using("btree", table.integratorTopicId.asc().nullsLast().op("int8_ops")),
	index("idx_mailing_topics_webapp_key").using("btree", table.key.asc().nullsLast().op("text_ops")),
	unique("mailing_topics_webapp_integrator_topic_id_key").on(table.integratorTopicId),
]);

export const userSubscriptionsWebapp = pgTable("user_subscriptions_webapp", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorUserId: bigint("integrator_user_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorTopicId: bigint("integrator_topic_id", { mode: "number" }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_subscriptions_webapp_topic").using("btree", table.integratorTopicId.asc().nullsLast().op("int8_ops")),
	index("idx_user_subscriptions_webapp_user").using("btree", table.integratorUserId.asc().nullsLast().op("int8_ops")),
	unique("user_subscriptions_webapp_integrator_user_id_integrator_top_key").on(table.integratorUserId, table.integratorTopicId),
]);

export const mailingLogsWebapp = pgTable("mailing_logs_webapp", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorUserId: bigint("integrator_user_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorMailingId: bigint("integrator_mailing_id", { mode: "number" }).notNull(),
	status: text().notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	errorText: text("error_text"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_mailing_logs_webapp_mailing").using("btree", table.integratorMailingId.asc().nullsLast().op("int8_ops")),
	index("idx_mailing_logs_webapp_user").using("btree", table.integratorUserId.asc().nullsLast().op("int8_ops")),
	unique("mailing_logs_webapp_integrator_user_id_integrator_mailing_i_key").on(table.integratorUserId, table.integratorMailingId),
]);

export const branches = pgTable("branches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorBranchId: bigint("integrator_branch_id", { mode: "number" }).notNull(),
	name: text(),
	metaJson: jsonb("meta_json").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	timezone: text().default('Europe/Moscow').notNull(),
}, (table) => [
	uniqueIndex("idx_branches_integrator_branch_id").using("btree", table.integratorBranchId.asc().nullsLast().op("int8_ops")),
	unique("branches_integrator_branch_id_key").on(table.integratorBranchId),
]);

export const contentPages = pgTable("content_pages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	section: text().notNull(),
	slug: text().notNull(),
	title: text().notNull(),
	summary: text().default('').notNull(),
	bodyHtml: text("body_html").default('').notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isPublished: boolean("is_published").default(true).notNull(),
	videoUrl: text("video_url"),
	videoType: text("video_type"),
	imageUrl: text("image_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	bodyMd: text("body_md").default('').notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	requiresAuth: boolean("requires_auth").default(false).notNull(),
}, (table) => [
	index("idx_content_pages_section").using("btree", table.section.asc().nullsLast().op("text_ops")),
	index("idx_content_pages_section_sort").using("btree", table.section.asc().nullsLast().op("text_ops"), table.sortOrder.asc().nullsLast().op("text_ops")),
	index("idx_content_pages_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	unique("content_pages_section_slug_key").on(table.section, table.slug),
]);

export const phoneOtpLocks = pgTable("phone_otp_locks", {
	phoneNormalized: text("phone_normalized").primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lockedUntil: bigint("locked_until", { mode: "number" }).notNull(),
});

export const emailChallenges = pgTable("email_challenges", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	email: text().notNull(),
	codeHash: text("code_hash").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
	attempts: smallint().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_email_challenges_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("int8_ops")),
	index("idx_email_challenges_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "email_challenges_user_id_fkey"
		}).onDelete("cascade"),
]);

export const userPins = pgTable("user_pins", {
	userId: uuid("user_id").primaryKey().notNull(),
	pinHash: text("pin_hash").notNull(),
	attemptsFailed: smallint("attempts_failed").default(0).notNull(),
	lockedUntil: timestamp("locked_until", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "user_pins_user_id_fkey"
		}).onDelete("cascade"),
]);

export const channelLinkSecrets = pgTable("channel_link_secrets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	channelCode: text("channel_code").notNull(),
	tokenHash: text("token_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_channel_link_secrets_expires").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_channel_link_secrets_user_channel").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.channelCode.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "channel_link_secrets_user_id_fkey"
		}).onDelete("cascade"),
	check("channel_link_secrets_channel_code_check", sql`channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text])`),
]);

export const userChannelPreferences = pgTable("user_channel_preferences", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	channelCode: text("channel_code").notNull(),
	isEnabledForMessages: boolean("is_enabled_for_messages").default(true).notNull(),
	isEnabledForNotifications: boolean("is_enabled_for_notifications").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isPreferredForAuth: boolean("is_preferred_for_auth").default(false).notNull(),
	platformUserId: uuid("platform_user_id").notNull(),
}, (table) => [
	uniqueIndex("idx_user_channel_preferences_one_auth_pref").using("btree", table.userId.asc().nullsLast().op("text_ops")).where(sql`(is_preferred_for_auth = true)`),
	index("idx_user_channel_preferences_platform_user_id").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")).where(sql`(platform_user_id IS NOT NULL)`),
	index("idx_user_channel_preferences_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	uniqueIndex("uq_user_channel_preferences_platform_user_channel").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops"), table.channelCode.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "user_channel_preferences_platform_user_id_fkey"
		}).onDelete("cascade"),
	unique("user_channel_preferences_user_id_channel_code_key").on(table.userId, table.channelCode),
	check("user_channel_preferences_channel_code_check", sql`channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text, 'sms'::text, 'email'::text])`),
]);

export const userOauthBindings = pgTable("user_oauth_bindings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	provider: text().notNull(),
	providerUserId: text("provider_user_id").notNull(),
	email: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_oauth_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "user_oauth_bindings_user_id_fkey"
		}).onDelete("cascade"),
	unique("user_oauth_bindings_provider_provider_user_id_key").on(table.provider, table.providerUserId),
	check("user_oauth_bindings_provider_check", sql`provider = ANY (ARRAY['google'::text, 'apple'::text, 'yandex'::text])`),
]);

export const lfkSessions = pgTable("lfk_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	complexId: uuid("complex_id").notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }).notNull(),
	source: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	durationMinutes: smallint("duration_minutes"),
	difficulty010: smallint("difficulty_0_10"),
	pain010: smallint("pain_0_10"),
	comment: text(),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_lfk_sessions_complex_completed").using("btree", table.complexId.asc().nullsLast().op("timestamptz_ops"), table.completedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_lfk_sessions_user_completed").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.completedAt.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.complexId],
			foreignColumns: [lfkComplexes.id],
			name: "lfk_sessions_complex_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "lfk_sessions_user_id_fkey"
		}).onDelete("cascade"),
	check("lfk_sessions_difficulty_0_10_check", sql`(difficulty_0_10 IS NULL) OR ((difficulty_0_10 >= 0) AND (difficulty_0_10 <= 10))`),
	check("lfk_sessions_pain_0_10_check", sql`(pain_0_10 IS NULL) OR ((pain_0_10 >= 0) AND (pain_0_10 <= 10))`),
	check("lfk_sessions_source_check", sql`source = ANY (ARRAY['bot'::text, 'webapp'::text])`),
]);

export const supportConversationMessages = pgTable("support_conversation_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	integratorMessageId: text("integrator_message_id").notNull(),
	conversationId: uuid("conversation_id").notNull(),
	senderRole: text("sender_role").notNull(),
	messageType: text("message_type").default('text').notNull(),
	text: text().notNull(),
	source: text().notNull(),
	externalChatId: text("external_chat_id"),
	externalMessageId: text("external_message_id"),
	deliveryStatus: text("delivery_status"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	mediaUrl: text("media_url"),
	mediaType: text("media_type"),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }),
	deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_support_conv_msg_conv_created").using("btree", table.conversationId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_support_conv_msg_unread_incoming").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")).where(sql`((read_at IS NULL) AND (sender_role <> 'user'::text))`),
	index("idx_support_conv_msg_unread_user_msgs").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")).where(sql`((read_at IS NULL) AND (sender_role = 'user'::text))`),
	index("idx_support_conversation_messages_conversation_created").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_support_conversation_messages_integrator_id").using("btree", table.integratorMessageId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [supportConversations.id],
			name: "support_conversation_messages_conversation_id_fkey"
		}).onDelete("cascade"),
	unique("support_conversation_messages_integrator_message_id_key").on(table.integratorMessageId),
]);

export const loginTokens = pgTable("login_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tokenHash: text("token_hash").notNull(),
	userId: uuid("user_id").notNull(),
	method: text().notNull(),
	status: text().default('pending').notNull(),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sessionIssuedAt: timestamp("session_issued_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_login_tokens_status").using("btree", table.status.asc().nullsLast().op("text_ops"), table.expiresAt.asc().nullsLast().op("text_ops")).where(sql`(status = 'pending'::text)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "login_tokens_user_id_fkey"
		}).onDelete("cascade"),
	unique("login_tokens_token_hash_key").on(table.tokenHash),
	check("login_tokens_method_check", sql`method = ANY (ARRAY['telegram'::text, 'max'::text])`),
	check("login_tokens_status_check", sql`status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'expired'::text])`),
]);

export const referenceCategories = pgTable("reference_categories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	title: text().notNull(),
	isUserExtensible: boolean("is_user_extensible").default(false).notNull(),
	ownerId: uuid("owner_id"),
	tenantId: uuid("tenant_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("reference_categories_code_key").on(table.code),
]);

export const referenceItems = pgTable("reference_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	categoryId: uuid("category_id").notNull(),
	code: text().notNull(),
	title: text().notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	metaJson: jsonb("meta_json").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_ref_items_category").using("btree", table.categoryId.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("uuid_ops")),
	index("reference_items_category_deleted_active_sort_idx").using("btree", table.categoryId.asc().nullsLast().op("timestamptz_ops"), table.deletedAt.asc().nullsLast().op("uuid_ops"), table.isActive.asc().nullsLast().op("uuid_ops"), table.sortOrder.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [referenceCategories.id],
			name: "reference_items_category_id_fkey"
		}).onDelete("cascade"),
	unique("reference_items_category_id_code_key").on(table.categoryId, table.code),
]);

export const doctorNotes = pgTable("doctor_notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	authorId: uuid("author_id").notNull(),
	text: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_doctor_notes_user_created").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [platformUsers.id],
			name: "doctor_notes_author_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "doctor_notes_user_id_fkey"
		}).onDelete("cascade"),
]);

export const symptomTrackings = pgTable("symptom_trackings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	symptomKey: text("symptom_key"),
	symptomTitle: text("symptom_title").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	symptomTypeRefId: uuid("symptom_type_ref_id"),
	regionRefId: uuid("region_ref_id"),
	side: text(),
	diagnosisText: text("diagnosis_text"),
	diagnosisRefId: uuid("diagnosis_ref_id"),
	stageRefId: uuid("stage_ref_id"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	platformUserId: uuid("platform_user_id").notNull(),
}, (table) => [
	index("idx_symptom_trackings_deleted").using("btree", table.userId.asc().nullsLast().op("text_ops")).where(sql`(deleted_at IS NOT NULL)`),
	index("idx_symptom_trackings_platform_user_id").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")).where(sql`(platform_user_id IS NOT NULL)`),
	index("idx_symptom_trackings_user_active").using("btree", table.userId.asc().nullsLast().op("bool_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.diagnosisRefId],
			foreignColumns: [referenceItems.id],
			name: "symptom_trackings_diagnosis_ref_id_fkey"
		}),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "symptom_trackings_platform_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.regionRefId],
			foreignColumns: [referenceItems.id],
			name: "symptom_trackings_region_ref_id_fkey"
		}),
	foreignKey({
			columns: [table.stageRefId],
			foreignColumns: [referenceItems.id],
			name: "symptom_trackings_stage_ref_id_fkey"
		}),
	foreignKey({
			columns: [table.symptomTypeRefId],
			foreignColumns: [referenceItems.id],
			name: "symptom_trackings_symptom_type_ref_id_fkey"
		}),
	check("symptom_trackings_side_check", sql`(side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))`),
]);

export const newsItems = pgTable("news_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	bodyMd: text("body_md").default('').notNull(),
	isVisible: boolean("is_visible").default(false).notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	viewsCount: integer("views_count").default(0).notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_news_items_visible").using("btree", table.isVisible.asc().nullsLast().op("bool_ops"), table.sortOrder.desc().nullsFirst().op("int4_ops"), table.publishedAt.desc().nullsFirst().op("bool_ops")),
	check("news_items_views_count_check", sql`views_count >= 0`),
]);

export const lfkComplexes = pgTable("lfk_complexes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: text().notNull(),
	origin: text().default('manual').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	symptomTrackingId: uuid("symptom_tracking_id"),
	regionRefId: uuid("region_ref_id"),
	side: text(),
	diagnosisText: text("diagnosis_text"),
	diagnosisRefId: uuid("diagnosis_ref_id"),
	platformUserId: uuid("platform_user_id").notNull(),
}, (table) => [
	index("idx_lfk_complexes_platform_user_id").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")).where(sql`(platform_user_id IS NOT NULL)`),
	index("idx_lfk_complexes_user_active").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.diagnosisRefId],
			foreignColumns: [referenceItems.id],
			name: "lfk_complexes_diagnosis_ref_id_fkey"
		}),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "lfk_complexes_platform_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.regionRefId],
			foreignColumns: [referenceItems.id],
			name: "lfk_complexes_region_ref_id_fkey"
		}),
	foreignKey({
			columns: [table.symptomTrackingId],
			foreignColumns: [symptomTrackings.id],
			name: "lfk_complexes_symptom_tracking_id_fkey"
		}),
	check("lfk_complexes_origin_check", sql`origin = ANY (ARRAY['manual'::text, 'assigned_by_specialist'::text])`),
	check("lfk_complexes_side_check", sql`(side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))`),
]);

export const motivationalQuotes = pgTable("motivational_quotes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bodyText: text("body_text").notNull(),
	author: text(),
	isActive: boolean("is_active").default(true).notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_motivational_quotes_active").using("btree", table.isActive.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
]);

export const lfkExercises = pgTable("lfk_exercises", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	regionRefId: uuid("region_ref_id"),
	loadType: text("load_type"),
	difficulty110: integer("difficulty_1_10"),
	contraindications: text(),
	tags: text().array(),
	isArchived: boolean("is_archived").default(false).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_lfk_exercises_archived").using("btree", table.isArchived.asc().nullsLast().op("bool_ops")),
	index("idx_lfk_exercises_region").using("btree", table.regionRefId.asc().nullsLast().op("uuid_ops")).where(sql`(NOT is_archived)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [platformUsers.id],
			name: "lfk_exercises_created_by_fkey"
		}),
	foreignKey({
			columns: [table.regionRefId],
			foreignColumns: [referenceItems.id],
			name: "lfk_exercises_region_ref_id_fkey"
		}),
	check("lfk_exercises_difficulty_1_10_check", sql`(difficulty_1_10 IS NULL) OR ((difficulty_1_10 >= 1) AND (difficulty_1_10 <= 10))`),
	check("lfk_exercises_load_type_check", sql`load_type = ANY (ARRAY['strength'::text, 'stretch'::text, 'balance'::text, 'cardio'::text, 'other'::text])`),
]);

export const lfkComplexTemplateExercises = pgTable("lfk_complex_template_exercises", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	templateId: uuid("template_id").notNull(),
	exerciseId: uuid("exercise_id").notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	reps: integer(),
	sets: integer(),
	side: text(),
	maxPain010: integer("max_pain_0_10"),
	comment: text(),
}, (table) => [
	index("idx_template_exercises_order").using("btree", table.templateId.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.exerciseId],
			foreignColumns: [lfkExercises.id],
			name: "lfk_complex_template_exercises_exercise_id_fkey"
		}),
	foreignKey({
			columns: [table.templateId],
			foreignColumns: [lfkComplexTemplates.id],
			name: "lfk_complex_template_exercises_template_id_fkey"
		}).onDelete("cascade"),
	unique("lfk_complex_template_exercises_template_id_exercise_id_key").on(table.templateId, table.exerciseId),
	check("lfk_complex_template_exercises_max_pain_0_10_check", sql`(max_pain_0_10 IS NULL) OR ((max_pain_0_10 >= 0) AND (max_pain_0_10 <= 10))`),
	check("lfk_complex_template_exercises_side_check", sql`(side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))`),
]);

export const lfkExerciseMedia = pgTable("lfk_exercise_media", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	exerciseId: uuid("exercise_id").notNull(),
	mediaUrl: text("media_url").notNull(),
	mediaType: text("media_type").notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_lfk_exercise_media_exercise").using("btree", table.exerciseId.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.exerciseId],
			foreignColumns: [lfkExercises.id],
			name: "lfk_exercise_media_exercise_id_fkey"
		}).onDelete("cascade"),
	check("lfk_exercise_media_media_type_check", sql`media_type = ANY (ARRAY['image'::text, 'video'::text, 'gif'::text])`),
]);

export const lfkComplexTemplates = pgTable("lfk_complex_templates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	status: text().default('draft').notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [platformUsers.id],
			name: "lfk_complex_templates_created_by_fkey"
		}),
	check("lfk_complex_templates_status_check", sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])`),
]);

export const patientLfkAssignments = pgTable("patient_lfk_assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	patientUserId: uuid("patient_user_id").notNull(),
	templateId: uuid("template_id").notNull(),
	complexId: uuid("complex_id"),
	assignedBy: uuid("assigned_by"),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	index("idx_assignments_patient").using("btree", table.patientUserId.asc().nullsLast().op("uuid_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	uniqueIndex("idx_patient_lfk_assign_active_template").using("btree", table.patientUserId.asc().nullsLast().op("uuid_ops"), table.templateId.asc().nullsLast().op("uuid_ops")).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.assignedBy],
			foreignColumns: [platformUsers.id],
			name: "patient_lfk_assignments_assigned_by_fkey"
		}),
	foreignKey({
			columns: [table.complexId],
			foreignColumns: [lfkComplexes.id],
			name: "patient_lfk_assignments_complex_id_fkey"
		}),
	foreignKey({
			columns: [table.patientUserId],
			foreignColumns: [platformUsers.id],
			name: "patient_lfk_assignments_patient_user_id_fkey"
		}),
	foreignKey({
			columns: [table.templateId],
			foreignColumns: [lfkComplexTemplates.id],
			name: "patient_lfk_assignments_template_id_fkey"
		}),
]);

export const lfkComplexExercises = pgTable("lfk_complex_exercises", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	complexId: uuid("complex_id").notNull(),
	exerciseId: uuid("exercise_id").notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	reps: integer(),
	sets: integer(),
	side: text(),
	maxPain010: integer("max_pain_0_10"),
	comment: text(),
}, (table) => [
	index("idx_lfk_complex_exercises_complex").using("btree", table.complexId.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.complexId],
			foreignColumns: [lfkComplexes.id],
			name: "lfk_complex_exercises_complex_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.exerciseId],
			foreignColumns: [lfkExercises.id],
			name: "lfk_complex_exercises_exercise_id_fkey"
		}),
	unique("lfk_complex_exercises_complex_id_exercise_id_key").on(table.complexId, table.exerciseId),
	check("lfk_complex_exercises_max_pain_0_10_check", sql`(max_pain_0_10 IS NULL) OR ((max_pain_0_10 >= 0) AND (max_pain_0_10 <= 10))`),
	check("lfk_complex_exercises_side_check", sql`(side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))`),
]);

export const authRateLimitEvents = pgTable("auth_rate_limit_events", {
	scope: text().notNull(),
	key: text().notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_auth_rate_limit_events_scope_key_time").using("btree", table.scope.asc().nullsLast().op("text_ops"), table.key.asc().nullsLast().op("text_ops"), table.occurredAt.asc().nullsLast().op("text_ops")),
]);

export const mediaFiles = pgTable("media_files", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	originalName: text("original_name").notNull(),
	storedPath: text("stored_path").notNull(),
	mimeType: text("mime_type").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
	uploadedBy: uuid("uploaded_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	s3Key: text("s3_key"),
	status: text().default('ready').notNull(),
	deleteAttempts: integer("delete_attempts").default(0).notNull(),
	nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: 'string' }),
	displayName: text("display_name"),
	folderId: uuid("folder_id"),
	previewStatus: text("preview_status").default('pending').notNull(),
	previewSmKey: text("preview_sm_key"),
	previewMdKey: text("preview_md_key"),
	previewAttempts: integer("preview_attempts").default(0).notNull(),
	previewNextAttemptAt: timestamp("preview_next_attempt_at", { withTimezone: true, mode: 'string' }),
	sourceWidth: integer("source_width"),
	sourceHeight: integer("source_height"),
}, (table) => [
	index("idx_media_files_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_media_files_folder_created").using("btree", table.folderId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(folder_id IS NOT NULL)`),
	index("idx_media_files_preview_status").using("btree", table.previewStatus.asc().nullsLast().op("text_ops")).where(sql`(preview_status = 'pending'::text)`),
	index("idx_media_files_purge_queue").using("btree", table.nextAttemptAt.asc().nullsFirst().op("timestamptz_ops")).where(sql`(status = ANY (ARRAY['pending_delete'::text, 'deleting'::text]))`),
	index("idx_media_files_uploaded_by").using("btree", table.uploadedBy.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.folderId],
			foreignColumns: [mediaFolders.id],
			name: "media_files_folder_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [platformUsers.id],
			name: "media_files_uploaded_by_fkey"
		}).onDelete("set null"),
	check("media_files_preview_status_check", sql`preview_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text, 'skipped'::text])`),
	check("media_files_size_bytes_check", sql`(size_bytes >= 0) AND (size_bytes <= '3221225472'::bigint)`),
	check("media_files_status_check", sql`status = ANY (ARRAY['ready'::text, 'pending'::text, 'deleting'::text, 'pending_delete'::text])`),
]);

export const bookingBranches = pgTable("booking_branches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cityId: uuid("city_id").notNull(),
	title: text().notNull(),
	address: text(),
	rubitimeBranchId: text("rubitime_branch_id").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	timezone: text().default('Europe/Moscow').notNull(),
}, (table) => [
	index("idx_booking_branches_city_id").using("btree", table.cityId.asc().nullsLast().op("uuid_ops")),
	index("idx_booking_branches_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	uniqueIndex("idx_booking_branches_rubitime_id").using("btree", table.rubitimeBranchId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.cityId],
			foreignColumns: [bookingCities.id],
			name: "booking_branches_city_id_fkey"
		}),
]);

export const bookingCities = pgTable("booking_cities", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	title: text().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_booking_cities_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	unique("booking_cities_code_key").on(table.code),
]);

export const contentSections = pgTable("content_sections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	title: text().notNull(),
	description: text().default('').notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isVisible: boolean("is_visible").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	requiresAuth: boolean("requires_auth").default(false).notNull(),
}, (table) => [
	index("idx_content_sections_sort").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops"), table.title.asc().nullsLast().op("int4_ops")),
	unique("content_sections_slug_key").on(table.slug),
]);

/** История переименований slug раздела контента (редиректы для пациентских URL). Phase 4 CMS workflow. */
export const contentSectionSlugHistory = pgTable("content_section_slug_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	oldSlug: text("old_slug").notNull(),
	newSlug: text("new_slug").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("content_section_slug_history_old_slug_key").on(table.oldSlug),
	index("idx_content_section_slug_history_new_slug").using("btree", table.newSlug.asc().nullsLast().op("text_ops")),
]);

export const bookingSpecialists = pgTable("booking_specialists", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	branchId: uuid("branch_id").notNull(),
	fullName: text("full_name").notNull(),
	description: text(),
	rubitimeCooperatorId: text("rubitime_cooperator_id").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_booking_specialists_branch_id").using("btree", table.branchId.asc().nullsLast().op("uuid_ops")),
	index("idx_booking_specialists_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	uniqueIndex("idx_booking_specialists_rubitime_id").using("btree", table.rubitimeCooperatorId.asc().nullsLast().op("text_ops"), table.branchId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [bookingBranches.id],
			name: "booking_specialists_branch_id_fkey"
		}),
]);

export const bookingBranchServices = pgTable("booking_branch_services", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	branchId: uuid("branch_id").notNull(),
	serviceId: uuid("service_id").notNull(),
	specialistId: uuid("specialist_id").notNull(),
	rubitimeServiceId: text("rubitime_service_id").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_booking_branch_services_branch_id").using("btree", table.branchId.asc().nullsLast().op("uuid_ops")),
	index("idx_booking_branch_services_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_booking_branch_services_service_id").using("btree", table.serviceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [bookingBranches.id],
			name: "booking_branch_services_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [bookingServices.id],
			name: "booking_branch_services_service_id_fkey"
		}),
	foreignKey({
			columns: [table.specialistId],
			foreignColumns: [bookingSpecialists.id],
			name: "booking_branch_services_specialist_id_fkey"
		}),
	unique("uq_booking_branch_services").on(table.branchId, table.serviceId),
]);

export const bookingServices = pgTable("booking_services", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	durationMinutes: integer("duration_minutes").notNull(),
	priceMinor: integer("price_minor").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_booking_services_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	unique("uq_booking_services_title_duration").on(table.title, table.durationMinutes),
]);

export const onlineIntakeRequests = pgTable("online_intake_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	type: text().notNull(),
	status: text().default('new').notNull(),
	summary: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_online_intake_requests_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_online_intake_requests_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_online_intake_requests_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	index("idx_online_intake_requests_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "online_intake_requests_user_id_fkey"
		}),
	check("online_intake_requests_status_check", sql`status = ANY (ARRAY['new'::text, 'in_review'::text, 'contacted'::text, 'closed'::text])`),
	check("online_intake_requests_type_check", sql`type = ANY (ARRAY['lfk'::text, 'nutrition'::text])`),
]);

export const patientBookings = pgTable("patient_bookings", {
	id: uuid().primaryKey().notNull(),
	platformUserId: uuid("platform_user_id"),
	bookingType: text("booking_type").notNull(),
	city: text(),
	category: text().notNull(),
	slotStart: timestamp("slot_start", { withTimezone: true, mode: 'string' }).notNull(),
	slotEnd: timestamp("slot_end", { withTimezone: true, mode: 'string' }).notNull(),
	status: text().notNull(),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
	cancelReason: text("cancel_reason"),
	rubitimeId: text("rubitime_id"),
	gcalEventId: text("gcal_event_id"),
	contactPhone: text("contact_phone").notNull(),
	contactEmail: text("contact_email"),
	contactName: text("contact_name").notNull(),
	reminder24HSent: boolean("reminder_24h_sent").default(false).notNull(),
	reminder2HSent: boolean("reminder_2h_sent").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	branchId: uuid("branch_id"),
	serviceId: uuid("service_id"),
	branchServiceId: uuid("branch_service_id"),
	cityCodeSnapshot: text("city_code_snapshot"),
	branchTitleSnapshot: text("branch_title_snapshot"),
	serviceTitleSnapshot: text("service_title_snapshot"),
	durationMinutesSnapshot: integer("duration_minutes_snapshot"),
	priceMinorSnapshot: integer("price_minor_snapshot"),
	rubitimeBranchIdSnapshot: text("rubitime_branch_id_snapshot"),
	rubitimeCooperatorIdSnapshot: text("rubitime_cooperator_id_snapshot"),
	rubitimeServiceIdSnapshot: text("rubitime_service_id_snapshot"),
	source: text().default('native').notNull(),
	compatQuality: text("compat_quality"),
	provenanceCreatedBy: text("provenance_created_by"),
	provenanceUpdatedBy: text("provenance_updated_by"),
	rubitimeManageUrl: text("rubitime_manage_url"),
}, (table) => [
	index("idx_patient_bookings_branch_id").using("btree", table.branchId.asc().nullsLast().op("uuid_ops")),
	index("idx_patient_bookings_branch_service_id").using("btree", table.branchServiceId.asc().nullsLast().op("uuid_ops")),
	index("idx_patient_bookings_rubitime_id").using("btree", table.rubitimeId.asc().nullsLast().op("text_ops")),
	index("idx_patient_bookings_service_id").using("btree", table.serviceId.asc().nullsLast().op("uuid_ops")),
	index("idx_patient_bookings_slot_start").using("btree", table.slotStart.asc().nullsLast().op("timestamptz_ops")),
	index("idx_patient_bookings_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
	index("idx_patient_bookings_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_patient_bookings_user_id").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [bookingBranches.id],
			name: "patient_bookings_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.branchServiceId],
			foreignColumns: [bookingBranchServices.id],
			name: "patient_bookings_branch_service_id_fkey"
		}),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "patient_bookings_platform_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [bookingServices.id],
			name: "patient_bookings_service_id_fkey"
		}),
	unique("patient_bookings_rubitime_id_key").on(table.rubitimeId),
	check("patient_bookings_booking_type_check", sql`booking_type = ANY (ARRAY['in_person'::text, 'online'::text])`),
	check("patient_bookings_category_check", sql`category = ANY (ARRAY['rehab_lfk'::text, 'nutrition'::text, 'general'::text])`),
	check("patient_bookings_check", sql`slot_end > slot_start`),
	check("patient_bookings_compat_quality_check", sql`compat_quality = ANY (ARRAY['full'::text, 'partial'::text, 'minimal'::text])`),
	check("patient_bookings_platform_user_native_required", sql`(source <> 'native'::text) OR (platform_user_id IS NOT NULL)`),
	check("patient_bookings_source_check", sql`source = ANY (ARRAY['native'::text, 'rubitime_projection'::text])`),
	check("patient_bookings_status_check", sql`status = ANY (ARRAY['creating'::text, 'confirmed'::text, 'cancelling'::text, 'cancel_failed'::text, 'cancelled'::text, 'rescheduled'::text, 'completed'::text, 'no_show'::text, 'failed_sync'::text])`),
]);

export const onlineIntakeAnswers = pgTable("online_intake_answers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	questionId: text("question_id").notNull(),
	ordinal: integer().notNull(),
	value: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_online_intake_answers_request_id").using("btree", table.requestId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [onlineIntakeRequests.id],
			name: "online_intake_answers_request_id_fkey"
		}).onDelete("cascade"),
	unique("online_intake_answers_request_id_question_id_key").on(table.requestId, table.questionId),
]);

export const onlineIntakeAttachments = pgTable("online_intake_attachments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	attachmentType: text("attachment_type").notNull(),
	s3Key: text("s3_key"),
	url: text(),
	mimeType: text("mime_type"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sizeBytes: bigint("size_bytes", { mode: "number" }),
	originalName: text("original_name"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_online_intake_attachments_request_id").using("btree", table.requestId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [onlineIntakeRequests.id],
			name: "online_intake_attachments_request_id_fkey"
		}).onDelete("cascade"),
	check("online_intake_attachments_attachment_type_check", sql`attachment_type = ANY (ARRAY['file'::text, 'url'::text])`),
	check("online_intake_attachments_check", sql`((attachment_type = 'file'::text) AND (s3_key IS NOT NULL)) OR ((attachment_type = 'url'::text) AND (url IS NOT NULL))`),
]);

export const onlineIntakeStatusHistory = pgTable("online_intake_status_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	fromStatus: text("from_status"),
	toStatus: text("to_status").notNull(),
	changedBy: uuid("changed_by"),
	note: text(),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_online_intake_status_history_changed_at").using("btree", table.changedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_online_intake_status_history_request_id").using("btree", table.requestId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.changedBy],
			foreignColumns: [platformUsers.id],
			name: "online_intake_status_history_changed_by_fkey"
		}),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [onlineIntakeRequests.id],
			name: "online_intake_status_history_request_id_fkey"
		}).onDelete("cascade"),
]);

export const reminderOccurrenceHistory = pgTable("reminder_occurrence_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	integratorOccurrenceId: text("integrator_occurrence_id").notNull(),
	integratorRuleId: text("integrator_rule_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorUserId: bigint("integrator_user_id", { mode: "number" }).notNull(),
	category: text().notNull(),
	status: text().notNull(),
	deliveryChannel: text("delivery_channel"),
	errorCode: text("error_code"),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	seenAt: timestamp("seen_at", { withTimezone: true, mode: 'string' }),
	snoozedAt: timestamp("snoozed_at", { withTimezone: true, mode: 'string' }),
	snoozedUntil: timestamp("snoozed_until", { withTimezone: true, mode: 'string' }),
	skippedAt: timestamp("skipped_at", { withTimezone: true, mode: 'string' }),
	skipReason: text("skip_reason"),
}, (table) => [
	uniqueIndex("idx_reminder_occurrence_history_integrator_occ_id").using("btree", table.integratorOccurrenceId.asc().nullsLast().op("text_ops")),
	index("idx_reminder_occurrence_history_integrator_user_id").using("btree", table.integratorUserId.asc().nullsLast().op("int8_ops")),
	index("idx_reminder_occurrence_history_occurred_at").using("btree", table.occurredAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_reminder_occurrence_history_seen_at").using("btree", table.seenAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(seen_at IS NULL)`),
	index("idx_reminder_occurrence_history_skipped_at").using("btree", table.skippedAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(skipped_at IS NOT NULL)`),
	index("idx_reminder_occurrence_history_snoozed_until").using("btree", table.snoozedUntil.asc().nullsLast().op("timestamptz_ops")).where(sql`(snoozed_until IS NOT NULL)`),
	unique("reminder_occurrence_history_integrator_occurrence_id_key").on(table.integratorOccurrenceId),
	check("chk_reminder_occurrence_skip_reason_len", sql`(skip_reason IS NULL) OR (length(skip_reason) <= 500)`),
	check("chk_reminder_occurrence_snooze_pair", sql`((snoozed_at IS NULL) AND (snoozed_until IS NULL)) OR ((snoozed_at IS NOT NULL) AND (snoozed_until IS NOT NULL))`),
	check("reminder_occurrence_history_status_check", sql`status = ANY (ARRAY['sent'::text, 'failed'::text])`),
]);

export const reminderRules = pgTable("reminder_rules", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	integratorRuleId: text("integrator_rule_id").notNull(),
	platformUserId: uuid("platform_user_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	integratorUserId: bigint("integrator_user_id", { mode: "number" }).notNull(),
	category: text().notNull(),
	isEnabled: boolean("is_enabled").default(false).notNull(),
	scheduleType: text("schedule_type").default('interval_window').notNull(),
	timezone: text().default('Europe/Moscow').notNull(),
	intervalMinutes: integer("interval_minutes").notNull(),
	windowStartMinute: integer("window_start_minute").notNull(),
	windowEndMinute: integer("window_end_minute").notNull(),
	daysMask: text("days_mask").default('1111111').notNull(),
	contentMode: text("content_mode").default('none').notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	linkedObjectType: text("linked_object_type"),
	linkedObjectId: text("linked_object_id"),
	customTitle: text("custom_title"),
	customText: text("custom_text"),
}, (table) => [
	uniqueIndex("idx_reminder_rules_integrator_rule_id").using("btree", table.integratorRuleId.asc().nullsLast().op("text_ops")),
	index("idx_reminder_rules_integrator_user_id").using("btree", table.integratorUserId.asc().nullsLast().op("int8_ops")),
	index("idx_reminder_rules_integrator_user_updated_at").using("btree", table.integratorUserId.asc().nullsLast().op("timestamptz_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_reminder_rules_linked_object").using("btree", table.linkedObjectType.asc().nullsLast().op("text_ops"), table.linkedObjectId.asc().nullsLast().op("text_ops")).where(sql`((linked_object_type IS NOT NULL) AND (linked_object_id IS NOT NULL))`),
	index("idx_reminder_rules_linked_object_type").using("btree", table.linkedObjectType.asc().nullsLast().op("text_ops")).where(sql`(linked_object_type IS NOT NULL)`),
	index("idx_reminder_rules_platform_user_id").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")).where(sql`(platform_user_id IS NOT NULL)`),
	index("idx_reminder_rules_platform_user_updated_at").using("btree", table.platformUserId.asc().nullsLast().op("timestamptz_ops"), table.updatedAt.desc().nullsFirst().op("uuid_ops")).where(sql`(platform_user_id IS NOT NULL)`),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "reminder_rules_platform_user_id_fkey"
		}).onDelete("set null"),
	unique("reminder_rules_integrator_rule_id_key").on(table.integratorRuleId),
	check("chk_reminder_rules_custom_only_for_custom_type", sql`(linked_object_type = 'custom'::text) OR ((custom_title IS NULL) AND (custom_text IS NULL))`),
	check("chk_reminder_rules_custom_required", sql`(linked_object_type IS DISTINCT FROM 'custom'::text) OR ((custom_title IS NOT NULL) AND (btrim(custom_title) <> ''::text))`),
	check("chk_reminder_rules_linked_object_type", sql`(linked_object_type IS NULL) OR (linked_object_type = ANY (ARRAY['lfk_complex'::text, 'content_section'::text, 'content_page'::text, 'custom'::text]))`),
	check("chk_reminder_rules_object_id_required", sql`(linked_object_type IS NULL) OR (linked_object_type = 'custom'::text) OR ((linked_object_id IS NOT NULL) AND (btrim(linked_object_id) <> ''::text))`),
]);

export const reminderJournal = pgTable("reminder_journal", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ruleId: uuid("rule_id").notNull(),
	occurrenceId: text("occurrence_id"),
	action: text().notNull(),
	snoozeUntil: timestamp("snooze_until", { withTimezone: true, mode: 'string' }),
	skipReason: text("skip_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_reminder_journal_action_created_at").using("btree", table.action.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_reminder_journal_occurrence_id").using("btree", table.occurrenceId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(occurrence_id IS NOT NULL)`),
	index("idx_reminder_journal_rule_created_at").using("btree", table.ruleId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	uniqueIndex("uq_reminder_journal_once_done_per_occurrence").using("btree", table.occurrenceId.asc().nullsLast().op("text_ops"), table.action.asc().nullsLast().op("text_ops")).where(sql`((occurrence_id IS NOT NULL) AND (action = 'done'::text))`),
	uniqueIndex("uq_reminder_journal_once_skipped_per_occurrence").using("btree", table.occurrenceId.asc().nullsLast().op("text_ops"), table.action.asc().nullsLast().op("text_ops")).where(sql`((occurrence_id IS NOT NULL) AND (action = 'skipped'::text))`),
	uniqueIndex("uq_reminder_journal_snooze_dedupe").using("btree", table.occurrenceId.asc().nullsLast().op("timestamptz_ops"), table.action.asc().nullsLast().op("text_ops"), table.snoozeUntil.asc().nullsLast().op("timestamptz_ops")).where(sql`((occurrence_id IS NOT NULL) AND (action = 'snoozed'::text) AND (snooze_until IS NOT NULL))`),
	foreignKey({
			columns: [table.occurrenceId],
			foreignColumns: [reminderOccurrenceHistory.integratorOccurrenceId],
			name: "reminder_journal_occurrence_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.ruleId],
			foreignColumns: [reminderRules.id],
			name: "reminder_journal_rule_id_fkey"
		}).onDelete("cascade"),
	check("reminder_journal_action_check", sql`action = ANY (ARRAY['done'::text, 'skipped'::text, 'snoozed'::text])`),
	check("reminder_journal_check", sql`((action = 'snoozed'::text) AND (snooze_until IS NOT NULL)) OR ((action <> 'snoozed'::text) AND (snooze_until IS NULL))`),
	check("reminder_journal_skip_reason_check", sql`(skip_reason IS NULL) OR (length(skip_reason) <= 500)`),
]);

export const integratorPushOutbox = pgTable("integrator_push_outbox", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	kind: text().notNull(),
	idempotencyKey: text("idempotency_key").notNull(),
	payload: jsonb().default({}).notNull(),
	status: text().default('pending').notNull(),
	attemptsDone: integer("attempts_done").default(0).notNull(),
	maxAttempts: integer("max_attempts").default(8).notNull(),
	nextTryAt: timestamp("next_try_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_integrator_push_outbox_due").using("btree", table.status.asc().nullsLast().op("text_ops"), table.nextTryAt.asc().nullsLast().op("text_ops")).where(sql`(status = 'pending'::text)`),
	unique("integrator_push_outbox_idempotency_key_key").on(table.idempotencyKey),
	check("integrator_push_outbox_status_check", sql`status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'dead'::text])`),
]);

export const adminAuditLog = pgTable("admin_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	actorId: uuid("actor_id"),
	action: text().notNull(),
	targetId: text("target_id"),
	conflictKey: text("conflict_key"),
	details: jsonb().default({}).notNull(),
	status: text().default('ok').notNull(),
	repeatCount: integer("repeat_count").default(1).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_admin_audit_log_action").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("idx_admin_audit_log_conflict_key").using("btree", table.conflictKey.asc().nullsLast().op("text_ops")).where(sql`(conflict_key IS NOT NULL)`),
	uniqueIndex("idx_admin_audit_log_conflict_open").using("btree", table.conflictKey.asc().nullsLast().op("text_ops")).where(sql`((conflict_key IS NOT NULL) AND (resolved_at IS NULL))`),
	index("idx_admin_audit_log_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_admin_audit_log_target").using("btree", table.targetId.asc().nullsLast().op("text_ops")).where(sql`(target_id IS NOT NULL)`),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [platformUsers.id],
			name: "admin_audit_log_actor_id_fkey"
		}).onDelete("set null"),
	check("admin_audit_log_status_check", sql`status = ANY (ARRAY['ok'::text, 'partial_failure'::text, 'error'::text])`),
]);

export const mediaFolders = pgTable("media_folders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	parentId: uuid("parent_id"),
	name: text().notNull(),
	nameNormalized: text("name_normalized").generatedAlwaysAs(sql`lower(TRIM(BOTH FROM name))`),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_media_folders_parent_id").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_media_folders_child_name").using("btree", table.parentId.asc().nullsLast().op("uuid_ops"), table.nameNormalized.asc().nullsLast().op("text_ops")).where(sql`(parent_id IS NOT NULL)`),
	uniqueIndex("uq_media_folders_root_name").using("btree", table.nameNormalized.asc().nullsLast().op("text_ops")).where(sql`(parent_id IS NULL)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [platformUsers.id],
			name: "media_folders_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "media_folders_parent_id_fkey"
		}).onDelete("restrict"),
	check("media_folders_check", sql`(parent_id IS NULL) OR (parent_id <> id)`),
	check("media_folders_name_check", sql`(length(TRIM(BOTH FROM name)) > 0) AND (char_length(name) <= 180)`),
]);

export const mediaUploadSessions = pgTable("media_upload_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	mediaId: uuid("media_id").notNull(),
	s3Key: text("s3_key").notNull(),
	uploadId: text("upload_id").notNull(),
	ownerUserId: uuid("owner_user_id").notNull(),
	status: text().default('initiated').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	expectedSizeBytes: bigint("expected_size_bytes", { mode: "number" }).notNull(),
	mimeType: text("mime_type").notNull(),
	partSizeBytes: integer("part_size_bytes").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	abortedAt: timestamp("aborted_at", { withTimezone: true, mode: 'string' }),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_media_upload_sessions_expires").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text]))`),
	index("idx_media_upload_sessions_owner").using("btree", table.ownerUserId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_media_upload_sessions_one_active_per_media").using("btree", table.mediaId.asc().nullsLast().op("uuid_ops")).where(sql`(status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text]))`),
	foreignKey({
			columns: [table.mediaId],
			foreignColumns: [mediaFiles.id],
			name: "media_upload_sessions_media_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [platformUsers.id],
			name: "media_upload_sessions_owner_user_id_fkey"
		}).onDelete("cascade"),
	check("media_upload_sessions_expected_size_bytes_check", sql`expected_size_bytes > 0`),
	check("media_upload_sessions_part_size_bytes_check", sql`(part_size_bytes >= 1) AND (part_size_bytes <= 536870912)`),
	check("media_upload_sessions_status_check", sql`status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text, 'completed'::text, 'aborted'::text, 'expired'::text, 'failed'::text])`),
]);

export const schemaMigrations = pgTable("schema_migrations", {
	version: text().primaryKey().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const deliveryAttemptLogs = pgTable("delivery_attempt_logs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	intentType: text("intent_type"),
	intentEventId: text("intent_event_id"),
	correlationId: text("correlation_id"),
	channel: text().notNull(),
	status: text().notNull(),
	attempt: integer().notNull(),
	reason: text(),
	payloadJson: jsonb("payload_json").default({}).notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_delivery_attempt_logs_channel_occurred").using("btree", table.channel.asc().nullsLast().op("text_ops"), table.occurredAt.desc().nullsFirst().op("text_ops")),
	index("idx_delivery_attempt_logs_correlation").using("btree", table.correlationId.asc().nullsLast().op("text_ops")),
	index("idx_delivery_attempt_logs_event").using("btree", table.intentEventId.asc().nullsLast().op("text_ops")),
	check("delivery_attempt_logs_attempt_check", sql`attempt > 0`),
	check("delivery_attempt_logs_status_check", sql`status = ANY (ARRAY['success'::text, 'failed'::text])`),
]);

export const identities = pgTable("identities", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	resource: text().notNull(),
	externalId: text("external_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_identities_user_id").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "identities_user_id_fkey"
		}).onDelete("cascade"),
	unique("identities_resource_external_id_key").on(table.resource, table.externalId),
]);

export const contacts = pgTable("contacts", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	type: text().notNull(),
	valueNormalized: text("value_normalized").notNull(),
	label: text(),
	isPrimary: boolean("is_primary"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_contacts_user_id").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "contacts_user_id_fkey"
		}).onDelete("cascade"),
	unique("contacts_type_value_normalized_key").on(table.type, table.valueNormalized),
]);

export const users = pgTable("users", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	mergedIntoUserId: bigint("merged_into_user_id", { mode: "number" }),
}, (table) => [
	index("idx_users_merged_into_user_id").using("btree", table.mergedIntoUserId.asc().nullsLast().op("int8_ops")).where(sql`(merged_into_user_id IS NOT NULL)`),
	foreignKey({
			columns: [table.mergedIntoUserId],
			foreignColumns: [table.id],
			name: "users_merged_into_user_id_fkey"
		}),
	check("users_merged_into_user_id_not_self_check", sql`(merged_into_user_id IS NULL) OR (merged_into_user_id <> id)`),
]);

export const messageDrafts = pgTable("message_drafts", {
	id: text().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	identityId: bigint("identity_id", { mode: "number" }).notNull(),
	source: text().notNull(),
	externalChatId: text("external_chat_id"),
	externalMessageId: text("external_message_id"),
	draftTextCurrent: text("draft_text_current").notNull(),
	state: text().default('pending_confirmation').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("message_drafts_identity_source_uidx").using("btree", table.identityId.asc().nullsLast().op("int8_ops"), table.source.asc().nullsLast().op("text_ops")),
	index("message_drafts_source_updated_idx").using("btree", table.source.asc().nullsLast().op("text_ops"), table.updatedAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.identityId],
			foreignColumns: [identities.id],
			name: "message_drafts_identity_id_fkey"
		}).onDelete("cascade"),
	check("message_drafts_state_check", sql`state = 'pending_confirmation'::text`),
]);

export const conversations = pgTable("conversations", {
	id: text().primaryKey().notNull(),
	source: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userIdentityId: bigint("user_identity_id", { mode: "number" }).notNull(),
	adminScope: text("admin_scope").notNull(),
	status: text().notNull(),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }).notNull(),
	lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: 'string' }).notNull(),
	closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
	closeReason: text("close_reason"),
}, (table) => [
	uniqueIndex("conversations_open_user_source_uidx").using("btree", table.userIdentityId.asc().nullsLast().op("int8_ops"), table.source.asc().nullsLast().op("text_ops")).where(sql`((closed_at IS NULL) AND (status <> 'closed'::text))`),
	index("conversations_status_last_message_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.lastMessageAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.userIdentityId],
			foreignColumns: [identities.id],
			name: "conversations_user_identity_id_fkey"
		}).onDelete("cascade"),
	check("conversations_status_check", sql`status = ANY (ARRAY['open'::text, 'waiting_admin'::text, 'waiting_user'::text, 'closed'::text])`),
]);

export const conversationMessages = pgTable("conversation_messages", {
	id: text().primaryKey().notNull(),
	conversationId: text("conversation_id").notNull(),
	senderRole: text("sender_role").notNull(),
	text: text().notNull(),
	source: text().notNull(),
	externalChatId: text("external_chat_id"),
	externalMessageId: text("external_message_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("conversation_messages_conversation_created_idx").using("btree", table.conversationId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "conversation_messages_conversation_id_fkey"
		}).onDelete("cascade"),
	check("conversation_messages_sender_role_check", sql`sender_role = ANY (ARRAY['user'::text, 'admin'::text, 'system'::text])`),
]);

export const userQuestions = pgTable("user_questions", {
	id: text().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userIdentityId: bigint("user_identity_id", { mode: "number" }).notNull(),
	conversationId: text("conversation_id"),
	telegramMessageId: text("telegram_message_id"),
	text: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	answered: boolean().default(false).notNull(),
	answeredAt: timestamp("answered_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("user_questions_answered_created_idx").using("btree", table.answered.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(answered = false)`),
	index("user_questions_conversation_id_idx").using("btree", table.conversationId.asc().nullsLast().op("text_ops")).where(sql`(conversation_id IS NOT NULL)`),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "user_questions_conversation_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userIdentityId],
			foreignColumns: [identities.id],
			name: "user_questions_user_identity_id_fkey"
		}).onDelete("cascade"),
]);

export const questionMessages = pgTable("question_messages", {
	id: text().primaryKey().notNull(),
	questionId: text("question_id").notNull(),
	senderType: text("sender_type").notNull(),
	messageText: text("message_text").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("question_messages_question_created_idx").using("btree", table.questionId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.questionId],
			foreignColumns: [userQuestions.id],
			name: "question_messages_question_id_fkey"
		}).onDelete("cascade"),
]);

export const userReminderRules = pgTable("user_reminder_rules", {
	id: text().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	category: text().notNull(),
	isEnabled: boolean("is_enabled").default(false).notNull(),
	scheduleType: text("schedule_type").default('interval_window').notNull(),
	timezone: text().default('Europe/Moscow').notNull(),
	intervalMinutes: integer("interval_minutes").notNull(),
	windowStartMinute: integer("window_start_minute").notNull(),
	windowEndMinute: integer("window_end_minute").notNull(),
	daysMask: text("days_mask").default('1111111').notNull(),
	contentMode: text("content_mode").default('none').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("user_reminder_rules_enabled_idx").using("btree", table.isEnabled.asc().nullsLast().op("text_ops"), table.category.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_reminder_rules_user_id_fkey"
		}).onDelete("cascade"),
	unique("user_reminder_rules_user_category_uniq").on(table.userId, table.category),
]);

export const userReminderOccurrences = pgTable("user_reminder_occurrences", {
	id: text().primaryKey().notNull(),
	ruleId: text("rule_id").notNull(),
	occurrenceKey: text("occurrence_key").notNull(),
	plannedAt: timestamp("planned_at", { withTimezone: true, mode: 'string' }).notNull(),
	status: text().default('planned').notNull(),
	queuedAt: timestamp("queued_at", { withTimezone: true, mode: 'string' }),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	failedAt: timestamp("failed_at", { withTimezone: true, mode: 'string' }),
	deliveryChannel: text("delivery_channel"),
	deliveryJobId: text("delivery_job_id"),
	errorCode: text("error_code"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("user_reminder_occurrences_due_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.plannedAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.ruleId],
			foreignColumns: [userReminderRules.id],
			name: "user_reminder_occurrences_rule_id_fkey"
		}).onDelete("cascade"),
	unique("user_reminder_occurrences_occurrence_key_key").on(table.occurrenceKey),
]);

export const projectionOutbox = pgTable("projection_outbox", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	eventType: text("event_type").notNull(),
	idempotencyKey: text("idempotency_key").notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	payload: jsonb().default({}).notNull(),
	status: text().default('pending').notNull(),
	attemptsDone: integer("attempts_done").default(0).notNull(),
	maxAttempts: integer("max_attempts").default(5).notNull(),
	nextTryAt: timestamp("next_try_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_projection_outbox_due").using("btree", table.status.asc().nullsLast().op("text_ops"), table.nextTryAt.asc().nullsLast().op("text_ops")).where(sql`(status = 'pending'::text)`),
	uniqueIndex("idx_projection_outbox_idempotency_key").using("btree", table.idempotencyKey.asc().nullsLast().op("text_ops")),
]);

export const userReminderDeliveryLogs = pgTable("user_reminder_delivery_logs", {
	id: text().primaryKey().notNull(),
	occurrenceId: text("occurrence_id").notNull(),
	channel: text().notNull(),
	status: text().notNull(),
	errorCode: text("error_code"),
	payloadJson: jsonb("payload_json").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("user_reminder_delivery_logs_occurrence_idx").using("btree", table.occurrenceId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.occurrenceId],
			foreignColumns: [userReminderOccurrences.id],
			name: "user_reminder_delivery_logs_occurrence_id_fkey"
		}).onDelete("cascade"),
]);

export const contentAccessGrants = pgTable("content_access_grants", {
	id: text().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	contentId: text("content_id").notNull(),
	purpose: text().notNull(),
	tokenHash: text("token_hash"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	metaJson: jsonb("meta_json").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("content_access_grants_user_expires_idx").using("btree", table.userId.asc().nullsLast().op("int8_ops"), table.expiresAt.desc().nullsFirst().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "content_access_grants_user_id_fkey"
		}).onDelete("cascade"),
]);

export const mailings = pgTable("mailings", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	topicId: bigint("topic_id", { mode: "number" }).notNull(),
	title: text().notNull(),
	status: text().default('scheduled').notNull(),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: 'string' }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.topicId],
			foreignColumns: [mailingTopics.id],
			name: "mailings_topic_id_fkey"
		}).onDelete("cascade"),
]);

export const mailingTopics = pgTable("mailing_topics", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	code: text().notNull(),
	title: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	key: text().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	unique("subscriptions_code_key").on(table.code),
]);

export const telegramUsers = pgTable("telegram_users", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
	username: text(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	phone: text(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	state: text(),
	notifySpb: boolean("notify_spb").default(false).notNull(),
	notifyMsk: boolean("notify_msk").default(false).notNull(),
	notifyOnline: boolean("notify_online").default(false).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lastUpdateId: bigint("last_update_id", { mode: "number" }),
	lastStartAt: timestamp("last_start_at", { withTimezone: true, mode: 'string' }),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	index("telegram_users_last_start_at_idx").using("btree", table.lastStartAt.asc().nullsLast().op("timestamptz_ops")),
	index("telegram_users_last_update_id_idx").using("btree", table.lastUpdateId.asc().nullsLast().op("int8_ops")),
	unique("telegram_users_chat_id_key").on(table.telegramId),
]);

export const rubitimeEvents = pgTable("rubitime_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	rubitimeRecordId: text("rubitime_record_id"),
	event: text().notNull(),
	payloadJson: jsonb("payload_json").notNull(),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const rubitimeRecords = pgTable("rubitime_records", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	rubitimeRecordId: text("rubitime_record_id").notNull(),
	phoneNormalized: text("phone_normalized"),
	recordAt: timestamp("record_at", { withTimezone: true, mode: 'string' }),
	status: text().notNull(),
	payloadJson: jsonb("payload_json").notNull(),
	lastEvent: text("last_event").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	gcalEventId: text("gcal_event_id"),
}, (table) => [
	index("idx_rubitime_records_phone_normalized").using("btree", table.phoneNormalized.asc().nullsLast().op("text_ops")),
	index("idx_rubitime_records_record_at").using("btree", table.recordAt.asc().nullsLast().op("timestamptz_ops")),
	unique("rubitime_records_rubitime_record_id_key").on(table.rubitimeRecordId),
	check("rubitime_records_status_check", sql`status = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text])`),
]);

export const telegramState = pgTable("telegram_state", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	identityId: bigint("identity_id", { mode: "number" }).primaryKey().notNull(),
	username: text(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	state: text(),
	notifySpb: boolean("notify_spb").default(false).notNull(),
	notifyMsk: boolean("notify_msk").default(false).notNull(),
	notifyOnline: boolean("notify_online").default(false).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lastUpdateId: bigint("last_update_id", { mode: "number" }),
	lastStartAt: timestamp("last_start_at", { withTimezone: true, mode: 'string' }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	notifyBookings: boolean("notify_bookings").default(false).notNull(),
}, (table) => [
	index("telegram_state_last_start_at_idx").using("btree", table.lastStartAt.asc().nullsLast().op("timestamptz_ops")),
	index("telegram_state_last_update_id_idx").using("btree", table.lastUpdateId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.identityId],
			foreignColumns: [identities.id],
			name: "telegram_state_identity_id_fkey"
		}).onDelete("cascade"),
]);

export const rubitimeBranches = pgTable("rubitime_branches", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	rubitimeBranchId: integer("rubitime_branch_id").notNull(),
	cityCode: text("city_code").notNull(),
	title: text().notNull(),
	address: text().default('').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	timezone: text().default('Europe/Moscow').notNull(),
}, (table) => [
	unique("rubitime_branches_rubitime_branch_id_key").on(table.rubitimeBranchId),
]);

export const rubitimeCreateRetryJobs = pgTable("rubitime_create_retry_jobs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	phoneNormalized: text("phone_normalized"),
	messageText: text("message_text"),
	nextTryAt: timestamp("next_try_at", { withTimezone: true, mode: 'string' }).notNull(),
	attemptsDone: integer("attempts_done").default(0).notNull(),
	maxAttempts: integer("max_attempts").default(2).notNull(),
	status: text().default('pending').notNull(),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	kind: text().default('message.deliver').notNull(),
	payloadJson: jsonb("payload_json"),
}, (table) => [
	index("idx_rubitime_create_retry_jobs_due").using("btree", table.status.asc().nullsLast().op("text_ops"), table.nextTryAt.asc().nullsLast().op("text_ops")),
]);

export const bookingCalendarMap = pgTable("booking_calendar_map", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	rubitimeRecordId: text("rubitime_record_id").notNull(),
	gcalEventId: text("gcal_event_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_booking_calendar_map_gcal_event_id").using("btree", table.gcalEventId.asc().nullsLast().op("text_ops")),
	unique("booking_calendar_map_rubitime_record_id_key").on(table.rubitimeRecordId),
]);

export const rubitimeBookingProfiles = pgTable("rubitime_booking_profiles", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	bookingType: text("booking_type").notNull(),
	categoryCode: text("category_code").notNull(),
	cityCode: text("city_code"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	branchId: bigint("branch_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	serviceId: bigint("service_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	cooperatorId: bigint("cooperator_id", { mode: "number" }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_rbp_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	uniqueIndex("idx_rbp_type_category_city").using("btree", sql`booking_type`, sql`category_code`, sql`COALESCE(city_code, ''::text)`),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [rubitimeBranches.id],
			name: "rubitime_booking_profiles_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.cooperatorId],
			foreignColumns: [rubitimeCooperators.id],
			name: "rubitime_booking_profiles_cooperator_id_fkey"
		}),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [rubitimeServices.id],
			name: "rubitime_booking_profiles_service_id_fkey"
		}),
	check("rubitime_booking_profiles_booking_type_check", sql`booking_type = ANY (ARRAY['online'::text, 'in_person'::text])`),
]);

export const rubitimeServices = pgTable("rubitime_services", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	rubitimeServiceId: integer("rubitime_service_id").notNull(),
	title: text().notNull(),
	categoryCode: text("category_code").notNull(),
	durationMinutes: integer("duration_minutes").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("rubitime_services_rubitime_service_id_key").on(table.rubitimeServiceId),
	check("rubitime_services_duration_minutes_check", sql`duration_minutes > 0`),
]);

export const rubitimeCooperators = pgTable("rubitime_cooperators", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	rubitimeCooperatorId: integer("rubitime_cooperator_id").notNull(),
	title: text().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("rubitime_cooperators_rubitime_cooperator_id_key").on(table.rubitimeCooperatorId),
]);

export const integrationDataQualityIncidents = pgTable("integration_data_quality_incidents", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	integration: text().notNull(),
	entity: text().notNull(),
	externalId: text("external_id").notNull(),
	field: text().notNull(),
	rawValue: text("raw_value"),
	timezoneUsed: text("timezone_used"),
	errorReason: text("error_reason").notNull(),
	status: text().default('open').notNull(),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	occurrences: integer().default(1).notNull(),
}, (table) => [
	index("idx_integration_data_quality_incidents_last_seen").using("btree", table.lastSeenAt.desc().nullsFirst().op("timestamptz_ops")),
	unique("integration_data_quality_incidents_dedup").on(table.integration, table.entity, table.externalId, table.field, table.errorReason),
	check("integration_data_quality_incidents_error_reason_check", sql`error_reason = ANY (ARRAY['invalid_datetime'::text, 'invalid_timezone'::text, 'unsupported_format'::text, 'invalid_branch_id'::text, 'query_failed'::text, 'missing_or_empty'::text, 'invalid_iana'::text, 'backfill_unresolvable'::text])`),
	check("integration_data_quality_incidents_status_check", sql`status = ANY (ARRAY['open'::text, 'resolved'::text, 'unresolved'::text])`),
]);

export const rubitimeApiThrottle = pgTable("rubitime_api_throttle", {
	id: smallint().primaryKey().notNull(),
	lastCompletedAt: timestamp("last_completed_at", { withTimezone: true, mode: 'string' }).default('1970-01-01 01:00:00+01').notNull(),
}, (table) => [
	check("rubitime_api_throttle_id_check", sql`id = 1`),
]);

export const emailSendCooldowns = pgTable("email_send_cooldowns", {
	userId: uuid("user_id").notNull(),
	emailNormalized: text("email_normalized").notNull(),
	lastSentAt: timestamp("last_sent_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "email_send_cooldowns_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.emailNormalized], name: "email_send_cooldowns_pkey"}),
]);

export const userNotificationTopics = pgTable("user_notification_topics", {
	userId: uuid("user_id").notNull(),
	topicCode: text("topic_code").notNull(),
	isEnabled: boolean("is_enabled").default(false).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_notification_topics_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [platformUsers.id],
			name: "user_notification_topics_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.topicCode], name: "user_notification_topics_pkey"}),
]);

export const newsItemViews = pgTable("news_item_views", {
	newsId: uuid("news_id").notNull(),
	userId: text("user_id").notNull(),
	viewedAt: timestamp("viewed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	platformUserId: uuid("platform_user_id").notNull(),
}, (table) => [
	index("idx_news_item_views_news_id").using("btree", table.newsId.asc().nullsLast().op("uuid_ops")),
	index("idx_news_item_views_platform_user_id").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")).where(sql`(platform_user_id IS NOT NULL)`),
	uniqueIndex("uq_news_item_views_news_platform_user").using("btree", table.newsId.asc().nullsLast().op("uuid_ops"), table.platformUserId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.newsId],
			foreignColumns: [newsItems.id],
			name: "news_item_views_news_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.platformUserId],
			foreignColumns: [platformUsers.id],
			name: "news_item_views_platform_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.newsId, table.userId], name: "news_item_views_pkey"}),
]);

export const userSubscriptions = pgTable("user_subscriptions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	topicId: bigint("topic_id", { mode: "number" }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.topicId],
			foreignColumns: [mailingTopics.id],
			name: "user_subscriptions_subscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_subscriptions_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.topicId], name: "user_subscriptions_pkey"}),
]);

export const systemSettings = pgTable("system_settings", {
	key: text().notNull(),
	scope: text().default('global').notNull(),
	valueJson: jsonb("value_json").default({}).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedBy: uuid("updated_by"),
}, (table) => [
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [platformUsers.id],
			name: "system_settings_updated_by_fkey"
		}),
	primaryKey({ columns: [table.key, table.scope], name: "system_settings_pkey"}),
	check("system_settings_scope_check", sql`scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])`),
]);

export const mailingLogs = pgTable("mailing_logs", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	mailingId: bigint("mailing_id", { mode: "number" }).notNull(),
	status: text().notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	error: text(),
}, (table) => [
	foreignKey({
			columns: [table.mailingId],
			foreignColumns: [mailings.id],
			name: "mailing_logs_mailing_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "mailing_logs_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.mailingId], name: "mailing_logs_pkey"}),
]);
