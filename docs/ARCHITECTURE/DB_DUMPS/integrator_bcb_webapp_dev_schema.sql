--
-- PostgreSQL database dump
--

\restrict ju60JscKRoBkQLKHrtGW6ztJZ8UigzOopJSeOMxOmQwUb765mIUc2CDgZiaiIjA

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

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

--
-- Name: integrator; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA integrator;


--
-- Name: stage13_prevent_write_mailing_topics(); Type: FUNCTION; Schema: integrator; Owner: -
--

CREATE FUNCTION integrator.stage13_prevent_write_mailing_topics() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.stage13_bypass', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'mailing_topics is frozen (Stage 13): use webapp projection only';
END;
$$;


--
-- Name: stage13_prevent_write_user_subscriptions(); Type: FUNCTION; Schema: integrator; Owner: -
--

CREATE FUNCTION integrator.stage13_prevent_write_user_subscriptions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.stage13_bypass', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'user_subscriptions is frozen (Stage 13): use webapp projection only';
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: booking_calendar_map; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.booking_calendar_map (
    id bigint NOT NULL,
    rubitime_record_id text NOT NULL,
    gcal_event_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_calendar_map_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.booking_calendar_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: booking_calendar_map_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.booking_calendar_map_id_seq OWNED BY integrator.booking_calendar_map.id;


--
-- Name: contacts; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.contacts (
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
-- Name: contacts_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.contacts_id_seq OWNED BY integrator.contacts.id;


--
-- Name: content_access_grants; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.content_access_grants (
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
-- Name: conversation_messages; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.conversation_messages (
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
-- Name: conversations; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.conversations (
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
-- Name: delivery_attempt_logs; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.delivery_attempt_logs (
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
-- Name: delivery_attempt_logs_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.delivery_attempt_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delivery_attempt_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.delivery_attempt_logs_id_seq OWNED BY integrator.delivery_attempt_logs.id;


--
-- Name: idempotency_keys; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.idempotency_keys (
    key text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    request_hash text NOT NULL,
    status smallint NOT NULL,
    response_body jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: identities; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.identities (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    resource text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: identities_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.identities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identities_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.identities_id_seq OWNED BY integrator.identities.id;


--
-- Name: integration_data_quality_incidents; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.integration_data_quality_incidents (
    id bigint NOT NULL,
    integration text NOT NULL,
    entity text NOT NULL,
    external_id text NOT NULL,
    field text NOT NULL,
    raw_value text,
    timezone_used text,
    error_reason text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrences integer DEFAULT 1 NOT NULL,
    CONSTRAINT integration_data_quality_incidents_error_reason_check CHECK ((error_reason = ANY (ARRAY['invalid_datetime'::text, 'invalid_timezone'::text, 'unsupported_format'::text, 'invalid_branch_id'::text, 'query_failed'::text, 'missing_or_empty'::text, 'invalid_iana'::text, 'backfill_unresolvable'::text]))),
    CONSTRAINT integration_data_quality_incidents_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'unresolved'::text])))
);


--
-- Name: integration_data_quality_incidents_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.integration_data_quality_incidents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_data_quality_incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.integration_data_quality_incidents_id_seq OWNED BY integrator.integration_data_quality_incidents.id;


--
-- Name: mailing_logs; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.mailing_logs (
    user_id bigint NOT NULL,
    mailing_id bigint NOT NULL,
    status text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    error text
);


--
-- Name: mailing_topics; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.mailing_topics (
    id bigint NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    key text NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mailings; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.mailings (
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
-- Name: mailings_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.mailings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mailings_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.mailings_id_seq OWNED BY integrator.mailings.id;


--
-- Name: message_drafts; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.message_drafts (
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
-- Name: projection_outbox; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.projection_outbox (
    id bigint NOT NULL,
    event_type text NOT NULL,
    idempotency_key text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts_done integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_try_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projection_outbox_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.projection_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projection_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.projection_outbox_id_seq OWNED BY integrator.projection_outbox.id;


--
-- Name: question_messages; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.question_messages (
    id text NOT NULL,
    question_id text NOT NULL,
    sender_type text NOT NULL,
    message_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rubitime_api_throttle; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_api_throttle (
    id smallint NOT NULL,
    last_completed_at timestamp with time zone DEFAULT '1970-01-01 01:00:00+01'::timestamp with time zone NOT NULL,
    CONSTRAINT rubitime_api_throttle_id_check CHECK ((id = 1))
);


--
-- Name: rubitime_booking_profiles; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_booking_profiles (
    id bigint NOT NULL,
    booking_type text NOT NULL,
    category_code text NOT NULL,
    city_code text,
    branch_id bigint NOT NULL,
    service_id bigint NOT NULL,
    cooperator_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rubitime_booking_profiles_booking_type_check CHECK ((booking_type = ANY (ARRAY['online'::text, 'in_person'::text])))
);


--
-- Name: rubitime_booking_profiles_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_booking_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_booking_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_booking_profiles_id_seq OWNED BY integrator.rubitime_booking_profiles.id;


--
-- Name: rubitime_branches; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_branches (
    id bigint NOT NULL,
    rubitime_branch_id integer NOT NULL,
    city_code text NOT NULL,
    title text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL
);


--
-- Name: rubitime_branches_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_branches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_branches_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_branches_id_seq OWNED BY integrator.rubitime_branches.id;


--
-- Name: rubitime_cooperators; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_cooperators (
    id bigint NOT NULL,
    rubitime_cooperator_id integer NOT NULL,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rubitime_cooperators_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_cooperators_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_cooperators_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_cooperators_id_seq OWNED BY integrator.rubitime_cooperators.id;


--
-- Name: rubitime_create_retry_jobs; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_create_retry_jobs (
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
-- Name: rubitime_create_retry_jobs_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_create_retry_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_create_retry_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_create_retry_jobs_id_seq OWNED BY integrator.rubitime_create_retry_jobs.id;


--
-- Name: rubitime_events; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_events (
    id bigint NOT NULL,
    rubitime_record_id text,
    event text NOT NULL,
    payload_json jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rubitime_events_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_events_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_events_id_seq OWNED BY integrator.rubitime_events.id;


--
-- Name: rubitime_records; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_records (
    id bigint NOT NULL,
    rubitime_record_id text NOT NULL,
    phone_normalized text,
    record_at timestamp with time zone,
    status text NOT NULL,
    payload_json jsonb NOT NULL,
    last_event text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gcal_event_id text,
    CONSTRAINT rubitime_records_status_check CHECK ((status = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text])))
);


--
-- Name: rubitime_records_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_records_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_records_id_seq OWNED BY integrator.rubitime_records.id;


--
-- Name: rubitime_services; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.rubitime_services (
    id bigint NOT NULL,
    rubitime_service_id integer NOT NULL,
    title text NOT NULL,
    category_code text NOT NULL,
    duration_minutes integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rubitime_services_duration_minutes_check CHECK ((duration_minutes > 0))
);


--
-- Name: rubitime_services_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.rubitime_services_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_services_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.rubitime_services_id_seq OWNED BY integrator.rubitime_services.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.subscriptions_id_seq OWNED BY integrator.mailing_topics.id;


--
-- Name: system_settings; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.system_settings (
    key text NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    value_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text,
    CONSTRAINT system_settings_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])))
);


--
-- Name: telegram_state; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.telegram_state (
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
-- Name: telegram_users; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.telegram_users (
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
-- Name: telegram_users_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.telegram_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_users_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.telegram_users_id_seq OWNED BY integrator.telegram_users.id;


--
-- Name: user_questions; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_questions (
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
-- Name: user_reminder_delivery_logs; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_reminder_delivery_logs (
    id text NOT NULL,
    occurrence_id text NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    error_code text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_reminder_occurrences; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_reminder_occurrences (
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
-- Name: user_reminder_rules; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_reminder_rules (
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    linked_object_type text,
    linked_object_id text,
    custom_title text,
    custom_text text,
    deep_link text,
    schedule_data jsonb,
    reminder_intent text DEFAULT 'generic'::text,
    quiet_hours_start_minute integer,
    quiet_hours_end_minute integer,
    notification_topic_code text
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.user_subscriptions (
    user_id bigint NOT NULL,
    topic_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: integrator; Owner: -
--

CREATE TABLE integrator.users (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    merged_into_user_id bigint,
    CONSTRAINT users_merged_into_user_id_not_self_check CHECK (((merged_into_user_id IS NULL) OR (merged_into_user_id <> id)))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: integrator; Owner: -
--

CREATE SEQUENCE integrator.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: integrator; Owner: -
--

ALTER SEQUENCE integrator.users_id_seq OWNED BY integrator.users.id;


--
-- Name: booking_calendar_map id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.booking_calendar_map ALTER COLUMN id SET DEFAULT nextval('integrator.booking_calendar_map_id_seq'::regclass);


--
-- Name: contacts id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.contacts ALTER COLUMN id SET DEFAULT nextval('integrator.contacts_id_seq'::regclass);


--
-- Name: delivery_attempt_logs id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.delivery_attempt_logs ALTER COLUMN id SET DEFAULT nextval('integrator.delivery_attempt_logs_id_seq'::regclass);


--
-- Name: identities id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.identities ALTER COLUMN id SET DEFAULT nextval('integrator.identities_id_seq'::regclass);


--
-- Name: integration_data_quality_incidents id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.integration_data_quality_incidents ALTER COLUMN id SET DEFAULT nextval('integrator.integration_data_quality_incidents_id_seq'::regclass);


--
-- Name: mailing_topics id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_topics ALTER COLUMN id SET DEFAULT nextval('integrator.subscriptions_id_seq'::regclass);


--
-- Name: mailings id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailings ALTER COLUMN id SET DEFAULT nextval('integrator.mailings_id_seq'::regclass);


--
-- Name: projection_outbox id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.projection_outbox ALTER COLUMN id SET DEFAULT nextval('integrator.projection_outbox_id_seq'::regclass);


--
-- Name: rubitime_booking_profiles id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_booking_profiles_id_seq'::regclass);


--
-- Name: rubitime_branches id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_branches ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_branches_id_seq'::regclass);


--
-- Name: rubitime_cooperators id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_cooperators ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_cooperators_id_seq'::regclass);


--
-- Name: rubitime_create_retry_jobs id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_create_retry_jobs ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_create_retry_jobs_id_seq'::regclass);


--
-- Name: rubitime_events id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_events ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_events_id_seq'::regclass);


--
-- Name: rubitime_records id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_records ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_records_id_seq'::regclass);


--
-- Name: rubitime_services id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_services ALTER COLUMN id SET DEFAULT nextval('integrator.rubitime_services_id_seq'::regclass);


--
-- Name: telegram_users id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_users ALTER COLUMN id SET DEFAULT nextval('integrator.telegram_users_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.users ALTER COLUMN id SET DEFAULT nextval('integrator.users_id_seq'::regclass);


--
-- Name: booking_calendar_map booking_calendar_map_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.booking_calendar_map
    ADD CONSTRAINT booking_calendar_map_pkey PRIMARY KEY (id);


--
-- Name: booking_calendar_map booking_calendar_map_rubitime_record_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.booking_calendar_map
    ADD CONSTRAINT booking_calendar_map_rubitime_record_id_key UNIQUE (rubitime_record_id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_type_value_normalized_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.contacts
    ADD CONSTRAINT contacts_type_value_normalized_key UNIQUE (type, value_normalized);


--
-- Name: content_access_grants content_access_grants_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.content_access_grants
    ADD CONSTRAINT content_access_grants_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: delivery_attempt_logs delivery_attempt_logs_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.delivery_attempt_logs
    ADD CONSTRAINT delivery_attempt_logs_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_resource_external_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.identities
    ADD CONSTRAINT identities_resource_external_id_key UNIQUE (resource, external_id);


--
-- Name: integration_data_quality_incidents integration_data_quality_incidents_dedup; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.integration_data_quality_incidents
    ADD CONSTRAINT integration_data_quality_incidents_dedup UNIQUE (integration, entity, external_id, field, error_reason);


--
-- Name: integration_data_quality_incidents integration_data_quality_incidents_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.integration_data_quality_incidents
    ADD CONSTRAINT integration_data_quality_incidents_pkey PRIMARY KEY (id);


--
-- Name: mailing_logs mailing_logs_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_logs
    ADD CONSTRAINT mailing_logs_pkey PRIMARY KEY (user_id, mailing_id);


--
-- Name: mailings mailings_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailings
    ADD CONSTRAINT mailings_pkey PRIMARY KEY (id);


--
-- Name: message_drafts message_drafts_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.message_drafts
    ADD CONSTRAINT message_drafts_pkey PRIMARY KEY (id);


--
-- Name: projection_outbox projection_outbox_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.projection_outbox
    ADD CONSTRAINT projection_outbox_pkey PRIMARY KEY (id);


--
-- Name: question_messages question_messages_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.question_messages
    ADD CONSTRAINT question_messages_pkey PRIMARY KEY (id);


--
-- Name: rubitime_api_throttle rubitime_api_throttle_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_api_throttle
    ADD CONSTRAINT rubitime_api_throttle_pkey PRIMARY KEY (id);


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_pkey PRIMARY KEY (id);


--
-- Name: rubitime_branches rubitime_branches_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_branches
    ADD CONSTRAINT rubitime_branches_pkey PRIMARY KEY (id);


--
-- Name: rubitime_branches rubitime_branches_rubitime_branch_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_branches
    ADD CONSTRAINT rubitime_branches_rubitime_branch_id_key UNIQUE (rubitime_branch_id);


--
-- Name: rubitime_cooperators rubitime_cooperators_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_cooperators
    ADD CONSTRAINT rubitime_cooperators_pkey PRIMARY KEY (id);


--
-- Name: rubitime_cooperators rubitime_cooperators_rubitime_cooperator_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_cooperators
    ADD CONSTRAINT rubitime_cooperators_rubitime_cooperator_id_key UNIQUE (rubitime_cooperator_id);


--
-- Name: rubitime_create_retry_jobs rubitime_create_retry_jobs_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_create_retry_jobs
    ADD CONSTRAINT rubitime_create_retry_jobs_pkey PRIMARY KEY (id);


--
-- Name: rubitime_events rubitime_events_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_events
    ADD CONSTRAINT rubitime_events_pkey PRIMARY KEY (id);


--
-- Name: rubitime_records rubitime_records_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_records
    ADD CONSTRAINT rubitime_records_pkey PRIMARY KEY (id);


--
-- Name: rubitime_records rubitime_records_rubitime_record_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_records
    ADD CONSTRAINT rubitime_records_rubitime_record_id_key UNIQUE (rubitime_record_id);


--
-- Name: rubitime_services rubitime_services_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_services
    ADD CONSTRAINT rubitime_services_pkey PRIMARY KEY (id);


--
-- Name: rubitime_services rubitime_services_rubitime_service_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_services
    ADD CONSTRAINT rubitime_services_rubitime_service_id_key UNIQUE (rubitime_service_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: mailing_topics subscriptions_code_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_topics
    ADD CONSTRAINT subscriptions_code_key UNIQUE (code);


--
-- Name: mailing_topics subscriptions_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_topics
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key, scope);


--
-- Name: telegram_state telegram_state_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_state
    ADD CONSTRAINT telegram_state_pkey PRIMARY KEY (identity_id);


--
-- Name: telegram_users telegram_users_chat_id_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_users
    ADD CONSTRAINT telegram_users_chat_id_key UNIQUE (telegram_id);


--
-- Name: telegram_users telegram_users_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_users
    ADD CONSTRAINT telegram_users_pkey PRIMARY KEY (id);


--
-- Name: user_questions user_questions_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_questions
    ADD CONSTRAINT user_questions_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_delivery_logs user_reminder_delivery_logs_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_delivery_logs
    ADD CONSTRAINT user_reminder_delivery_logs_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_occurrences user_reminder_occurrences_occurrence_key_key; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_occurrence_key_key UNIQUE (occurrence_key);


--
-- Name: user_reminder_occurrences user_reminder_occurrences_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_pkey PRIMARY KEY (id);


--
-- Name: user_reminder_rules user_reminder_rules_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_rules
    ADD CONSTRAINT user_reminder_rules_pkey PRIMARY KEY (id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (user_id, topic_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: content_access_grants_user_expires_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX content_access_grants_user_expires_idx ON integrator.content_access_grants USING btree (user_id, expires_at DESC);


--
-- Name: conversation_messages_conversation_created_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX conversation_messages_conversation_created_idx ON integrator.conversation_messages USING btree (conversation_id, created_at);


--
-- Name: conversations_open_user_source_uidx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX conversations_open_user_source_uidx ON integrator.conversations USING btree (user_identity_id, source) WHERE ((closed_at IS NULL) AND (status <> 'closed'::text));


--
-- Name: conversations_status_last_message_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX conversations_status_last_message_idx ON integrator.conversations USING btree (status, last_message_at DESC);


--
-- Name: idempotency_keys_expires_at_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idempotency_keys_expires_at_idx ON integrator.idempotency_keys USING btree (expires_at);


--
-- Name: idx_booking_calendar_map_gcal_event_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_booking_calendar_map_gcal_event_id ON integrator.booking_calendar_map USING btree (gcal_event_id);


--
-- Name: idx_contacts_user_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_contacts_user_id ON integrator.contacts USING btree (user_id);


--
-- Name: idx_delivery_attempt_logs_channel_occurred; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_delivery_attempt_logs_channel_occurred ON integrator.delivery_attempt_logs USING btree (channel, occurred_at DESC);


--
-- Name: idx_delivery_attempt_logs_correlation; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_delivery_attempt_logs_correlation ON integrator.delivery_attempt_logs USING btree (correlation_id);


--
-- Name: idx_delivery_attempt_logs_event; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_delivery_attempt_logs_event ON integrator.delivery_attempt_logs USING btree (intent_event_id);


--
-- Name: idx_identities_user_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_identities_user_id ON integrator.identities USING btree (user_id);


--
-- Name: idx_integration_data_quality_incidents_last_seen; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_integration_data_quality_incidents_last_seen ON integrator.integration_data_quality_incidents USING btree (last_seen_at DESC);


--
-- Name: idx_projection_outbox_due; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_projection_outbox_due ON integrator.projection_outbox USING btree (status, next_try_at) WHERE (status = 'pending'::text);


--
-- Name: idx_projection_outbox_idempotency_key; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX idx_projection_outbox_idempotency_key ON integrator.projection_outbox USING btree (idempotency_key);


--
-- Name: idx_rbp_is_active; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_rbp_is_active ON integrator.rubitime_booking_profiles USING btree (is_active);


--
-- Name: idx_rbp_type_category_city; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX idx_rbp_type_category_city ON integrator.rubitime_booking_profiles USING btree (booking_type, category_code, COALESCE(city_code, ''::text));


--
-- Name: idx_rubitime_create_retry_jobs_due; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_rubitime_create_retry_jobs_due ON integrator.rubitime_create_retry_jobs USING btree (status, next_try_at);


--
-- Name: idx_rubitime_records_phone_normalized; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_rubitime_records_phone_normalized ON integrator.rubitime_records USING btree (phone_normalized);


--
-- Name: idx_rubitime_records_record_at; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_rubitime_records_record_at ON integrator.rubitime_records USING btree (record_at);


--
-- Name: idx_users_merged_into_user_id; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX idx_users_merged_into_user_id ON integrator.users USING btree (merged_into_user_id) WHERE (merged_into_user_id IS NOT NULL);


--
-- Name: message_drafts_identity_source_uidx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE UNIQUE INDEX message_drafts_identity_source_uidx ON integrator.message_drafts USING btree (identity_id, source);


--
-- Name: message_drafts_source_updated_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX message_drafts_source_updated_idx ON integrator.message_drafts USING btree (source, updated_at DESC);


--
-- Name: question_messages_question_created_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX question_messages_question_created_idx ON integrator.question_messages USING btree (question_id, created_at);


--
-- Name: telegram_state_last_start_at_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX telegram_state_last_start_at_idx ON integrator.telegram_state USING btree (last_start_at);


--
-- Name: telegram_state_last_update_id_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX telegram_state_last_update_id_idx ON integrator.telegram_state USING btree (last_update_id);


--
-- Name: telegram_users_last_start_at_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX telegram_users_last_start_at_idx ON integrator.telegram_users USING btree (last_start_at);


--
-- Name: telegram_users_last_update_id_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX telegram_users_last_update_id_idx ON integrator.telegram_users USING btree (last_update_id);


--
-- Name: user_questions_answered_created_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_questions_answered_created_idx ON integrator.user_questions USING btree (answered, created_at DESC) WHERE (answered = false);


--
-- Name: user_questions_conversation_id_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_questions_conversation_id_idx ON integrator.user_questions USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: user_reminder_delivery_logs_occurrence_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_reminder_delivery_logs_occurrence_idx ON integrator.user_reminder_delivery_logs USING btree (occurrence_id, created_at DESC);


--
-- Name: user_reminder_occurrences_due_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_reminder_occurrences_due_idx ON integrator.user_reminder_occurrences USING btree (status, planned_at);


--
-- Name: user_reminder_rules_enabled_idx; Type: INDEX; Schema: integrator; Owner: -
--

CREATE INDEX user_reminder_rules_enabled_idx ON integrator.user_reminder_rules USING btree (is_enabled, category);


--
-- Name: mailing_topics stage13_freeze_mailing_topics; Type: TRIGGER; Schema: integrator; Owner: -
--

CREATE TRIGGER stage13_freeze_mailing_topics BEFORE INSERT OR DELETE OR UPDATE ON integrator.mailing_topics FOR EACH ROW EXECUTE FUNCTION integrator.stage13_prevent_write_mailing_topics();


--
-- Name: user_subscriptions stage13_freeze_user_subscriptions; Type: TRIGGER; Schema: integrator; Owner: -
--

CREATE TRIGGER stage13_freeze_user_subscriptions BEFORE INSERT OR DELETE OR UPDATE ON integrator.user_subscriptions FOR EACH ROW EXECUTE FUNCTION integrator.stage13_prevent_write_user_subscriptions();


--
-- Name: contacts contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.contacts
    ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: content_access_grants content_access_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.content_access_grants
    ADD CONSTRAINT content_access_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversation_messages
    ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES integrator.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user_identity_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.conversations
    ADD CONSTRAINT conversations_user_identity_id_fkey FOREIGN KEY (user_identity_id) REFERENCES integrator.identities(id) ON DELETE CASCADE;


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: mailing_logs mailing_logs_mailing_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_logs
    ADD CONSTRAINT mailing_logs_mailing_id_fkey FOREIGN KEY (mailing_id) REFERENCES integrator.mailings(id) ON DELETE CASCADE;


--
-- Name: mailing_logs mailing_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailing_logs
    ADD CONSTRAINT mailing_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: mailings mailings_topic_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.mailings
    ADD CONSTRAINT mailings_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES integrator.mailing_topics(id) ON DELETE CASCADE;


--
-- Name: message_drafts message_drafts_identity_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.message_drafts
    ADD CONSTRAINT message_drafts_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES integrator.identities(id) ON DELETE CASCADE;


--
-- Name: question_messages question_messages_question_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.question_messages
    ADD CONSTRAINT question_messages_question_id_fkey FOREIGN KEY (question_id) REFERENCES integrator.user_questions(id) ON DELETE CASCADE;


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES integrator.rubitime_branches(id);


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_cooperator_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_cooperator_id_fkey FOREIGN KEY (cooperator_id) REFERENCES integrator.rubitime_cooperators(id);


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_service_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_service_id_fkey FOREIGN KEY (service_id) REFERENCES integrator.rubitime_services(id);


--
-- Name: telegram_state telegram_state_identity_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.telegram_state
    ADD CONSTRAINT telegram_state_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES integrator.identities(id) ON DELETE CASCADE;


--
-- Name: user_questions user_questions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_questions
    ADD CONSTRAINT user_questions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES integrator.conversations(id) ON DELETE SET NULL;


--
-- Name: user_questions user_questions_user_identity_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_questions
    ADD CONSTRAINT user_questions_user_identity_id_fkey FOREIGN KEY (user_identity_id) REFERENCES integrator.identities(id) ON DELETE CASCADE;


--
-- Name: user_reminder_delivery_logs user_reminder_delivery_logs_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_delivery_logs
    ADD CONSTRAINT user_reminder_delivery_logs_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES integrator.user_reminder_occurrences(id) ON DELETE CASCADE;


--
-- Name: user_reminder_occurrences user_reminder_occurrences_rule_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_occurrences
    ADD CONSTRAINT user_reminder_occurrences_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES integrator.user_reminder_rules(id) ON DELETE CASCADE;


--
-- Name: user_reminder_rules user_reminder_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_reminder_rules
    ADD CONSTRAINT user_reminder_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_subscription_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_subscriptions
    ADD CONSTRAINT user_subscriptions_subscription_id_fkey FOREIGN KEY (topic_id) REFERENCES integrator.mailing_topics(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES integrator.users(id) ON DELETE CASCADE;


--
-- Name: users users_merged_into_user_id_fkey; Type: FK CONSTRAINT; Schema: integrator; Owner: -
--

ALTER TABLE ONLY integrator.users
    ADD CONSTRAINT users_merged_into_user_id_fkey FOREIGN KEY (merged_into_user_id) REFERENCES integrator.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict ju60JscKRoBkQLKHrtGW6ztJZ8UigzOopJSeOMxOmQwUb765mIUc2CDgZiaiIjA

