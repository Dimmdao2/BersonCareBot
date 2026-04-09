--
-- PostgreSQL database dump
--

\restrict yTxWxkrJXVSiNdUVEQu70azWcOZV5zCDD6RYhrerlec7SXlVwz0VkPIvc8fh7Xn

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
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    type text NOT NULL,
    value_normalized text NOT NULL,
    label text,
    is_primary boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contacts_id_seq OWNED BY public.contacts.id;


--
-- Name: content_access_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_access_grants (
    id text NOT NULL,
    user_id bigint NOT NULL,
    content_id text NOT NULL,
    purpose text NOT NULL,
    token_hash text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_messages (
    id text NOT NULL,
    conversation_id text NOT NULL,
    sender_role text NOT NULL,
    text text NOT NULL,
    source text NOT NULL,
    external_chat_id text,
    external_message_id text,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT conversation_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['user'::text, 'admin'::text, 'system'::text])))
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id text NOT NULL,
    source text NOT NULL,
    user_identity_id bigint NOT NULL,
    admin_scope text NOT NULL,
    status text NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    last_message_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    close_reason text,
    CONSTRAINT conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'waiting_admin'::text, 'waiting_user'::text, 'closed'::text])))
);


--
-- Name: delivery_attempt_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_attempt_logs (
    id bigint NOT NULL,
    intent_type text,
    intent_event_id text,
    correlation_id text,
    channel text NOT NULL,
    status text NOT NULL,
    attempt integer NOT NULL,
    reason text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_attempt_logs_attempt_check CHECK ((attempt > 0)),
    CONSTRAINT delivery_attempt_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text])))
);


--
-- Name: delivery_attempt_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delivery_attempt_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delivery_attempt_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delivery_attempt_logs_id_seq OWNED BY public.delivery_attempt_logs.id;


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    key text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identities (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    resource text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: identities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.identities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.identities_id_seq OWNED BY public.identities.id;


--
-- Name: mailing_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mailing_logs (
    user_id bigint NOT NULL,
    mailing_id bigint NOT NULL,
    status text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    error text
);


--
-- Name: mailing_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mailing_topics (
    id bigint NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    key text NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mailings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mailings (
    id bigint NOT NULL,
    topic_id bigint NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mailings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mailings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mailings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mailings_id_seq OWNED BY public.mailings.id;


--
-- Name: message_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_drafts (
    id text NOT NULL,
    identity_id bigint NOT NULL,
    source text NOT NULL,
    external_chat_id text,
    external_message_id text,
    draft_text_current text NOT NULL,
    state text DEFAULT 'pending_confirmation'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_drafts_state_check CHECK ((state = 'pending_confirmation'::text))
);


--
-- Name: question_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_messages (
    id text NOT NULL,
    question_id text NOT NULL,
    sender_type text NOT NULL,
    message_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rubitime_create_retry_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubitime_create_retry_jobs (
    id bigint NOT NULL,
    phone_normalized text,
    message_text text,
    next_try_at timestamp with time zone NOT NULL,
    attempts_done integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 2 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'message.deliver'::text NOT NULL,
    payload_json jsonb
);


--
-- Name: rubitime_create_retry_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rubitime_create_retry_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_create_retry_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rubitime_create_retry_jobs_id_seq OWNED BY public.rubitime_create_retry_jobs.id;


--
-- Name: rubitime_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubitime_events (
    id bigint NOT NULL,
    rubitime_record_id text,
    event text NOT NULL,
    payload_json jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rubitime_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rubitime_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rubitime_events_id_seq OWNED BY public.rubitime_events.id;


--
-- Name: rubitime_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubitime_records (
    id bigint NOT NULL,
    rubitime_record_id text NOT NULL,
    phone_normalized text,
    record_at timestamp with time zone,
    status text NOT NULL,
    payload_json jsonb NOT NULL,
    last_event text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rubitime_records_status_check CHECK ((status = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text])))
);


--
-- Name: rubitime_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rubitime_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rubitime_records_id_seq OWNED BY public.rubitime_records.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id bigint NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.mailing_topics.id;


--
-- Name: subscriptions_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscriptions_id_seq1
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscriptions_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscriptions_id_seq1 OWNED BY public.subscriptions.id;


--
-- Name: telegram_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_state (
    identity_id bigint NOT NULL,
    username text,
    first_name text,
    last_name text,
    state text,
    notify_spb boolean DEFAULT false NOT NULL,
    notify_msk boolean DEFAULT false NOT NULL,
    notify_online boolean DEFAULT false NOT NULL,
    last_update_id bigint,
    last_start_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notify_bookings boolean DEFAULT false NOT NULL
);


--
-- Name: telegram_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_users (
    id bigint NOT NULL,
    telegram_id bigint NOT NULL,
    username text,
    first_name text,
    last_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    updated_at timestamp with time zone DEFAULT now(),
    state text,
    notify_spb boolean DEFAULT false NOT NULL,
    notify_msk boolean DEFAULT false NOT NULL,
    notify_online boolean DEFAULT false NOT NULL,
    last_update_id bigint,
    last_start_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: telegram_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telegram_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telegram_users_id_seq OWNED BY public.telegram_users.id;


--
-- Name: user_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_questions (
    id text NOT NULL,
    user_identity_id bigint NOT NULL,
    conversation_id text,
    telegram_message_id text,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answered boolean DEFAULT false NOT NULL,
    answered_at timestamp with time zone
);


--
-- Name: user_reminder_delivery_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reminder_delivery_logs (
    id text NOT NULL,
    occurrence_id text NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    error_code text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_reminder_occurrences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reminder_occurrences (
    id text NOT NULL,
    rule_id text NOT NULL,
    occurrence_key text NOT NULL,
    planned_at timestamp with time zone NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    queued_at timestamp with time zone,
    sent_at timestamp with time zone,
    failed_at timestamp with time zone,
    delivery_channel text,
    delivery_job_id text,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_reminder_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reminder_rules (
    id text NOT NULL,
    user_id bigint NOT NULL,
    category text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    schedule_type text DEFAULT 'interval_window'::text NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL,
    interval_minutes integer NOT NULL,
    window_start_minute integer NOT NULL,
    window_end_minute integer NOT NULL,
    days_mask text DEFAULT '1111111'::text NOT NULL,
    content_mode text DEFAULT 'none'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    user_id bigint NOT NULL,
    topic_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    merged_into_user_id bigint
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts ALTER COLUMN id SET DEFAULT nextval('public.contacts_id_seq'::regclass);


--
-- Name: delivery_attempt_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_attempt_logs ALTER COLUMN id SET DEFAULT nextval('public.delivery_attempt_logs_id_seq'::regclass);


--
-- Name: identities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identities ALTER COLUMN id SET DEFAULT nextval('public.identities_id_seq'::regclass);


--
-- Name: mailing_topics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: mailings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailings ALTER COLUMN id SET DEFAULT nextval('public.mailings_id_seq'::regclass);


--
-- Name: rubitime_create_retry_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_create_retry_jobs ALTER COLUMN id SET DEFAULT nextval('public.rubitime_create_retry_jobs_id_seq'::regclass);


--
-- Name: rubitime_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_events ALTER COLUMN id SET DEFAULT nextval('public.rubitime_events_id_seq'::regclass);


--
-- Name: rubitime_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_records ALTER COLUMN id SET DEFAULT nextval('public.rubitime_records_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq1'::regclass);


--
-- Name: telegram_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_users ALTER COLUMN id SET DEFAULT nextval('public.telegram_users_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_type_value_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_type_value_normalized_key UNIQUE (type, value_normalized);


--
-- Name: content_access_grants content_access_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants
    ADD CONSTRAINT content_access_grants_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: delivery_attempt_logs delivery_attempt_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_attempt_logs
    ADD CONSTRAINT delivery_attempt_logs_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_resource_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identities
    ADD CONSTRAINT identities_resource_external_id_key UNIQUE (resource, external_id);


--
-- Name: mailing_logs mailing_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_logs
    ADD CONSTRAINT mailing_logs_pkey PRIMARY KEY (user_id, mailing_id);


--
-- Name: mailings mailings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailings
    ADD CONSTRAINT mailings_pkey PRIMARY KEY (id);


--
-- Name: message_drafts message_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_drafts
    ADD CONSTRAINT message_drafts_pkey PRIMARY KEY (id);


--
-- Name: question_messages question_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_messages
    ADD CONSTRAINT question_messages_pkey PRIMARY KEY (id);


--
-- Name: rubitime_create_retry_jobs rubitime_create_retry_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_create_retry_jobs
    ADD CONSTRAINT rubitime_create_retry_jobs_pkey PRIMARY KEY (id);


--
-- Name: rubitime_events rubitime_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_events
    ADD CONSTRAINT rubitime_events_pkey PRIMARY KEY (id);


--
-- Name: rubitime_records rubitime_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_records
    ADD CONSTRAINT rubitime_records_pkey PRIMARY KEY (id);


--
-- Name: rubitime_records rubitime_records_rubitime_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_records
    ADD CONSTRAINT rubitime_records_rubitime_record_id_key UNIQUE (rubitime_record_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: mailing_topics subscriptions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics
    ADD CONSTRAINT subscriptions_code_key UNIQUE (code);


--
-- Name: subscriptions subscriptions_code_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_code_key1 UNIQUE (code);


--
-- Name: mailing_topics subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey1 PRIMARY KEY (id);


--
-- Name: telegram_state telegram_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_state
    ADD CONSTRAINT telegram_state_pkey PRIMARY KEY (identity_id);


--
-- Name: telegram_users telegram_users_chat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_users
    ADD CONSTRAINT telegram_users_chat_id_key UNIQUE (telegram_id);


--
-- Name: telegram_users telegram_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_users
    ADD CONSTRAINT telegram_users_pkey PRIMARY KEY (id);


--
-- Name: user_questions user_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_questions
    ADD CONSTRAINT user_questions_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_delivery_logs user_reminder_delivery_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reminder_delivery_logs
    ADD CONSTRAINT user_reminder_delivery_logs_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_occurrences user_reminder_occurrences_occurrence_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_occurrence_key_key UNIQUE (occurrence_key);


--
-- Name: user_reminder_occurrences user_reminder_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_rules user_reminder_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reminder_rules
    ADD CONSTRAINT user_reminder_rules_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_rules user_reminder_rules_user_category_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reminder_rules
    ADD CONSTRAINT user_reminder_rules_user_category_uniq UNIQUE (user_id, category);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (user_id, topic_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_merged_into_user_id_not_self_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_merged_into_user_id_not_self_check CHECK (((merged_into_user_id IS NULL) OR (merged_into_user_id <> id)));


--
-- Name: content_access_grants_user_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_access_grants_user_expires_idx ON public.content_access_grants USING btree (user_id, expires_at DESC);


--
-- Name: conversation_messages_conversation_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_messages_conversation_created_idx ON public.conversation_messages USING btree (conversation_id, created_at);


--
-- Name: conversations_open_user_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversations_open_user_source_uidx ON public.conversations USING btree (user_identity_id, source) WHERE ((closed_at IS NULL) AND (status <> 'closed'::text));


--
-- Name: conversations_status_last_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_status_last_message_idx ON public.conversations USING btree (status, last_message_at DESC);


--
-- Name: idempotency_keys_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idempotency_keys_expires_at_idx ON public.idempotency_keys USING btree (expires_at);


--
-- Name: idx_contacts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_user_id ON public.contacts USING btree (user_id);


--
-- Name: idx_delivery_attempt_logs_channel_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_attempt_logs_channel_occurred ON public.delivery_attempt_logs USING btree (channel, occurred_at DESC);


--
-- Name: idx_delivery_attempt_logs_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_attempt_logs_correlation ON public.delivery_attempt_logs USING btree (correlation_id);


--
-- Name: idx_delivery_attempt_logs_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_attempt_logs_event ON public.delivery_attempt_logs USING btree (intent_event_id);


--
-- Name: idx_identities_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_identities_user_id ON public.identities USING btree (user_id);


--
-- Name: idx_rubitime_create_retry_jobs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubitime_create_retry_jobs_due ON public.rubitime_create_retry_jobs USING btree (status, next_try_at);


--
-- Name: idx_rubitime_records_phone_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubitime_records_phone_normalized ON public.rubitime_records USING btree (phone_normalized);


--
-- Name: idx_rubitime_records_record_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubitime_records_record_at ON public.rubitime_records USING btree (record_at);


--
-- Name: idx_users_merged_into_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_merged_into_user_id ON public.users USING btree (merged_into_user_id) WHERE (merged_into_user_id IS NOT NULL);


--
-- Name: message_drafts_identity_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX message_drafts_identity_source_uidx ON public.message_drafts USING btree (identity_id, source);


--
-- Name: message_drafts_source_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_drafts_source_updated_idx ON public.message_drafts USING btree (source, updated_at DESC);


--
-- Name: question_messages_question_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_messages_question_created_idx ON public.question_messages USING btree (question_id, created_at);


--
-- Name: telegram_state_last_start_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_state_last_start_at_idx ON public.telegram_state USING btree (last_start_at);


--
-- Name: telegram_state_last_update_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_state_last_update_id_idx ON public.telegram_state USING btree (last_update_id);


--
-- Name: telegram_users_last_start_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_users_last_start_at_idx ON public.telegram_users USING btree (last_start_at);


--
-- Name: telegram_users_last_update_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_users_last_update_id_idx ON public.telegram_users USING btree (last_update_id);


--
-- Name: user_questions_answered_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_questions_answered_created_idx ON public.user_questions USING btree (answered, created_at DESC) WHERE (answered = false);


--
-- Name: user_questions_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_questions_conversation_id_idx ON public.user_questions USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: user_reminder_delivery_logs_occurrence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_reminder_delivery_logs_occurrence_idx ON public.user_reminder_delivery_logs USING btree (occurrence_id, created_at DESC);


--
-- Name: user_reminder_occurrences_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_reminder_occurrences_due_idx ON public.user_reminder_occurrences USING btree (status, planned_at);


--
-- Name: user_reminder_rules_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_reminder_rules_enabled_idx ON public.user_reminder_rules USING btree (is_enabled, category);


--
-- Name: contacts contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: content_access_grants content_access_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants
    ADD CONSTRAINT content_access_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_identity_id_fkey FOREIGN KEY (user_identity_id) REFERENCES public.identities(id) ON DELETE CASCADE;


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mailing_logs mailing_logs_mailing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_logs
    ADD CONSTRAINT mailing_logs_mailing_id_fkey FOREIGN KEY (mailing_id) REFERENCES public.mailings(id) ON DELETE CASCADE;


--
-- Name: mailing_logs mailing_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_logs
    ADD CONSTRAINT mailing_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mailings mailings_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailings
    ADD CONSTRAINT mailings_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.mailing_topics(id) ON DELETE CASCADE;


--
-- Name: message_drafts message_drafts_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_drafts
    ADD CONSTRAINT message_drafts_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.identities(id) ON DELETE CASCADE;


--
-- Name: question_messages question_messages_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_messages
    ADD CONSTRAINT question_messages_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.user_questions(id) ON DELETE CASCADE;


--
-- Name: telegram_state telegram_state_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_state
    ADD CONSTRAINT telegram_state_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.identities(id) ON DELETE CASCADE;


--
-- Name: user_questions user_questions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_questions
    ADD CONSTRAINT user_questions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: user_questions user_questions_user_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_questions
    ADD CONSTRAINT user_questions_user_identity_id_fkey FOREIGN KEY (user_identity_id) REFERENCES public.identities(id) ON DELETE CASCADE;


--
-- Name: user_reminder_delivery_logs user_reminder_delivery_logs_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reminder_delivery_logs
    ADD CONSTRAINT user_reminder_delivery_logs_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.user_reminder_occurrences(id) ON DELETE CASCADE;


--
-- Name: user_reminder_occurrences user_reminder_occurrences_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.user_reminder_rules(id) ON DELETE CASCADE;


--
-- Name: user_reminder_rules user_reminder_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reminder_rules
    ADD CONSTRAINT user_reminder_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_subscription_id_fkey FOREIGN KEY (topic_id) REFERENCES public.mailing_topics(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_merged_into_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_merged_into_user_id_fkey FOREIGN KEY (merged_into_user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict yTxWxkrJXVSiNdUVEQu70azWcOZV5zCDD6RYhrerlec7SXlVwz0VkPIvc8fh7Xn

