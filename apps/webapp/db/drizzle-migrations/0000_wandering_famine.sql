-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "phone_challenges" (
	"challenge_id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"code" text,
	"channel_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verify_attempts" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_conversation_id" text NOT NULL,
	"platform_user_id" uuid,
	"integrator_user_id" bigint,
	"source" text NOT NULL,
	"admin_scope" text NOT NULL,
	"status" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"channel_code" text,
	"channel_external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_conversations_integrator_conversation_id_key" UNIQUE("integrator_conversation_id")
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_normalized" text,
	"display_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'client' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"integrator_user_id" bigint,
	"first_name" text,
	"last_name" text,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_at" timestamp with time zone,
	"blocked_reason" text,
	"blocked_by" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"merged_into_id" uuid,
	"patient_phone_trust_at" timestamp with time zone,
	CONSTRAINT "platform_users_phone_normalized_key" UNIQUE("phone_normalized"),
	CONSTRAINT "platform_users_integrator_user_id_key" UNIQUE("integrator_user_id"),
	CONSTRAINT "platform_users_no_self_merge" CHECK ((merged_into_id IS NULL) OR (merged_into_id <> id)),
	CONSTRAINT "platform_users_role_check" CHECK (role = ANY (ARRAY['client'::text, 'doctor'::text, 'admin'::text]))
);
--> statement-breakpoint
CREATE TABLE "message_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	"channel_bindings_used" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"error_message" text,
	"platform_user_id" uuid,
	CONSTRAINT "message_log_outcome_check" CHECK (outcome = ANY (ARRAY['sent'::text, 'partial'::text, 'failed'::text]))
);
--> statement-breakpoint
CREATE TABLE "user_channel_bindings" (
	"user_id" uuid NOT NULL,
	"channel_code" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_channel_bindings_channel_code_external_id_key" UNIQUE("channel_code","external_id"),
	CONSTRAINT "user_channel_bindings_channel_code_check" CHECK (channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text]))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"status" smallint NOT NULL,
	"response_body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"category" text NOT NULL,
	"audience_filter" text NOT NULL,
	"message_title" text NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"preview_only" boolean DEFAULT false NOT NULL,
	"audience_size" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_question_id" text NOT NULL,
	"conversation_id" uuid,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_questions_integrator_question_id_key" UNIQUE("integrator_question_id")
);
--> statement-breakpoint
CREATE TABLE "support_question_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_question_message_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"sender_role" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "support_question_messages_integrator_question_message_id_key" UNIQUE("integrator_question_message_id")
);
--> statement-breakpoint
CREATE TABLE "support_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_message_id" uuid,
	"integrator_intent_event_id" text,
	"correlation_id" text,
	"channel_code" text NOT NULL,
	"status" text NOT NULL,
	"attempt" integer NOT NULL,
	"reason" text,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_delivery_log_id" text NOT NULL,
	"integrator_occurrence_id" text NOT NULL,
	"integrator_rule_id" text NOT NULL,
	"integrator_user_id" bigint NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_delivery_events_integrator_delivery_log_id_key" UNIQUE("integrator_delivery_log_id")
);
--> statement-breakpoint
CREATE TABLE "symptom_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tracking_id" uuid NOT NULL,
	"value_0_10" smallint NOT NULL,
	"entry_type" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"platform_user_id" uuid NOT NULL,
	CONSTRAINT "symptom_entries_entry_type_check" CHECK (entry_type = ANY (ARRAY['instant'::text, 'daily'::text])),
	CONSTRAINT "symptom_entries_source_check" CHECK (source = ANY (ARRAY['bot'::text, 'webapp'::text, 'import'::text])),
	CONSTRAINT "symptom_entries_value_0_10_check" CHECK ((value_0_10 >= 0) AND (value_0_10 <= 10))
);
--> statement-breakpoint
CREATE TABLE "webapp_schema_migrations" (
	"filename" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_access_grants_webapp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_grant_id" text NOT NULL,
	"platform_user_id" uuid,
	"integrator_user_id" bigint NOT NULL,
	"content_id" text NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_access_grants_webapp_integrator_grant_id_key" UNIQUE("integrator_grant_id")
);
--> statement-breakpoint
CREATE TABLE "appointment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_record_id" text NOT NULL,
	"phone_normalized" text,
	"record_at" timestamp with time zone,
	"status" text NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_event" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"branch_id" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "appointment_records_integrator_record_id_key" UNIQUE("integrator_record_id"),
	CONSTRAINT "appointment_records_status_check" CHECK (status = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text]))
);
--> statement-breakpoint
CREATE TABLE "mailing_topics_webapp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_topic_id" bigint NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mailing_topics_webapp_integrator_topic_id_key" UNIQUE("integrator_topic_id")
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions_webapp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_user_id" bigint NOT NULL,
	"integrator_topic_id" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_subscriptions_webapp_integrator_user_id_integrator_top_key" UNIQUE("integrator_user_id","integrator_topic_id")
);
--> statement-breakpoint
CREATE TABLE "mailing_logs_webapp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_user_id" bigint NOT NULL,
	"integrator_mailing_id" bigint NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mailing_logs_webapp_integrator_user_id_integrator_mailing_i_key" UNIQUE("integrator_user_id","integrator_mailing_id")
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_branch_id" bigint NOT NULL,
	"name" text,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	CONSTRAINT "branches_integrator_branch_id_key" UNIQUE("integrator_branch_id")
);
--> statement-breakpoint
CREATE TABLE "content_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"video_url" text,
	"video_type" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"requires_auth" boolean DEFAULT false NOT NULL,
	CONSTRAINT "content_pages_section_slug_key" UNIQUE("section","slug")
);
--> statement-breakpoint
CREATE TABLE "phone_otp_locks" (
	"phone_normalized" text PRIMARY KEY NOT NULL,
	"locked_until" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_pins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"pin_hash" text NOT NULL,
	"attempts_failed" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_link_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_code" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_link_secrets_channel_code_check" CHECK (channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text]))
);
--> statement-breakpoint
CREATE TABLE "user_channel_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"channel_code" text NOT NULL,
	"is_enabled_for_messages" boolean DEFAULT true NOT NULL,
	"is_enabled_for_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_preferred_for_auth" boolean DEFAULT false NOT NULL,
	"platform_user_id" uuid NOT NULL,
	CONSTRAINT "user_channel_preferences_user_id_channel_code_key" UNIQUE("user_id","channel_code"),
	CONSTRAINT "user_channel_preferences_channel_code_check" CHECK (channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text, 'sms'::text, 'email'::text]))
);
--> statement-breakpoint
CREATE TABLE "user_oauth_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_oauth_bindings_provider_provider_user_id_key" UNIQUE("provider","provider_user_id"),
	CONSTRAINT "user_oauth_bindings_provider_check" CHECK (provider = ANY (ARRAY['google'::text, 'apple'::text, 'yandex'::text]))
);
--> statement-breakpoint
CREATE TABLE "lfk_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"complex_id" uuid NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_minutes" smallint,
	"difficulty_0_10" smallint,
	"pain_0_10" smallint,
	"comment" text,
	"recorded_at" timestamp with time zone,
	CONSTRAINT "lfk_sessions_difficulty_0_10_check" CHECK ((difficulty_0_10 IS NULL) OR ((difficulty_0_10 >= 0) AND (difficulty_0_10 <= 10))),
	CONSTRAINT "lfk_sessions_pain_0_10_check" CHECK ((pain_0_10 IS NULL) OR ((pain_0_10 >= 0) AND (pain_0_10 <= 10))),
	CONSTRAINT "lfk_sessions_source_check" CHECK (source = ANY (ARRAY['bot'::text, 'webapp'::text]))
);
--> statement-breakpoint
CREATE TABLE "support_conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_message_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_role" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"external_chat_id" text,
	"external_message_id" text,
	"delivery_status" text,
	"created_at" timestamp with time zone NOT NULL,
	"media_url" text,
	"media_type" text,
	"read_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "support_conversation_messages_integrator_message_id_key" UNIQUE("integrator_message_id")
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_issued_at" timestamp with time zone,
	CONSTRAINT "login_tokens_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "login_tokens_method_check" CHECK (method = ANY (ARRAY['telegram'::text, 'max'::text])),
	CONSTRAINT "login_tokens_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'expired'::text]))
);
--> statement-breakpoint
CREATE TABLE "reference_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"is_user_extensible" boolean DEFAULT false NOT NULL,
	"owner_id" uuid,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_categories_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "reference_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reference_items_category_id_code_key" UNIQUE("category_id","code")
);
--> statement-breakpoint
CREATE TABLE "doctor_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptom_trackings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"symptom_key" text,
	"symptom_title" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symptom_type_ref_id" uuid,
	"region_ref_id" uuid,
	"side" text,
	"diagnosis_text" text,
	"diagnosis_ref_id" uuid,
	"stage_ref_id" uuid,
	"deleted_at" timestamp with time zone,
	"platform_user_id" uuid NOT NULL,
	CONSTRAINT "symptom_trackings_side_check" CHECK ((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text])))
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"is_visible" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"views_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_items_views_count_check" CHECK (views_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "lfk_complexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symptom_tracking_id" uuid,
	"region_ref_id" uuid,
	"side" text,
	"diagnosis_text" text,
	"diagnosis_ref_id" uuid,
	"platform_user_id" uuid NOT NULL,
	CONSTRAINT "lfk_complexes_origin_check" CHECK (origin = ANY (ARRAY['manual'::text, 'assigned_by_specialist'::text])),
	CONSTRAINT "lfk_complexes_side_check" CHECK ((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text])))
);
--> statement-breakpoint
CREATE TABLE "motivational_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"body_text" text NOT NULL,
	"author" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lfk_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"region_ref_id" uuid,
	"load_type" text,
	"difficulty_1_10" integer,
	"contraindications" text,
	"tags" text[],
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lfk_exercises_difficulty_1_10_check" CHECK ((difficulty_1_10 IS NULL) OR ((difficulty_1_10 >= 1) AND (difficulty_1_10 <= 10))),
	CONSTRAINT "lfk_exercises_load_type_check" CHECK (load_type = ANY (ARRAY['strength'::text, 'stretch'::text, 'balance'::text, 'cardio'::text, 'other'::text]))
);
--> statement-breakpoint
CREATE TABLE "lfk_complex_template_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"reps" integer,
	"sets" integer,
	"side" text,
	"max_pain_0_10" integer,
	"comment" text,
	CONSTRAINT "lfk_complex_template_exercises_template_id_exercise_id_key" UNIQUE("template_id","exercise_id"),
	CONSTRAINT "lfk_complex_template_exercises_max_pain_0_10_check" CHECK ((max_pain_0_10 IS NULL) OR ((max_pain_0_10 >= 0) AND (max_pain_0_10 <= 10))),
	CONSTRAINT "lfk_complex_template_exercises_side_check" CHECK ((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text])))
);
--> statement-breakpoint
CREATE TABLE "lfk_exercise_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"media_url" text NOT NULL,
	"media_type" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lfk_exercise_media_media_type_check" CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'gif'::text]))
);
--> statement-breakpoint
CREATE TABLE "lfk_complex_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lfk_complex_templates_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))
);
--> statement-breakpoint
CREATE TABLE "patient_lfk_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"complex_id" uuid,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lfk_complex_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complex_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"reps" integer,
	"sets" integer,
	"side" text,
	"max_pain_0_10" integer,
	"comment" text,
	CONSTRAINT "lfk_complex_exercises_complex_id_exercise_id_key" UNIQUE("complex_id","exercise_id"),
	CONSTRAINT "lfk_complex_exercises_max_pain_0_10_check" CHECK ((max_pain_0_10 IS NULL) OR ((max_pain_0_10 >= 0) AND (max_pain_0_10 <= 10))),
	CONSTRAINT "lfk_complex_exercises_side_check" CHECK ((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text])))
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limit_events" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_name" text NOT NULL,
	"stored_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"s3_key" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"delete_attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"display_name" text,
	"folder_id" uuid,
	"preview_status" text DEFAULT 'pending' NOT NULL,
	"preview_sm_key" text,
	"preview_md_key" text,
	"preview_attempts" integer DEFAULT 0 NOT NULL,
	"preview_next_attempt_at" timestamp with time zone,
	"source_width" integer,
	"source_height" integer,
	CONSTRAINT "media_files_preview_status_check" CHECK (preview_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text, 'skipped'::text])),
	CONSTRAINT "media_files_size_bytes_check" CHECK ((size_bytes >= 0) AND (size_bytes <= '3221225472'::bigint)),
	CONSTRAINT "media_files_status_check" CHECK (status = ANY (ARRAY['ready'::text, 'pending'::text, 'deleting'::text, 'pending_delete'::text]))
);
--> statement-breakpoint
CREATE TABLE "booking_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"title" text NOT NULL,
	"address" text,
	"rubitime_branch_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_cities_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "content_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requires_auth" boolean DEFAULT false NOT NULL,
	CONSTRAINT "content_sections_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "booking_specialists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"description" text,
	"rubitime_cooperator_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_branch_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"specialist_id" uuid NOT NULL,
	"rubitime_service_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_booking_branch_services" UNIQUE("branch_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "booking_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price_minor" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_booking_services_title_duration" UNIQUE("title","duration_minutes")
);
--> statement-breakpoint
CREATE TABLE "online_intake_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "online_intake_requests_status_check" CHECK (status = ANY (ARRAY['new'::text, 'in_review'::text, 'contacted'::text, 'closed'::text])),
	CONSTRAINT "online_intake_requests_type_check" CHECK (type = ANY (ARRAY['lfk'::text, 'nutrition'::text]))
);
--> statement-breakpoint
CREATE TABLE "patient_bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_user_id" uuid,
	"booking_type" text NOT NULL,
	"city" text,
	"category" text NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"slot_end" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"rubitime_id" text,
	"gcal_event_id" text,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"contact_name" text NOT NULL,
	"reminder_24h_sent" boolean DEFAULT false NOT NULL,
	"reminder_2h_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"branch_id" uuid,
	"service_id" uuid,
	"branch_service_id" uuid,
	"city_code_snapshot" text,
	"branch_title_snapshot" text,
	"service_title_snapshot" text,
	"duration_minutes_snapshot" integer,
	"price_minor_snapshot" integer,
	"rubitime_branch_id_snapshot" text,
	"rubitime_cooperator_id_snapshot" text,
	"rubitime_service_id_snapshot" text,
	"source" text DEFAULT 'native' NOT NULL,
	"compat_quality" text,
	"provenance_created_by" text,
	"provenance_updated_by" text,
	"rubitime_manage_url" text,
	CONSTRAINT "patient_bookings_rubitime_id_key" UNIQUE("rubitime_id"),
	CONSTRAINT "patient_bookings_booking_type_check" CHECK (booking_type = ANY (ARRAY['in_person'::text, 'online'::text])),
	CONSTRAINT "patient_bookings_category_check" CHECK (category = ANY (ARRAY['rehab_lfk'::text, 'nutrition'::text, 'general'::text])),
	CONSTRAINT "patient_bookings_check" CHECK (slot_end > slot_start),
	CONSTRAINT "patient_bookings_compat_quality_check" CHECK (compat_quality = ANY (ARRAY['full'::text, 'partial'::text, 'minimal'::text])),
	CONSTRAINT "patient_bookings_platform_user_native_required" CHECK ((source <> 'native'::text) OR (platform_user_id IS NOT NULL)),
	CONSTRAINT "patient_bookings_source_check" CHECK (source = ANY (ARRAY['native'::text, 'rubitime_projection'::text])),
	CONSTRAINT "patient_bookings_status_check" CHECK (status = ANY (ARRAY['creating'::text, 'confirmed'::text, 'cancelling'::text, 'cancel_failed'::text, 'cancelled'::text, 'rescheduled'::text, 'completed'::text, 'no_show'::text, 'failed_sync'::text]))
);
--> statement-breakpoint
CREATE TABLE "online_intake_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "online_intake_answers_request_id_question_id_key" UNIQUE("request_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "online_intake_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"attachment_type" text NOT NULL,
	"s3_key" text,
	"url" text,
	"mime_type" text,
	"size_bytes" bigint,
	"original_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "online_intake_attachments_attachment_type_check" CHECK (attachment_type = ANY (ARRAY['file'::text, 'url'::text])),
	CONSTRAINT "online_intake_attachments_check" CHECK (((attachment_type = 'file'::text) AND (s3_key IS NOT NULL)) OR ((attachment_type = 'url'::text) AND (url IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "online_intake_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" uuid,
	"note" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_occurrence_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_occurrence_id" text NOT NULL,
	"integrator_rule_id" text NOT NULL,
	"integrator_user_id" bigint NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"delivery_channel" text,
	"error_code" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"snoozed_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"skip_reason" text,
	CONSTRAINT "reminder_occurrence_history_integrator_occurrence_id_key" UNIQUE("integrator_occurrence_id"),
	CONSTRAINT "chk_reminder_occurrence_skip_reason_len" CHECK ((skip_reason IS NULL) OR (length(skip_reason) <= 500)),
	CONSTRAINT "chk_reminder_occurrence_snooze_pair" CHECK (((snoozed_at IS NULL) AND (snoozed_until IS NULL)) OR ((snoozed_at IS NOT NULL) AND (snoozed_until IS NOT NULL))),
	CONSTRAINT "reminder_occurrence_history_status_check" CHECK (status = ANY (ARRAY['sent'::text, 'failed'::text]))
);
--> statement-breakpoint
CREATE TABLE "reminder_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrator_rule_id" text NOT NULL,
	"platform_user_id" uuid,
	"integrator_user_id" bigint NOT NULL,
	"category" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"schedule_type" text DEFAULT 'interval_window' NOT NULL,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"interval_minutes" integer NOT NULL,
	"window_start_minute" integer NOT NULL,
	"window_end_minute" integer NOT NULL,
	"days_mask" text DEFAULT '1111111' NOT NULL,
	"content_mode" text DEFAULT 'none' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_object_type" text,
	"linked_object_id" text,
	"custom_title" text,
	"custom_text" text,
	CONSTRAINT "reminder_rules_integrator_rule_id_key" UNIQUE("integrator_rule_id"),
	CONSTRAINT "chk_reminder_rules_custom_only_for_custom_type" CHECK ((linked_object_type = 'custom'::text) OR ((custom_title IS NULL) AND (custom_text IS NULL))),
	CONSTRAINT "chk_reminder_rules_custom_required" CHECK ((linked_object_type IS DISTINCT FROM 'custom'::text) OR ((custom_title IS NOT NULL) AND (btrim(custom_title) <> ''::text))),
	CONSTRAINT "chk_reminder_rules_linked_object_type" CHECK ((linked_object_type IS NULL) OR (linked_object_type = ANY (ARRAY['lfk_complex'::text, 'content_section'::text, 'content_page'::text, 'custom'::text]))),
	CONSTRAINT "chk_reminder_rules_object_id_required" CHECK ((linked_object_type IS NULL) OR (linked_object_type = 'custom'::text) OR ((linked_object_id IS NOT NULL) AND (btrim(linked_object_id) <> ''::text)))
);
--> statement-breakpoint
CREATE TABLE "reminder_journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"occurrence_id" text,
	"action" text NOT NULL,
	"snooze_until" timestamp with time zone,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_journal_action_check" CHECK (action = ANY (ARRAY['done'::text, 'skipped'::text, 'snoozed'::text])),
	CONSTRAINT "reminder_journal_check" CHECK (((action = 'snoozed'::text) AND (snooze_until IS NOT NULL)) OR ((action <> 'snoozed'::text) AND (snooze_until IS NULL))),
	CONSTRAINT "reminder_journal_skip_reason_check" CHECK ((skip_reason IS NULL) OR (length(skip_reason) <= 500))
);
--> statement-breakpoint
CREATE TABLE "integrator_push_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts_done" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_try_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrator_push_outbox_idempotency_key_key" UNIQUE("idempotency_key"),
	CONSTRAINT "integrator_push_outbox_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'dead'::text]))
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_id" text,
	"conflict_key" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"repeat_count" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_log_status_check" CHECK (status = ANY (ARRAY['ok'::text, 'partial_failure'::text, 'error'::text]))
);
--> statement-breakpoint
CREATE TABLE "media_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"name_normalized" text GENERATED ALWAYS AS (lower(TRIM(BOTH FROM name))) STORED,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_folders_check" CHECK ((parent_id IS NULL) OR (parent_id <> id)),
	CONSTRAINT "media_folders_name_check" CHECK ((length(TRIM(BOTH FROM name)) > 0) AND (char_length(name) <= 180))
);
--> statement-breakpoint
CREATE TABLE "media_upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"s3_key" text NOT NULL,
	"upload_id" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" text DEFAULT 'initiated' NOT NULL,
	"expected_size_bytes" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"part_size_bytes" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"aborted_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_upload_sessions_expected_size_bytes_check" CHECK (expected_size_bytes > 0),
	CONSTRAINT "media_upload_sessions_part_size_bytes_check" CHECK ((part_size_bytes >= 1) AND (part_size_bytes <= 536870912)),
	CONSTRAINT "media_upload_sessions_status_check" CHECK (status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text, 'completed'::text, 'aborted'::text, 'expired'::text, 'failed'::text]))
);
--> statement-breakpoint
CREATE TABLE "schema_migrations" (
	"version" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_attempt_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"intent_type" text,
	"intent_event_id" text,
	"correlation_id" text,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"attempt" integer NOT NULL,
	"reason" text,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_attempt_logs_attempt_check" CHECK (attempt > 0),
	CONSTRAINT "delivery_attempt_logs_status_check" CHECK (status = ANY (ARRAY['success'::text, 'failed'::text]))
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"resource" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_resource_external_id_key" UNIQUE("resource","external_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"type" text NOT NULL,
	"value_normalized" text NOT NULL,
	"label" text,
	"is_primary" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_type_value_normalized_key" UNIQUE("type","value_normalized")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"merged_into_user_id" bigint,
	CONSTRAINT "users_merged_into_user_id_not_self_check" CHECK ((merged_into_user_id IS NULL) OR (merged_into_user_id <> id))
);
--> statement-breakpoint
CREATE TABLE "message_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_id" bigint NOT NULL,
	"source" text NOT NULL,
	"external_chat_id" text,
	"external_message_id" text,
	"draft_text_current" text NOT NULL,
	"state" text DEFAULT 'pending_confirmation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_drafts_state_check" CHECK (state = 'pending_confirmation'::text)
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"user_identity_id" bigint NOT NULL,
	"admin_scope" text NOT NULL,
	"status" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	CONSTRAINT "conversations_status_check" CHECK (status = ANY (ARRAY['open'::text, 'waiting_admin'::text, 'waiting_user'::text, 'closed'::text]))
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_role" text NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"external_chat_id" text,
	"external_message_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_messages_sender_role_check" CHECK (sender_role = ANY (ARRAY['user'::text, 'admin'::text, 'system'::text]))
);
--> statement-breakpoint
CREATE TABLE "user_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_identity_id" bigint NOT NULL,
	"conversation_id" text,
	"telegram_message_id" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "question_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"sender_type" text NOT NULL,
	"message_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_reminder_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"category" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"schedule_type" text DEFAULT 'interval_window' NOT NULL,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"interval_minutes" integer NOT NULL,
	"window_start_minute" integer NOT NULL,
	"window_end_minute" integer NOT NULL,
	"days_mask" text DEFAULT '1111111' NOT NULL,
	"content_mode" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_reminder_rules_user_category_uniq" UNIQUE("user_id","category")
);
--> statement-breakpoint
CREATE TABLE "user_reminder_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"occurrence_key" text NOT NULL,
	"planned_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"queued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"delivery_channel" text,
	"delivery_job_id" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_reminder_occurrences_occurrence_key_key" UNIQUE("occurrence_key")
);
--> statement-breakpoint
CREATE TABLE "projection_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts_done" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_try_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_reminder_delivery_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"occurrence_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_access_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"content_id" text NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"topic_id" bigint NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailing_topics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "subscriptions_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "telegram_users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phone" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	"state" text,
	"notify_spb" boolean DEFAULT false NOT NULL,
	"notify_msk" boolean DEFAULT false NOT NULL,
	"notify_online" boolean DEFAULT false NOT NULL,
	"last_update_id" bigint,
	"last_start_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "telegram_users_chat_id_key" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "rubitime_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rubitime_record_id" text,
	"event" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubitime_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rubitime_record_id" text NOT NULL,
	"phone_normalized" text,
	"record_at" timestamp with time zone,
	"status" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"last_event" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gcal_event_id" text,
	CONSTRAINT "rubitime_records_rubitime_record_id_key" UNIQUE("rubitime_record_id"),
	CONSTRAINT "rubitime_records_status_check" CHECK (status = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text]))
);
--> statement-breakpoint
CREATE TABLE "telegram_state" (
	"identity_id" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"state" text,
	"notify_spb" boolean DEFAULT false NOT NULL,
	"notify_msk" boolean DEFAULT false NOT NULL,
	"notify_online" boolean DEFAULT false NOT NULL,
	"last_update_id" bigint,
	"last_start_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notify_bookings" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubitime_branches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rubitime_branch_id" integer NOT NULL,
	"city_code" text NOT NULL,
	"title" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	CONSTRAINT "rubitime_branches_rubitime_branch_id_key" UNIQUE("rubitime_branch_id")
);
--> statement-breakpoint
CREATE TABLE "rubitime_create_retry_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"phone_normalized" text,
	"message_text" text,
	"next_try_at" timestamp with time zone NOT NULL,
	"attempts_done" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text DEFAULT 'message.deliver' NOT NULL,
	"payload_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "booking_calendar_map" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rubitime_record_id" text NOT NULL,
	"gcal_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_calendar_map_rubitime_record_id_key" UNIQUE("rubitime_record_id")
);
--> statement-breakpoint
CREATE TABLE "rubitime_booking_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_type" text NOT NULL,
	"category_code" text NOT NULL,
	"city_code" text,
	"branch_id" bigint NOT NULL,
	"service_id" bigint NOT NULL,
	"cooperator_id" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubitime_booking_profiles_booking_type_check" CHECK (booking_type = ANY (ARRAY['online'::text, 'in_person'::text]))
);
--> statement-breakpoint
CREATE TABLE "rubitime_services" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rubitime_service_id" integer NOT NULL,
	"title" text NOT NULL,
	"category_code" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubitime_services_rubitime_service_id_key" UNIQUE("rubitime_service_id"),
	CONSTRAINT "rubitime_services_duration_minutes_check" CHECK (duration_minutes > 0)
);
--> statement-breakpoint
CREATE TABLE "rubitime_cooperators" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rubitime_cooperator_id" integer NOT NULL,
	"title" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubitime_cooperators_rubitime_cooperator_id_key" UNIQUE("rubitime_cooperator_id")
);
--> statement-breakpoint
CREATE TABLE "integration_data_quality_incidents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"integration" text NOT NULL,
	"entity" text NOT NULL,
	"external_id" text NOT NULL,
	"field" text NOT NULL,
	"raw_value" text,
	"timezone_used" text,
	"error_reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "integration_data_quality_incidents_dedup" UNIQUE("integration","entity","external_id","field","error_reason"),
	CONSTRAINT "integration_data_quality_incidents_error_reason_check" CHECK (error_reason = ANY (ARRAY['invalid_datetime'::text, 'invalid_timezone'::text, 'unsupported_format'::text, 'invalid_branch_id'::text, 'query_failed'::text, 'missing_or_empty'::text, 'invalid_iana'::text, 'backfill_unresolvable'::text])),
	CONSTRAINT "integration_data_quality_incidents_status_check" CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text, 'unresolved'::text]))
);
--> statement-breakpoint
CREATE TABLE "rubitime_api_throttle" (
	"id" smallint PRIMARY KEY NOT NULL,
	"last_completed_at" timestamp with time zone DEFAULT '1970-01-01 01:00:00+01' NOT NULL,
	CONSTRAINT "rubitime_api_throttle_id_check" CHECK (id = 1)
);
--> statement-breakpoint
CREATE TABLE "email_send_cooldowns" (
	"user_id" uuid NOT NULL,
	"email_normalized" text NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "email_send_cooldowns_pkey" PRIMARY KEY("user_id","email_normalized")
);
--> statement-breakpoint
CREATE TABLE "user_notification_topics" (
	"user_id" uuid NOT NULL,
	"topic_code" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_notification_topics_pkey" PRIMARY KEY("user_id","topic_code")
);
--> statement-breakpoint
CREATE TABLE "news_item_views" (
	"news_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"platform_user_id" uuid NOT NULL,
	CONSTRAINT "news_item_views_pkey" PRIMARY KEY("news_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"user_id" bigint NOT NULL,
	"topic_id" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY("user_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"value_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "system_settings_pkey" PRIMARY KEY("key","scope"),
	CONSTRAINT "system_settings_scope_check" CHECK (scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text]))
);
--> statement-breakpoint
CREATE TABLE "mailing_logs" (
	"user_id" bigint NOT NULL,
	"mailing_id" bigint NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "mailing_logs_pkey" PRIMARY KEY("user_id","mailing_id")
);
--> statement-breakpoint
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_users" ADD CONSTRAINT "platform_users_blocked_by_fkey" FOREIGN KEY ("blocked_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_users" ADD CONSTRAINT "platform_users_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_channel_bindings" ADD CONSTRAINT "user_channel_bindings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_questions" ADD CONSTRAINT "support_questions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_question_messages" ADD CONSTRAINT "support_question_messages_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."support_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_delivery_events" ADD CONSTRAINT "support_delivery_events_conversation_message_id_fkey" FOREIGN KEY ("conversation_message_id") REFERENCES "public"."support_conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_entries" ADD CONSTRAINT "symptom_entries_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_entries" ADD CONSTRAINT "symptom_entries_tracking_id_fkey" FOREIGN KEY ("tracking_id") REFERENCES "public"."symptom_trackings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_access_grants_webapp" ADD CONSTRAINT "content_access_grants_webapp_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_records" ADD CONSTRAINT "appointment_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_challenges" ADD CONSTRAINT "email_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pins" ADD CONSTRAINT "user_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_link_secrets" ADD CONSTRAINT "channel_link_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_channel_preferences" ADD CONSTRAINT "user_channel_preferences_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_bindings" ADD CONSTRAINT "user_oauth_bindings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_sessions" ADD CONSTRAINT "lfk_sessions_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "public"."lfk_complexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_sessions" ADD CONSTRAINT "lfk_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_conversation_messages" ADD CONSTRAINT "support_conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_items" ADD CONSTRAINT "reference_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."reference_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_notes" ADD CONSTRAINT "doctor_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_notes" ADD CONSTRAINT "doctor_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_trackings" ADD CONSTRAINT "symptom_trackings_diagnosis_ref_id_fkey" FOREIGN KEY ("diagnosis_ref_id") REFERENCES "public"."reference_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_trackings" ADD CONSTRAINT "symptom_trackings_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_trackings" ADD CONSTRAINT "symptom_trackings_region_ref_id_fkey" FOREIGN KEY ("region_ref_id") REFERENCES "public"."reference_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_trackings" ADD CONSTRAINT "symptom_trackings_stage_ref_id_fkey" FOREIGN KEY ("stage_ref_id") REFERENCES "public"."reference_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_trackings" ADD CONSTRAINT "symptom_trackings_symptom_type_ref_id_fkey" FOREIGN KEY ("symptom_type_ref_id") REFERENCES "public"."reference_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_complexes" ADD CONSTRAINT "lfk_complexes_diagnosis_ref_id_fkey" FOREIGN KEY ("diagnosis_ref_id") REFERENCES "public"."reference_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_complexes" ADD CONSTRAINT "lfk_complexes_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_complexes" ADD CONSTRAINT "lfk_complexes_region_ref_id_fkey" FOREIGN KEY ("region_ref_id") REFERENCES "public"."reference_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_complexes" ADD CONSTRAINT "lfk_complexes_symptom_tracking_id_fkey" FOREIGN KEY ("symptom_tracking_id") REFERENCES "public"."symptom_trackings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_exercises" ADD CONSTRAINT "lfk_exercises_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_exercises" ADD CONSTRAINT "lfk_exercises_region_ref_id_fkey" FOREIGN KEY ("region_ref_id") REFERENCES "public"."reference_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_complex_template_exercises" ADD CONSTRAINT "lfk_complex_template_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."lfk_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_complex_template_exercises" ADD CONSTRAINT "lfk_complex_template_exercises_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."lfk_complex_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_exercise_media" ADD CONSTRAINT "lfk_exercise_media_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."lfk_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_complex_templates" ADD CONSTRAINT "lfk_complex_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_lfk_assignments" ADD CONSTRAINT "patient_lfk_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_lfk_assignments" ADD CONSTRAINT "patient_lfk_assignments_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "public"."lfk_complexes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_lfk_assignments" ADD CONSTRAINT "patient_lfk_assignments_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_lfk_assignments" ADD CONSTRAINT "patient_lfk_assignments_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."lfk_complex_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_complex_exercises" ADD CONSTRAINT "lfk_complex_exercises_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "public"."lfk_complexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfk_complex_exercises" ADD CONSTRAINT "lfk_complex_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."lfk_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_branches" ADD CONSTRAINT "booking_branches_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."booking_cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_specialists" ADD CONSTRAINT "booking_specialists_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."booking_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_branch_services" ADD CONSTRAINT "booking_branch_services_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."booking_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_branch_services" ADD CONSTRAINT "booking_branch_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_branch_services" ADD CONSTRAINT "booking_branch_services_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."booking_specialists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_intake_requests" ADD CONSTRAINT "online_intake_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_bookings" ADD CONSTRAINT "patient_bookings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."booking_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_bookings" ADD CONSTRAINT "patient_bookings_branch_service_id_fkey" FOREIGN KEY ("branch_service_id") REFERENCES "public"."booking_branch_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_bookings" ADD CONSTRAINT "patient_bookings_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_bookings" ADD CONSTRAINT "patient_bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_intake_answers" ADD CONSTRAINT "online_intake_answers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."online_intake_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_intake_attachments" ADD CONSTRAINT "online_intake_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."online_intake_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_intake_status_history" ADD CONSTRAINT "online_intake_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_intake_status_history" ADD CONSTRAINT "online_intake_status_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."online_intake_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_journal" ADD CONSTRAINT "reminder_journal_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."reminder_occurrence_history"("integrator_occurrence_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_journal" ADD CONSTRAINT "reminder_journal_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."reminder_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."media_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merged_into_user_id_fkey" FOREIGN KEY ("merged_into_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_identity_id_fkey" FOREIGN KEY ("user_identity_id") REFERENCES "public"."identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_questions" ADD CONSTRAINT "user_questions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_questions" ADD CONSTRAINT "user_questions_user_identity_id_fkey" FOREIGN KEY ("user_identity_id") REFERENCES "public"."identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_messages" ADD CONSTRAINT "question_messages_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."user_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reminder_rules" ADD CONSTRAINT "user_reminder_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reminder_occurrences" ADD CONSTRAINT "user_reminder_occurrences_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."user_reminder_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reminder_delivery_logs" ADD CONSTRAINT "user_reminder_delivery_logs_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."user_reminder_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_access_grants" ADD CONSTRAINT "content_access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailings" ADD CONSTRAINT "mailings_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."mailing_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_state" ADD CONSTRAINT "telegram_state_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubitime_booking_profiles" ADD CONSTRAINT "rubitime_booking_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."rubitime_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubitime_booking_profiles" ADD CONSTRAINT "rubitime_booking_profiles_cooperator_id_fkey" FOREIGN KEY ("cooperator_id") REFERENCES "public"."rubitime_cooperators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubitime_booking_profiles" ADD CONSTRAINT "rubitime_booking_profiles_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."rubitime_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_cooldowns" ADD CONSTRAINT "email_send_cooldowns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_topics" ADD CONSTRAINT "user_notification_topics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_item_views" ADD CONSTRAINT "news_item_views_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "public"."news_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_item_views" ADD CONSTRAINT "news_item_views_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_subscription_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."mailing_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailing_logs" ADD CONSTRAINT "mailing_logs_mailing_id_fkey" FOREIGN KEY ("mailing_id") REFERENCES "public"."mailings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailing_logs" ADD CONSTRAINT "mailing_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_phone_challenges_expires_at" ON "phone_challenges" USING btree ("expires_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_phone_challenges_phone" ON "phone_challenges" USING btree ("phone" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_support_conversations_integrator_id" ON "support_conversations" USING btree ("integrator_conversation_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_support_conversations_integrator_user_id" ON "support_conversations" USING btree ("integrator_user_id" int8_ops) WHERE (integrator_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_support_conversations_last_message" ON "support_conversations" USING btree ("last_message_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_support_conversations_platform_user_id" ON "support_conversations" USING btree ("platform_user_id" uuid_ops) WHERE (platform_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_platform_users_integrator_uid" ON "platform_users" USING btree ("integrator_user_id" int8_ops) WHERE (integrator_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_platform_users_merged_into" ON "platform_users" USING btree ("merged_into_id" uuid_ops) WHERE (merged_into_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_platform_users_phone" ON "platform_users" USING btree ("phone_normalized" text_ops) WHERE (phone_normalized IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_message_log_platform_user_id" ON "message_log" USING btree ("platform_user_id" uuid_ops) WHERE (platform_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_message_log_sent_at" ON "message_log" USING btree ("sent_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_message_log_user_id" ON "message_log" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_channel_bindings_lookup" ON "user_channel_bindings" USING btree ("channel_code" text_ops,"external_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_channel_bindings_user_id" ON "user_channel_bindings" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_idempotency_keys_expires_at" ON "idempotency_keys" USING btree ("expires_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_broadcast_audit_executed_at" ON "broadcast_audit" USING btree ("executed_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_support_questions_conversation_id" ON "support_questions" USING btree ("conversation_id" uuid_ops) WHERE (conversation_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_support_questions_created" ON "support_questions" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_support_questions_integrator_id" ON "support_questions" USING btree ("integrator_question_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_support_question_messages_integrator_id" ON "support_question_messages" USING btree ("integrator_question_message_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_support_question_messages_question_created" ON "support_question_messages" USING btree ("question_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_support_delivery_events_channel_occurred" ON "support_delivery_events" USING btree ("channel_code" timestamptz_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_support_delivery_events_conversation_message" ON "support_delivery_events" USING btree ("conversation_message_id" uuid_ops) WHERE (conversation_message_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_support_delivery_events_correlation" ON "support_delivery_events" USING btree ("correlation_id" text_ops) WHERE (correlation_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_support_delivery_events_integrator_intent_uniq" ON "support_delivery_events" USING btree ("integrator_intent_event_id" text_ops) WHERE (integrator_intent_event_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_support_delivery_events_intent_event" ON "support_delivery_events" USING btree ("integrator_intent_event_id" text_ops) WHERE (integrator_intent_event_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_reminder_delivery_events_created_at" ON "reminder_delivery_events" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reminder_delivery_events_integrator_log_id" ON "reminder_delivery_events" USING btree ("integrator_delivery_log_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_reminder_delivery_events_integrator_user_id" ON "reminder_delivery_events" USING btree ("integrator_user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_symptom_entries_platform_user_id" ON "symptom_entries" USING btree ("platform_user_id" uuid_ops) WHERE (platform_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_symptom_entries_tracking_recorded" ON "symptom_entries" USING btree ("tracking_id" timestamptz_ops,"recorded_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_symptom_entries_user_type_recorded" ON "symptom_entries" USING btree ("user_id" timestamptz_ops,"entry_type" text_ops,"recorded_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_content_access_grants_webapp_expires_at" ON "content_access_grants_webapp" USING btree ("expires_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_content_access_grants_webapp_integrator_grant_id" ON "content_access_grants_webapp" USING btree ("integrator_grant_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_content_access_grants_webapp_integrator_user_id" ON "content_access_grants_webapp" USING btree ("integrator_user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_appointment_records_branch_id" ON "appointment_records" USING btree ("branch_id" uuid_ops) WHERE (branch_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_appointment_records_integrator_record_id" ON "appointment_records" USING btree ("integrator_record_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_appointment_records_phone_normalized" ON "appointment_records" USING btree ("phone_normalized" text_ops) WHERE (phone_normalized IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_appointment_records_phone_not_deleted" ON "appointment_records" USING btree ("phone_normalized" timestamptz_ops,"record_at" timestamptz_ops) WHERE ((deleted_at IS NULL) AND (phone_normalized IS NOT NULL));--> statement-breakpoint
CREATE INDEX "idx_appointment_records_record_at" ON "appointment_records" USING btree ("record_at" timestamptz_ops) WHERE (record_at IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_appointment_records_status" ON "appointment_records" USING btree ("status" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mailing_topics_webapp_integrator_id" ON "mailing_topics_webapp" USING btree ("integrator_topic_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_mailing_topics_webapp_key" ON "mailing_topics_webapp" USING btree ("key" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_subscriptions_webapp_topic" ON "user_subscriptions_webapp" USING btree ("integrator_topic_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_user_subscriptions_webapp_user" ON "user_subscriptions_webapp" USING btree ("integrator_user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_mailing_logs_webapp_mailing" ON "mailing_logs_webapp" USING btree ("integrator_mailing_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_mailing_logs_webapp_user" ON "mailing_logs_webapp" USING btree ("integrator_user_id" int8_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_branches_integrator_branch_id" ON "branches" USING btree ("integrator_branch_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_content_pages_section" ON "content_pages" USING btree ("section" text_ops);--> statement-breakpoint
CREATE INDEX "idx_content_pages_section_sort" ON "content_pages" USING btree ("section" text_ops,"sort_order" text_ops);--> statement-breakpoint
CREATE INDEX "idx_content_pages_slug" ON "content_pages" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_email_challenges_expires_at" ON "email_challenges" USING btree ("expires_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_email_challenges_user_id" ON "email_challenges" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_channel_link_secrets_expires" ON "channel_link_secrets" USING btree ("expires_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_channel_link_secrets_user_channel" ON "channel_link_secrets" USING btree ("user_id" text_ops,"channel_code" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_channel_preferences_one_auth_pref" ON "user_channel_preferences" USING btree ("user_id" text_ops) WHERE (is_preferred_for_auth = true);--> statement-breakpoint
CREATE INDEX "idx_user_channel_preferences_platform_user_id" ON "user_channel_preferences" USING btree ("platform_user_id" uuid_ops) WHERE (platform_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_user_channel_preferences_user_id" ON "user_channel_preferences" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_channel_preferences_platform_user_channel" ON "user_channel_preferences" USING btree ("platform_user_id" uuid_ops,"channel_code" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_oauth_user" ON "user_oauth_bindings" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_lfk_sessions_complex_completed" ON "lfk_sessions" USING btree ("complex_id" timestamptz_ops,"completed_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_lfk_sessions_user_completed" ON "lfk_sessions" USING btree ("user_id" uuid_ops,"completed_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_support_conv_msg_conv_created" ON "support_conversation_messages" USING btree ("conversation_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_support_conv_msg_unread_incoming" ON "support_conversation_messages" USING btree ("conversation_id" uuid_ops) WHERE ((read_at IS NULL) AND (sender_role <> 'user'::text));--> statement-breakpoint
CREATE INDEX "idx_support_conv_msg_unread_user_msgs" ON "support_conversation_messages" USING btree ("conversation_id" uuid_ops) WHERE ((read_at IS NULL) AND (sender_role = 'user'::text));--> statement-breakpoint
CREATE INDEX "idx_support_conversation_messages_conversation_created" ON "support_conversation_messages" USING btree ("conversation_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_support_conversation_messages_integrator_id" ON "support_conversation_messages" USING btree ("integrator_message_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_login_tokens_status" ON "login_tokens" USING btree ("status" text_ops,"expires_at" text_ops) WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE INDEX "idx_ref_items_category" ON "reference_items" USING btree ("category_id" int4_ops,"sort_order" uuid_ops);--> statement-breakpoint
CREATE INDEX "reference_items_category_deleted_active_sort_idx" ON "reference_items" USING btree ("category_id" timestamptz_ops,"deleted_at" uuid_ops,"is_active" uuid_ops,"sort_order" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_doctor_notes_user_created" ON "doctor_notes" USING btree ("user_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_symptom_trackings_deleted" ON "symptom_trackings" USING btree ("user_id" text_ops) WHERE (deleted_at IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_symptom_trackings_platform_user_id" ON "symptom_trackings" USING btree ("platform_user_id" uuid_ops) WHERE (platform_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_symptom_trackings_user_active" ON "symptom_trackings" USING btree ("user_id" bool_ops,"is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_news_items_visible" ON "news_items" USING btree ("is_visible" bool_ops,"sort_order" int4_ops,"published_at" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_lfk_complexes_platform_user_id" ON "lfk_complexes" USING btree ("platform_user_id" uuid_ops) WHERE (platform_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_lfk_complexes_user_active" ON "lfk_complexes" USING btree ("user_id" text_ops,"is_active" text_ops);--> statement-breakpoint
CREATE INDEX "idx_motivational_quotes_active" ON "motivational_quotes" USING btree ("is_active" int4_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_lfk_exercises_archived" ON "lfk_exercises" USING btree ("is_archived" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_lfk_exercises_region" ON "lfk_exercises" USING btree ("region_ref_id" uuid_ops) WHERE (NOT is_archived);--> statement-breakpoint
CREATE INDEX "idx_template_exercises_order" ON "lfk_complex_template_exercises" USING btree ("template_id" int4_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_lfk_exercise_media_exercise" ON "lfk_exercise_media" USING btree ("exercise_id" int4_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_assignments_patient" ON "patient_lfk_assignments" USING btree ("patient_user_id" uuid_ops,"is_active" bool_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_patient_lfk_assign_active_template" ON "patient_lfk_assignments" USING btree ("patient_user_id" uuid_ops,"template_id" uuid_ops) WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_lfk_complex_exercises_complex" ON "lfk_complex_exercises" USING btree ("complex_id" int4_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_auth_rate_limit_events_scope_key_time" ON "auth_rate_limit_events" USING btree ("scope" text_ops,"key" text_ops,"occurred_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_media_files_created_at" ON "media_files" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_media_files_folder_created" ON "media_files" USING btree ("folder_id" uuid_ops,"created_at" timestamptz_ops) WHERE (folder_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_media_files_preview_status" ON "media_files" USING btree ("preview_status" text_ops) WHERE (preview_status = 'pending'::text);--> statement-breakpoint
CREATE INDEX "idx_media_files_purge_queue" ON "media_files" USING btree ("next_attempt_at" timestamptz_ops) WHERE (status = ANY (ARRAY['pending_delete'::text, 'deleting'::text]));--> statement-breakpoint
CREATE INDEX "idx_media_files_uploaded_by" ON "media_files" USING btree ("uploaded_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_branches_city_id" ON "booking_branches" USING btree ("city_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_branches_is_active" ON "booking_branches" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_booking_branches_rubitime_id" ON "booking_branches" USING btree ("rubitime_branch_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_cities_is_active" ON "booking_cities" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_content_sections_sort" ON "content_sections" USING btree ("sort_order" int4_ops,"title" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_specialists_branch_id" ON "booking_specialists" USING btree ("branch_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_specialists_is_active" ON "booking_specialists" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_booking_specialists_rubitime_id" ON "booking_specialists" USING btree ("rubitime_cooperator_id" text_ops,"branch_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_branch_services_branch_id" ON "booking_branch_services" USING btree ("branch_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_branch_services_is_active" ON "booking_branch_services" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_branch_services_service_id" ON "booking_branch_services" USING btree ("service_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_services_is_active" ON "booking_services" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_online_intake_requests_created_at" ON "online_intake_requests" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_online_intake_requests_status" ON "online_intake_requests" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_online_intake_requests_type" ON "online_intake_requests" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_online_intake_requests_user_id" ON "online_intake_requests" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_patient_bookings_branch_id" ON "patient_bookings" USING btree ("branch_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_patient_bookings_branch_service_id" ON "patient_bookings" USING btree ("branch_service_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_patient_bookings_rubitime_id" ON "patient_bookings" USING btree ("rubitime_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_patient_bookings_service_id" ON "patient_bookings" USING btree ("service_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_patient_bookings_slot_start" ON "patient_bookings" USING btree ("slot_start" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_patient_bookings_source" ON "patient_bookings" USING btree ("source" text_ops);--> statement-breakpoint
CREATE INDEX "idx_patient_bookings_status" ON "patient_bookings" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_patient_bookings_user_id" ON "patient_bookings" USING btree ("platform_user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_online_intake_answers_request_id" ON "online_intake_answers" USING btree ("request_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_online_intake_attachments_request_id" ON "online_intake_attachments" USING btree ("request_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_online_intake_status_history_changed_at" ON "online_intake_status_history" USING btree ("changed_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_online_intake_status_history_request_id" ON "online_intake_status_history" USING btree ("request_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reminder_occurrence_history_integrator_occ_id" ON "reminder_occurrence_history" USING btree ("integrator_occurrence_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_reminder_occurrence_history_integrator_user_id" ON "reminder_occurrence_history" USING btree ("integrator_user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_reminder_occurrence_history_occurred_at" ON "reminder_occurrence_history" USING btree ("occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_reminder_occurrence_history_seen_at" ON "reminder_occurrence_history" USING btree ("seen_at" timestamptz_ops) WHERE (seen_at IS NULL);--> statement-breakpoint
CREATE INDEX "idx_reminder_occurrence_history_skipped_at" ON "reminder_occurrence_history" USING btree ("skipped_at" timestamptz_ops) WHERE (skipped_at IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_reminder_occurrence_history_snoozed_until" ON "reminder_occurrence_history" USING btree ("snoozed_until" timestamptz_ops) WHERE (snoozed_until IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reminder_rules_integrator_rule_id" ON "reminder_rules" USING btree ("integrator_rule_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_reminder_rules_integrator_user_id" ON "reminder_rules" USING btree ("integrator_user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_reminder_rules_integrator_user_updated_at" ON "reminder_rules" USING btree ("integrator_user_id" timestamptz_ops,"updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_reminder_rules_linked_object" ON "reminder_rules" USING btree ("linked_object_type" text_ops,"linked_object_id" text_ops) WHERE ((linked_object_type IS NOT NULL) AND (linked_object_id IS NOT NULL));--> statement-breakpoint
CREATE INDEX "idx_reminder_rules_linked_object_type" ON "reminder_rules" USING btree ("linked_object_type" text_ops) WHERE (linked_object_type IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_reminder_rules_platform_user_id" ON "reminder_rules" USING btree ("platform_user_id" uuid_ops) WHERE (platform_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_reminder_rules_platform_user_updated_at" ON "reminder_rules" USING btree ("platform_user_id" timestamptz_ops,"updated_at" uuid_ops) WHERE (platform_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_reminder_journal_action_created_at" ON "reminder_journal" USING btree ("action" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_reminder_journal_occurrence_id" ON "reminder_journal" USING btree ("occurrence_id" text_ops,"created_at" timestamptz_ops) WHERE (occurrence_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_reminder_journal_rule_created_at" ON "reminder_journal" USING btree ("rule_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reminder_journal_once_done_per_occurrence" ON "reminder_journal" USING btree ("occurrence_id" text_ops,"action" text_ops) WHERE ((occurrence_id IS NOT NULL) AND (action = 'done'::text));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reminder_journal_once_skipped_per_occurrence" ON "reminder_journal" USING btree ("occurrence_id" text_ops,"action" text_ops) WHERE ((occurrence_id IS NOT NULL) AND (action = 'skipped'::text));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reminder_journal_snooze_dedupe" ON "reminder_journal" USING btree ("occurrence_id" timestamptz_ops,"action" text_ops,"snooze_until" timestamptz_ops) WHERE ((occurrence_id IS NOT NULL) AND (action = 'snoozed'::text) AND (snooze_until IS NOT NULL));--> statement-breakpoint
CREATE INDEX "idx_integrator_push_outbox_due" ON "integrator_push_outbox" USING btree ("status" text_ops,"next_try_at" text_ops) WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE INDEX "idx_admin_audit_log_action" ON "admin_audit_log" USING btree ("action" text_ops);--> statement-breakpoint
CREATE INDEX "idx_admin_audit_log_conflict_key" ON "admin_audit_log" USING btree ("conflict_key" text_ops) WHERE (conflict_key IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_admin_audit_log_conflict_open" ON "admin_audit_log" USING btree ("conflict_key" text_ops) WHERE ((conflict_key IS NOT NULL) AND (resolved_at IS NULL));--> statement-breakpoint
CREATE INDEX "idx_admin_audit_log_created" ON "admin_audit_log" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_admin_audit_log_target" ON "admin_audit_log" USING btree ("target_id" text_ops) WHERE (target_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_media_folders_parent_id" ON "media_folders" USING btree ("parent_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_media_folders_child_name" ON "media_folders" USING btree ("parent_id" uuid_ops,"name_normalized" text_ops) WHERE (parent_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_media_folders_root_name" ON "media_folders" USING btree ("name_normalized" text_ops) WHERE (parent_id IS NULL);--> statement-breakpoint
CREATE INDEX "idx_media_upload_sessions_expires" ON "media_upload_sessions" USING btree ("expires_at" timestamptz_ops) WHERE (status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text]));--> statement-breakpoint
CREATE INDEX "idx_media_upload_sessions_owner" ON "media_upload_sessions" USING btree ("owner_user_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_media_upload_sessions_one_active_per_media" ON "media_upload_sessions" USING btree ("media_id" uuid_ops) WHERE (status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text]));--> statement-breakpoint
CREATE INDEX "idx_delivery_attempt_logs_channel_occurred" ON "delivery_attempt_logs" USING btree ("channel" text_ops,"occurred_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_delivery_attempt_logs_correlation" ON "delivery_attempt_logs" USING btree ("correlation_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_delivery_attempt_logs_event" ON "delivery_attempt_logs" USING btree ("intent_event_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_identities_user_id" ON "identities" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_contacts_user_id" ON "contacts" USING btree ("user_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_users_merged_into_user_id" ON "users" USING btree ("merged_into_user_id" int8_ops) WHERE (merged_into_user_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "message_drafts_identity_source_uidx" ON "message_drafts" USING btree ("identity_id" int8_ops,"source" text_ops);--> statement-breakpoint
CREATE INDEX "message_drafts_source_updated_idx" ON "message_drafts" USING btree ("source" text_ops,"updated_at" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_open_user_source_uidx" ON "conversations" USING btree ("user_identity_id" int8_ops,"source" text_ops) WHERE ((closed_at IS NULL) AND (status <> 'closed'::text));--> statement-breakpoint
CREATE INDEX "conversations_status_last_message_idx" ON "conversations" USING btree ("status" text_ops,"last_message_at" text_ops);--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_created_idx" ON "conversation_messages" USING btree ("conversation_id" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "user_questions_answered_created_idx" ON "user_questions" USING btree ("answered" timestamptz_ops,"created_at" timestamptz_ops) WHERE (answered = false);--> statement-breakpoint
CREATE INDEX "user_questions_conversation_id_idx" ON "user_questions" USING btree ("conversation_id" text_ops) WHERE (conversation_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "question_messages_question_created_idx" ON "question_messages" USING btree ("question_id" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "user_reminder_rules_enabled_idx" ON "user_reminder_rules" USING btree ("is_enabled" text_ops,"category" bool_ops);--> statement-breakpoint
CREATE INDEX "user_reminder_occurrences_due_idx" ON "user_reminder_occurrences" USING btree ("status" text_ops,"planned_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_projection_outbox_due" ON "projection_outbox" USING btree ("status" text_ops,"next_try_at" text_ops) WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_projection_outbox_idempotency_key" ON "projection_outbox" USING btree ("idempotency_key" text_ops);--> statement-breakpoint
CREATE INDEX "user_reminder_delivery_logs_occurrence_idx" ON "user_reminder_delivery_logs" USING btree ("occurrence_id" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "content_access_grants_user_expires_idx" ON "content_access_grants" USING btree ("user_id" int8_ops,"expires_at" int8_ops);--> statement-breakpoint
CREATE INDEX "telegram_users_last_start_at_idx" ON "telegram_users" USING btree ("last_start_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "telegram_users_last_update_id_idx" ON "telegram_users" USING btree ("last_update_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_rubitime_records_phone_normalized" ON "rubitime_records" USING btree ("phone_normalized" text_ops);--> statement-breakpoint
CREATE INDEX "idx_rubitime_records_record_at" ON "rubitime_records" USING btree ("record_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "telegram_state_last_start_at_idx" ON "telegram_state" USING btree ("last_start_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "telegram_state_last_update_id_idx" ON "telegram_state" USING btree ("last_update_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_rubitime_create_retry_jobs_due" ON "rubitime_create_retry_jobs" USING btree ("status" text_ops,"next_try_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_calendar_map_gcal_event_id" ON "booking_calendar_map" USING btree ("gcal_event_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_rbp_is_active" ON "rubitime_booking_profiles" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_rbp_type_category_city" ON "rubitime_booking_profiles" USING btree (booking_type text_ops,category_code text_ops,COALESCE(city_code, ''::text) text_ops);--> statement-breakpoint
CREATE INDEX "idx_integration_data_quality_incidents_last_seen" ON "integration_data_quality_incidents" USING btree ("last_seen_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_user_notification_topics_user" ON "user_notification_topics" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_news_item_views_news_id" ON "news_item_views" USING btree ("news_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_news_item_views_platform_user_id" ON "news_item_views" USING btree ("platform_user_id" uuid_ops) WHERE (platform_user_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_news_item_views_news_platform_user" ON "news_item_views" USING btree ("news_id" uuid_ops,"platform_user_id" uuid_ops);
*/