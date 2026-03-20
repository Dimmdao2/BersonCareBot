--
-- PostgreSQL database dump
--

\restrict CoP6XJg2dmRS9sHbp9pNzxSccs6GhKlGYjEgOn4fHC1YRByz8kw6AeyANlLDO1q

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: broadcast_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id text NOT NULL,
    category text NOT NULL,
    audience_filter text NOT NULL,
    message_title text NOT NULL,
    executed_at timestamp with time zone DEFAULT now() NOT NULL,
    preview_only boolean DEFAULT false NOT NULL,
    audience_size integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL
);


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    key text NOT NULL,
    request_hash text NOT NULL,
    status smallint NOT NULL,
    response_body jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: lfk_complexes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_complexes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    origin text DEFAULT 'manual'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lfk_complexes_origin_check CHECK ((origin = ANY (ARRAY['manual'::text, 'assigned_by_specialist'::text])))
);


--
-- Name: lfk_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    complex_id uuid NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lfk_sessions_source_check CHECK ((source = ANY (ARRAY['bot'::text, 'webapp'::text])))
);


--
-- Name: message_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    sender_id text NOT NULL,
    text text NOT NULL,
    category text NOT NULL,
    channel_bindings_used jsonb DEFAULT '{}'::jsonb NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    outcome text NOT NULL,
    error_message text,
    CONSTRAINT message_log_outcome_check CHECK ((outcome = ANY (ARRAY['sent'::text, 'partial'::text, 'failed'::text])))
);


--
-- Name: phone_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_challenges (
    challenge_id text NOT NULL,
    phone text NOT NULL,
    expires_at bigint NOT NULL,
    code text,
    channel_context jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_normalized text,
    display_name text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'client'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    integrator_user_id bigint,
    CONSTRAINT platform_users_role_check CHECK ((role = ANY (ARRAY['client'::text, 'doctor'::text, 'admin'::text])))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: symptom_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.symptom_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    tracking_id uuid NOT NULL,
    value_0_10 smallint NOT NULL,
    entry_type text NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    source text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT symptom_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['instant'::text, 'daily'::text]))),
    CONSTRAINT symptom_entries_source_check CHECK ((source = ANY (ARRAY['bot'::text, 'webapp'::text, 'import'::text]))),
    CONSTRAINT symptom_entries_value_0_10_check CHECK (((value_0_10 >= 0) AND (value_0_10 <= 10)))
);


--
-- Name: symptom_trackings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.symptom_trackings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    symptom_key text,
    symptom_title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_channel_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_channel_bindings (
    user_id uuid NOT NULL,
    channel_code text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_channel_bindings_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text])))
);


--
-- Name: user_channel_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_channel_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    channel_code text NOT NULL,
    is_enabled_for_messages boolean DEFAULT true NOT NULL,
    is_enabled_for_notifications boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_channel_preferences_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text])))
);


--
-- Name: user_notification_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_topics (
    user_id uuid NOT NULL,
    topic_code text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: broadcast_audit broadcast_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit
    ADD CONSTRAINT broadcast_audit_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key);


--
-- Name: lfk_complexes lfk_complexes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_pkey PRIMARY KEY (id);


--
-- Name: lfk_sessions lfk_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_sessions
    ADD CONSTRAINT lfk_sessions_pkey PRIMARY KEY (id);


--
-- Name: message_log message_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_log
    ADD CONSTRAINT message_log_pkey PRIMARY KEY (id);


--
-- Name: phone_challenges phone_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_challenges
    ADD CONSTRAINT phone_challenges_pkey PRIMARY KEY (challenge_id);


--
-- Name: platform_users platform_users_integrator_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_integrator_user_id_key UNIQUE (integrator_user_id);


--
-- Name: platform_users platform_users_phone_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_phone_normalized_key UNIQUE (phone_normalized);


--
-- Name: platform_users platform_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: symptom_entries symptom_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_pkey PRIMARY KEY (id);


--
-- Name: symptom_trackings symptom_trackings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_pkey PRIMARY KEY (id);


--
-- Name: user_channel_bindings user_channel_bindings_channel_code_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_bindings
    ADD CONSTRAINT user_channel_bindings_channel_code_external_id_key UNIQUE (channel_code, external_id);


--
-- Name: user_channel_preferences user_channel_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_preferences
    ADD CONSTRAINT user_channel_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_channel_preferences user_channel_preferences_user_id_channel_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_preferences
    ADD CONSTRAINT user_channel_preferences_user_id_channel_code_key UNIQUE (user_id, channel_code);


--
-- Name: user_notification_topics user_notification_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topics
    ADD CONSTRAINT user_notification_topics_pkey PRIMARY KEY (user_id, topic_code);


--
-- Name: idx_broadcast_audit_executed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcast_audit_executed_at ON public.broadcast_audit USING btree (executed_at DESC);


--
-- Name: idx_idempotency_keys_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_keys_expires_at ON public.idempotency_keys USING btree (expires_at);


--
-- Name: idx_lfk_complexes_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complexes_user_active ON public.lfk_complexes USING btree (user_id, is_active);


--
-- Name: idx_lfk_sessions_complex_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_sessions_complex_completed ON public.lfk_sessions USING btree (complex_id, completed_at DESC);


--
-- Name: idx_lfk_sessions_user_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_sessions_user_completed ON public.lfk_sessions USING btree (user_id, completed_at DESC);


--
-- Name: idx_message_log_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_log_sent_at ON public.message_log USING btree (sent_at DESC);


--
-- Name: idx_message_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_log_user_id ON public.message_log USING btree (user_id);


--
-- Name: idx_phone_challenges_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_challenges_expires_at ON public.phone_challenges USING btree (expires_at);


--
-- Name: idx_platform_users_integrator_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_integrator_uid ON public.platform_users USING btree (integrator_user_id) WHERE (integrator_user_id IS NOT NULL);


--
-- Name: idx_platform_users_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_phone ON public.platform_users USING btree (phone_normalized) WHERE (phone_normalized IS NOT NULL);


--
-- Name: idx_symptom_entries_tracking_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_tracking_recorded ON public.symptom_entries USING btree (tracking_id, recorded_at DESC);


--
-- Name: idx_symptom_entries_user_type_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_user_type_recorded ON public.symptom_entries USING btree (user_id, entry_type, recorded_at DESC);


--
-- Name: idx_symptom_trackings_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_trackings_user_active ON public.symptom_trackings USING btree (user_id, is_active);


--
-- Name: idx_user_channel_bindings_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_bindings_lookup ON public.user_channel_bindings USING btree (channel_code, external_id);


--
-- Name: idx_user_channel_bindings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_bindings_user_id ON public.user_channel_bindings USING btree (user_id);


--
-- Name: idx_user_channel_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_preferences_user_id ON public.user_channel_preferences USING btree (user_id);


--
-- Name: idx_user_notification_topics_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_topics_user ON public.user_notification_topics USING btree (user_id);


--
-- Name: lfk_sessions lfk_sessions_complex_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_sessions
    ADD CONSTRAINT lfk_sessions_complex_id_fkey FOREIGN KEY (complex_id) REFERENCES public.lfk_complexes(id) ON DELETE CASCADE;


--
-- Name: symptom_entries symptom_entries_tracking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_tracking_id_fkey FOREIGN KEY (tracking_id) REFERENCES public.symptom_trackings(id) ON DELETE CASCADE;


--
-- Name: user_channel_bindings user_channel_bindings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_bindings
    ADD CONSTRAINT user_channel_bindings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_notification_topics user_notification_topics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topics
    ADD CONSTRAINT user_notification_topics_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict CoP6XJg2dmRS9sHbp9pNzxSccs6GhKlGYjEgOn4fHC1YRByz8kw6AeyANlLDO1q

