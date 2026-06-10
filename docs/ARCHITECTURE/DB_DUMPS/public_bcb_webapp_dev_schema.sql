--
-- PostgreSQL database dump
--

\restrict 86kBquxOoudeUlalTKZvkbcR6uv4aKBuKNdV1UwD2eSj1XLtyfQLCzcdlLABPaW

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
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: media_folders_enforce_depth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.media_folders_enforce_depth() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  d INT := 0;
  cur UUID := NEW.parent_id;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  WHILE cur IS NOT NULL AND d < 64 LOOP
    d := d + 1;
    SELECT parent_id INTO cur FROM media_folders WHERE id = cur;
  END LOOP;
  IF d > 32 THEN
    RAISE EXCEPTION 'media_folders: max depth 32 exceeded';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: media_folders_prevent_cycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.media_folders_prevent_cycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cur UUID := NEW.parent_id;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'media_folders: cannot set parent to self';
  END IF;
  cur := NEW.parent_id;
  FOR i IN 1..64 LOOP
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'media_folders: cycle detected';
    END IF;
    SELECT parent_id INTO cur FROM media_folders WHERE id = cur;
    EXIT WHEN cur IS NULL;
  END LOOP;
  RETURN NEW;
END;
$$;


--
-- Name: stage13_prevent_write_mailing_topics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stage13_prevent_write_mailing_topics() RETURNS trigger
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
-- Name: stage13_prevent_write_user_subscriptions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stage13_prevent_write_user_subscriptions() RETURNS trigger
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
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    target_id text,
    conflict_key text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    repeat_count integer DEFAULT 1 NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_audit_log_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'partial_failure'::text, 'error'::text])))
);


--
-- Name: appointment_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_record_id text NOT NULL,
    phone_normalized text,
    record_at timestamp with time zone,
    status text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_event text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    deleted_at timestamp with time zone,
    platform_user_id uuid,
    CONSTRAINT appointment_records_status_check CHECK ((status = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text])))
);


--
-- Name: auth_rate_limit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_rate_limit_events (
    scope text NOT NULL,
    key text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_appointment_cancellations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_cancellations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    actor_type text NOT NULL,
    actor_id uuid,
    cancellation_type text NOT NULL,
    reason text,
    was_free boolean NOT NULL,
    was_penalized boolean NOT NULL,
    package_session_charged boolean NOT NULL,
    prepayment_retained boolean NOT NULL,
    prepayment_refunded boolean NOT NULL,
    staff_comment text,
    notifications_sent jsonb DEFAULT '{}'::jsonb NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    applied_policy_id uuid,
    applied_policy_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_appt_cancellations_actor_check CHECK ((actor_type = ANY (ARRAY['patient'::text, 'specialist'::text, 'admin'::text, 'system'::text]))),
    CONSTRAINT be_appt_cancellations_type_check CHECK ((cancellation_type = ANY (ARRAY['free'::text, 'penalized'::text, 'package_charged'::text, 'no_package_charge'::text, 'retain_prepayment'::text, 'refund_prepayment'::text, 'custom'::text])))
);


--
-- Name: be_appointment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_appointment_history_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_history_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_appointment_reschedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_reschedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    from_start_at timestamp with time zone NOT NULL,
    from_end_at timestamp with time zone NOT NULL,
    to_start_at timestamp with time zone NOT NULL,
    to_end_at timestamp with time zone NOT NULL,
    actor_type text NOT NULL,
    actor_id uuid,
    was_in_free_reschedule_window boolean NOT NULL,
    free_cancellation_available_at_reschedule boolean NOT NULL,
    free_cancellation_available_after boolean NOT NULL,
    applied_policy_id uuid,
    applied_policy_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    reason text,
    staff_comment text,
    notifications_sent jsonb DEFAULT '{}'::jsonb NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_appt_reschedules_actor_check CHECK ((actor_type = ANY (ARRAY['patient'::text, 'specialist'::text, 'admin'::text, 'system'::text])))
);


--
-- Name: be_appointment_staff_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointment_staff_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid,
    room_id uuid,
    specialist_id uuid,
    service_id uuid,
    platform_user_id uuid,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    duration_minutes integer NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    original_start_at timestamp with time zone,
    reschedule_count integer DEFAULT 0 NOT NULL,
    payment_ref text,
    package_usage_ref text,
    phone_normalized text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    attribution_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT be_appointments_source_check CHECK ((source = ANY (ARRAY['native'::text, 'rubitime_projection'::text, 'admin_manual'::text, 'public_widget'::text]))),
    CONSTRAINT be_appointments_status_check CHECK ((status = ANY (ARRAY['created'::text, 'awaiting_payment'::text, 'paid'::text, 'confirmed'::text, 'rescheduled'::text, 'cancelled_by_patient'::text, 'cancelled_by_specialist'::text, 'late_cancellation'::text, 'no_show'::text, 'completed'::text, 'visit_confirmed'::text, 'charged_to_package'::text, 'manual_review_required'::text]))),
    CONSTRAINT be_appointments_time_check CHECK ((end_at > start_at))
);


--
-- Name: be_availability_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_availability_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid,
    branch_id uuid,
    rule_type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_availability_rules_type_check CHECK ((rule_type = ANY (ARRAY['buffer_minutes'::text, 'max_chain_slots'::text])))
);


--
-- Name: be_booking_form_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_booking_form_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    field_key text NOT NULL,
    field_type text NOT NULL,
    label text NOT NULL,
    placeholder text,
    is_required boolean DEFAULT false NOT NULL,
    visible_to_patient boolean DEFAULT true NOT NULL,
    visible_to_staff boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_booking_form_fields_type_check CHECK ((field_type = ANY (ARRAY['first_name'::text, 'last_name'::text, 'phone'::text, 'email'::text, 'comment'::text, 'problem_description'::text, 'complaint'::text, 'free_text'::text, 'custom'::text])))
);


--
-- Name: be_booking_form_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_booking_form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    city_code text NOT NULL,
    address text,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_cancellation_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_cancellation_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    scope_level text NOT NULL,
    scope_entity_id uuid,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    free_cancel_hours_before integer DEFAULT 72 NOT NULL,
    cancellation_allowed boolean DEFAULT true NOT NULL,
    late_cancellation_behavior text DEFAULT 'manual_review'::text NOT NULL,
    refund_prepayment_on_late text DEFAULT 'manual'::text NOT NULL,
    charge_package_session_on_late boolean DEFAULT false NOT NULL,
    requires_staff_confirmation boolean DEFAULT false NOT NULL,
    notify_patient boolean DEFAULT true NOT NULL,
    notify_staff boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_cancel_policies_late_behavior_check CHECK ((late_cancellation_behavior = ANY (ARRAY['penalty'::text, 'manual_review'::text, 'charge_package'::text, 'retain_prepayment'::text, 'refund_prepayment'::text]))),
    CONSTRAINT be_cancel_policies_scope_check CHECK ((scope_level = ANY (ARRAY['organization'::text, 'specialist'::text, 'service'::text, 'product'::text])))
);


--
-- Name: be_clinic_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_clinic_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    duration_minutes integer NOT NULL,
    price_minor integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    prepayment_applicable boolean DEFAULT false NOT NULL,
    usable_in_packages boolean DEFAULT true NOT NULL,
    online_payment_applicable boolean DEFAULT false NOT NULL,
    public_widget_visible boolean DEFAULT true NOT NULL,
    admin_manual_only boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_clinic_services_duration_check CHECK ((duration_minutes > 0)),
    CONSTRAINT be_clinic_services_price_check CHECK ((price_minor >= 0))
);


--
-- Name: be_external_entity_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_external_entity_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    entity_type text NOT NULL,
    canonical_id uuid NOT NULL,
    external_system text NOT NULL,
    external_id text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_external_entity_type_check CHECK ((entity_type = ANY (ARRAY['branch'::text, 'specialist'::text, 'service'::text, 'appointment'::text, 'availability'::text]))),
    CONSTRAINT be_external_system_check CHECK ((external_system = ANY (ARRAY['rubitime'::text])))
);


--
-- Name: be_organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_organizations (
    id uuid NOT NULL,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_package_history_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_package_history_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_package_id uuid NOT NULL,
    event_type text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_package_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_package_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_id uuid NOT NULL,
    service_id uuid NOT NULL,
    quantity integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_package_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: be_package_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_package_usages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_package_id uuid NOT NULL,
    patient_package_item_id uuid NOT NULL,
    appointment_id uuid,
    usage_kind text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    comment text,
    created_by_platform_user_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_package_usages_kind_check CHECK ((usage_kind = ANY (ARRAY['reserve'::text, 'consume'::text, 'release'::text, 'penalty'::text, 'manual_adjust'::text, 'refund'::text]))),
    CONSTRAINT be_package_usages_quantity_check CHECK ((quantity > 0))
);


--
-- Name: be_patient_booking_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_patient_booking_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    is_problematic boolean DEFAULT false NOT NULL,
    booking_blocked boolean DEFAULT false NOT NULL,
    problematic_note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: be_patient_package_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_patient_package_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_package_id uuid NOT NULL,
    service_id uuid NOT NULL,
    quantity_initial integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_patient_package_items_quantity_check CHECK ((quantity_initial > 0))
);


--
-- Name: be_patient_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_patient_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    subscription_package_id uuid,
    status text DEFAULT 'offered'::text NOT NULL,
    title text NOT NULL,
    price_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    validity_days integer,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    deduction_mode text DEFAULT 'auto_on_visit_confirmed'::text NOT NULL,
    payment_intent_id uuid,
    payment_ref text,
    assigned_by_platform_user_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sold_at timestamp with time zone,
    paid_amount_minor integer,
    paid_currency text,
    CONSTRAINT be_patient_packages_deduction_mode_check CHECK ((deduction_mode = ANY (ARRAY['auto_on_visit_confirmed'::text, 'manual'::text]))),
    CONSTRAINT be_patient_packages_price_check CHECK ((price_minor >= 0)),
    CONSTRAINT be_patient_packages_status_check CHECK ((status = ANY (ARRAY['offered'::text, 'awaiting_payment'::text, 'active'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: be_patient_timeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_patient_timeline_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    domain text NOT NULL,
    event_type text NOT NULL,
    linked_object_type text NOT NULL,
    linked_object_id text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_patient_timeline_domain_check CHECK ((domain = ANY (ARRAY['appointment'::text, 'payment'::text, 'package'::text])))
);


--
-- Name: be_payment_history_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_payment_history_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    appointment_id uuid,
    platform_user_id uuid,
    payment_id uuid,
    refund_id uuid,
    event_type text NOT NULL,
    amount_minor integer,
    currency text DEFAULT 'RUB'::text,
    provider_id text,
    status text,
    purpose text,
    comment text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_payment_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_payment_intents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    provider_id text NOT NULL,
    appointment_id uuid,
    platform_user_id uuid,
    product_ref text,
    amount_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    purpose text DEFAULT 'appointment_prepayment'::text NOT NULL,
    provider_intent_ref text,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_payment_intents_amount_check CHECK ((amount_minor >= 0))
);


--
-- Name: be_payment_provider_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_payment_provider_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    provider_id text NOT NULL,
    idempotency_key text NOT NULL,
    event_type text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    payment_intent_id uuid NOT NULL,
    appointment_id uuid,
    platform_user_id uuid,
    provider_id text NOT NULL,
    amount_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    status text DEFAULT 'captured'::text NOT NULL,
    purpose text DEFAULT 'appointment_prepayment'::text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_prepayment_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_prepayment_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    service_id uuid,
    mode text DEFAULT 'disabled'::text NOT NULL,
    amount_minor integer,
    percent_bps integer,
    currency text DEFAULT 'RUB'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    online_category text,
    CONSTRAINT be_prepayment_policies_mode_check CHECK ((mode = ANY (ARRAY['disabled'::text, 'fixed_minor'::text, 'percent'::text, 'full_price'::text]))),
    CONSTRAINT be_prepayment_policies_online_category_check CHECK (((online_category IS NULL) OR (online_category = ANY (ARRAY['rehab_lfk'::text, 'nutrition'::text, 'general'::text])))),
    CONSTRAINT be_prepayment_policies_scope_check CHECK ((((service_id IS NOT NULL) AND (online_category IS NULL)) OR ((service_id IS NULL) AND (online_category IS NOT NULL))))
);


--
-- Name: be_product_history_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_product_history_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_purchase_id uuid NOT NULL,
    event_type text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_product_pay_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_product_pay_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone,
    max_uses integer,
    use_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_product_pay_links_use_count_check CHECK ((use_count >= 0))
);


--
-- Name: be_product_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_product_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_type text NOT NULL,
    platform_user_id uuid,
    buyer_phone_normalized text,
    gift_recipient_phone_normalized text,
    status text DEFAULT 'offered'::text NOT NULL,
    title text NOT NULL,
    price_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    validity_days integer,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    fulfillment_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    payment_intent_id uuid,
    payment_ref text,
    pay_link_id uuid,
    assigned_by_platform_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_product_purchases_price_check CHECK ((price_minor >= 0)),
    CONSTRAINT be_product_purchases_status_check CHECK ((status = ANY (ARRAY['offered'::text, 'awaiting_payment'::text, 'active'::text, 'used'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: be_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_type text NOT NULL,
    title text NOT NULL,
    description text,
    price_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    composition_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    access_rules_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    payment_rules_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    validity_days integer,
    course_id uuid,
    subscription_package_id uuid,
    show_in_patient_catalog boolean DEFAULT true NOT NULL,
    pay_by_link_enabled boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_products_price_check CHECK ((price_minor >= 0)),
    CONSTRAINT be_products_type_check CHECK ((product_type = ANY (ARRAY['single_visit'::text, 'membership'::text, 'gift_certificate'::text, 'promo'::text, 'course'::text, 'subscription'::text, 'content_access'::text, 'individual_offer'::text])))
);


--
-- Name: be_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    appointment_id uuid,
    amount_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reason text,
    provider_refund_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_refunds_amount_check CHECK ((amount_minor >= 0))
);


--
-- Name: be_reschedule_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_reschedule_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    scope_level text NOT NULL,
    scope_entity_id uuid,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    self_reschedule_hours_before integer DEFAULT 48 NOT NULL,
    max_self_reschedules integer DEFAULT 1 NOT NULL,
    allow_different_branch boolean DEFAULT false NOT NULL,
    allow_different_city boolean DEFAULT false NOT NULL,
    allow_different_specialist boolean DEFAULT false NOT NULL,
    allow_different_service boolean DEFAULT false NOT NULL,
    limit_exceeded_behavior text DEFAULT 'manual_request'::text NOT NULL,
    requires_staff_confirmation boolean DEFAULT false NOT NULL,
    notify_patient boolean DEFAULT true NOT NULL,
    notify_staff boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_reschedule_policies_limit_check CHECK ((limit_exceeded_behavior = ANY (ARRAY['manual_request'::text, 'deny'::text]))),
    CONSTRAINT be_reschedule_policies_scope_check CHECK ((scope_level = ANY (ARRAY['organization'::text, 'specialist'::text, 'service'::text, 'product'::text])))
);


--
-- Name: be_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_schedule_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_schedule_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid,
    branch_id uuid,
    room_id uuid,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    block_type text NOT NULL,
    title text,
    created_by_actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_schedule_blocks_time_check CHECK ((end_at > start_at)),
    CONSTRAINT be_schedule_blocks_type_check CHECK ((block_type = ANY (ARRAY['block'::text, 'absence'::text, 'manual_booking'::text])))
);


--
-- Name: be_service_location_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_service_location_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    service_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_specialist_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_specialist_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_specialist_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_specialist_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    room_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_specialist_service_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_specialist_service_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    service_id uuid NOT NULL,
    branch_id uuid,
    room_id uuid,
    city_code text,
    duration_minutes_override integer,
    price_minor_override integer,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_specialists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_specialists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: be_subscription_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_subscription_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    price_minor integer NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    validity_days integer,
    deduction_mode text DEFAULT 'auto_on_visit_confirmed'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_subscription_packages_deduction_mode_check CHECK ((deduction_mode = ANY (ARRAY['auto_on_visit_confirmed'::text, 'manual'::text]))),
    CONSTRAINT be_subscription_packages_price_check CHECK ((price_minor >= 0))
);


--
-- Name: be_working_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.be_working_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    specialist_id uuid,
    branch_id uuid,
    room_id uuid,
    weekday integer NOT NULL,
    start_minute integer NOT NULL,
    end_minute integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT be_working_hours_minutes_check CHECK (((start_minute >= 0) AND (end_minute <= 1440) AND (end_minute > start_minute))),
    CONSTRAINT be_working_hours_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);


--
-- Name: booking_branch_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_branch_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    service_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    rubitime_service_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    city_id uuid NOT NULL,
    title text NOT NULL,
    address text,
    rubitime_branch_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL
);


--
-- Name: booking_calendar_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_calendar_map (
    id bigint NOT NULL,
    rubitime_record_id text NOT NULL,
    gcal_event_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_calendar_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.booking_calendar_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: booking_calendar_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.booking_calendar_map_id_seq OWNED BY public.booking_calendar_map.id;


--
-- Name: booking_cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_cities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    duration_minutes integer NOT NULL,
    price_minor integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_specialists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_specialists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    full_name text NOT NULL,
    description text,
    rubitime_cooperator_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_branch_id bigint NOT NULL,
    name text,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL
);


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
    error_count integer DEFAULT 0 NOT NULL,
    channels text[] DEFAULT ARRAY['bot_message'::text, 'sms'::text] NOT NULL,
    message_body text DEFAULT ''::text NOT NULL,
    delivery_jobs_total integer DEFAULT 0 NOT NULL,
    attach_menu_after_send boolean DEFAULT false NOT NULL,
    blocked_recipient_count integer DEFAULT 0 NOT NULL
);


--
-- Name: broadcast_audit_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_audit_recipients (
    audit_id uuid NOT NULL,
    platform_user_id uuid NOT NULL
);


--
-- Name: channel_link_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_link_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel_code text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_link_secrets_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text])))
);


--
-- Name: clinical_test_measure_kinds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_test_measure_kinds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clinical_test_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_test_regions (
    clinical_test_id uuid NOT NULL,
    body_region_id uuid NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    comment_type text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comments_comment_type_check CHECK ((comment_type = ANY (ARRAY['template'::text, 'individual_override'::text, 'clinical_note'::text]))),
    CONSTRAINT comments_target_type_check CHECK ((target_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'test'::text, 'test_set'::text, 'recommendation'::text, 'lesson'::text, 'stage_item_instance'::text, 'stage_instance'::text, 'program_instance'::text])))
);


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
-- Name: content_access_grants_webapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_access_grants_webapp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_grant_id text NOT NULL,
    platform_user_id uuid,
    integrator_user_id bigint NOT NULL,
    content_id text NOT NULL,
    purpose text NOT NULL,
    token_hash text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: content_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    body_html text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    video_url text,
    video_type text,
    image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_md text DEFAULT ''::text NOT NULL,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    requires_auth boolean DEFAULT false NOT NULL,
    linked_course_id uuid
);


--
-- Name: COLUMN content_pages.requires_auth; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.content_pages.requires_auth IS 'If true, only tier-patient session may open this page.';


--
-- Name: content_section_slug_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_section_slug_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    old_slug text NOT NULL,
    new_slug text NOT NULL,
    changed_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_section_slug_history_slug_diff_chk CHECK ((old_slug <> new_slug))
);


--
-- Name: content_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    requires_auth boolean DEFAULT false NOT NULL,
    cover_image_url text,
    icon_image_url text,
    kind text DEFAULT 'article'::text NOT NULL,
    system_parent_code text,
    CONSTRAINT content_sections_article_no_system_parent_check CHECK (((kind = 'system'::text) OR (system_parent_code IS NULL))),
    CONSTRAINT content_sections_kind_check CHECK ((kind = ANY (ARRAY['article'::text, 'system'::text]))),
    CONSTRAINT content_sections_system_parent_code_check CHECK (((system_parent_code IS NULL) OR (system_parent_code = ANY (ARRAY['situations'::text, 'sos'::text, 'warmups'::text, 'lessons'::text]))))
);


--
-- Name: COLUMN content_sections.requires_auth; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.content_sections.requires_auth IS 'If true, only tier-patient session may browse this section on /app/patient.';


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
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    program_template_id uuid NOT NULL,
    intro_lesson_page_id uuid,
    access_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text NOT NULL,
    price_minor integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT courses_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
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
-- Name: doctor_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctor_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    author_id uuid NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: doctor_patient_support; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctor_patient_support (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    on_support boolean DEFAULT false NOT NULL,
    comments_enabled boolean,
    media_enabled boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: email_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at bigint NOT NULL,
    attempts smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_send_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_send_cooldowns (
    user_id uuid NOT NULL,
    email_normalized text NOT NULL,
    last_sent_at timestamp with time zone NOT NULL
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
-- Name: integration_data_quality_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_data_quality_incidents (
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
-- Name: integration_data_quality_incidents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_data_quality_incidents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_data_quality_incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_data_quality_incidents_id_seq OWNED BY public.integration_data_quality_incidents.id;


--
-- Name: integration_webhook_error_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_webhook_error_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    error_class text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integration_webhook_last_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_webhook_last_status (
    source text NOT NULL,
    received_at timestamp with time zone NOT NULL,
    processed_ok integer NOT NULL,
    error_class text,
    http_status_returned integer,
    detail text
);


--
-- Name: integrator_push_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrator_push_outbox (
    id bigint NOT NULL,
    kind text NOT NULL,
    idempotency_key text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts_done integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 8 NOT NULL,
    next_try_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integrator_push_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'dead'::text])))
);


--
-- Name: TABLE integrator_push_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.integrator_push_outbox IS 'Webapp-side queue when signed POST to integrator fails after local DB commit; worker retries delivery.';


--
-- Name: integrator_push_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integrator_push_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integrator_push_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integrator_push_outbox_id_seq OWNED BY public.integrator_push_outbox.id;


--
-- Name: lfk_complex_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_complex_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complex_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    reps integer,
    sets integer,
    side text,
    max_pain_0_10 integer,
    comment text,
    local_comment text,
    CONSTRAINT lfk_complex_exercises_max_pain_0_10_check CHECK (((max_pain_0_10 IS NULL) OR ((max_pain_0_10 >= 0) AND (max_pain_0_10 <= 10)))),
    CONSTRAINT lfk_complex_exercises_side_check CHECK (((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text, 'damaged'::text, 'healthy'::text]))))
);


--
-- Name: lfk_complex_template_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_complex_template_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    reps integer,
    sets integer,
    side text,
    max_pain_0_10 integer,
    comment text,
    CONSTRAINT lfk_complex_template_exercises_max_pain_0_10_check CHECK (((max_pain_0_10 IS NULL) OR ((max_pain_0_10 >= 0) AND (max_pain_0_10 <= 10)))),
    CONSTRAINT lfk_complex_template_exercises_side_check CHECK (((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text, 'damaged'::text, 'healthy'::text]))))
);


--
-- Name: lfk_complex_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_complex_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lfk_complex_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
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
    symptom_tracking_id uuid,
    region_ref_id uuid,
    side text,
    diagnosis_text text,
    diagnosis_ref_id uuid,
    platform_user_id uuid NOT NULL,
    CONSTRAINT lfk_complexes_origin_check CHECK ((origin = ANY (ARRAY['manual'::text, 'assigned_by_specialist'::text]))),
    CONSTRAINT lfk_complexes_side_check CHECK (((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))))
);


--
-- Name: lfk_exercise_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_exercise_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exercise_id uuid NOT NULL,
    media_url text NOT NULL,
    media_type text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lfk_exercise_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text, 'gif'::text])))
);


--
-- Name: lfk_exercise_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_exercise_regions (
    exercise_id uuid NOT NULL,
    region_ref_id uuid NOT NULL
);


--
-- Name: lfk_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    region_ref_id uuid,
    load_type text,
    difficulty_1_10 integer,
    contraindications text,
    tags text[],
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lfk_exercises_difficulty_1_10_check CHECK (((difficulty_1_10 IS NULL) OR ((difficulty_1_10 >= 1) AND (difficulty_1_10 <= 10))))
);


--
-- Name: lfk_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfk_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    complex_id uuid NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_minutes smallint,
    difficulty_0_10 smallint,
    pain_0_10 smallint,
    comment text,
    recorded_at timestamp with time zone,
    CONSTRAINT lfk_sessions_difficulty_0_10_check CHECK (((difficulty_0_10 IS NULL) OR ((difficulty_0_10 >= 0) AND (difficulty_0_10 <= 10)))),
    CONSTRAINT lfk_sessions_pain_0_10_check CHECK (((pain_0_10 IS NULL) OR ((pain_0_10 >= 0) AND (pain_0_10 <= 10)))),
    CONSTRAINT lfk_sessions_source_check CHECK ((source = ANY (ARRAY['bot'::text, 'webapp'::text])))
);


--
-- Name: login_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    method text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confirmed_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_issued_at timestamp with time zone,
    CONSTRAINT login_tokens_method_check CHECK ((method = ANY (ARRAY['telegram'::text, 'max'::text]))),
    CONSTRAINT login_tokens_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'expired'::text])))
);


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
-- Name: mailing_logs_webapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mailing_logs_webapp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_user_id bigint NOT NULL,
    integrator_mailing_id bigint NOT NULL,
    status text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    error_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: mailing_topics_webapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mailing_topics_webapp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_topic_id bigint NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    key text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: material_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_kind text NOT NULL,
    target_id uuid NOT NULL,
    stars smallint NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT material_ratings_stars_check CHECK (((stars >= 1) AND (stars <= 5))),
    CONSTRAINT material_ratings_target_kind_check CHECK ((target_kind = ANY (ARRAY['content_page'::text, 'lfk_exercise'::text, 'lfk_complex'::text])))
);


--
-- Name: media_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_name text NOT NULL,
    stored_path text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    s3_key text,
    status text DEFAULT 'ready'::text NOT NULL,
    delete_attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone,
    display_name text,
    folder_id uuid,
    preview_status text DEFAULT 'pending'::text NOT NULL,
    preview_sm_key text,
    preview_md_key text,
    preview_attempts integer DEFAULT 0 NOT NULL,
    preview_next_attempt_at timestamp with time zone,
    source_width integer,
    source_height integer,
    video_processing_status text,
    video_processing_error text,
    hls_master_playlist_s3_key text,
    hls_artifact_prefix text,
    poster_s3_key text,
    video_duration_seconds integer,
    available_qualities_json jsonb,
    video_delivery_override text,
    usage_purpose text,
    CONSTRAINT media_files_preview_status_check CHECK ((preview_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT media_files_size_bytes_check CHECK (((size_bytes >= 0) AND (size_bytes <= '3221225472'::bigint))),
    CONSTRAINT media_files_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'pending'::text, 'deleting'::text, 'pending_delete'::text]))),
    CONSTRAINT media_files_usage_purpose_check CHECK (((usage_purpose IS NULL) OR (usage_purpose = ANY (ARRAY['program_item_submission'::text])))),
    CONSTRAINT media_files_video_delivery_override_check CHECK (((video_delivery_override IS NULL) OR (video_delivery_override = ANY (ARRAY['mp4'::text, 'hls'::text, 'auto'::text])))),
    CONSTRAINT media_files_video_processing_status_check CHECK (((video_processing_status IS NULL) OR (video_processing_status = ANY (ARRAY['none'::text, 'pending'::text, 'processing'::text, 'ready'::text, 'failed'::text]))))
);


--
-- Name: media_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    name_normalized text GENERATED ALWAYS AS (lower(TRIM(BOTH FROM name))) STORED,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'standard'::text NOT NULL,
    patient_user_id uuid,
    CONSTRAINT media_folders_check CHECK (((parent_id IS NULL) OR (parent_id <> id))),
    CONSTRAINT media_folders_kind_check CHECK ((kind = ANY (ARRAY['standard'::text, 'client_files_root'::text, 'client_patient'::text]))),
    CONSTRAINT media_folders_name_check CHECK (((length(TRIM(BOTH FROM name)) > 0) AND (char_length(name) <= 180)))
);


--
-- Name: media_hls_proxy_error_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_hls_proxy_error_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reason_code text NOT NULL,
    http_status smallint,
    artifact_kind text NOT NULL,
    object_suffix text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_hls_proxy_error_events_artifact_check CHECK ((artifact_kind = ANY (ARRAY['master'::text, 'variant'::text, 'segment'::text]))),
    CONSTRAINT media_hls_proxy_error_events_reason_check CHECK ((reason_code = ANY (ARRAY['session_unauthorized'::text, 'feature_disabled'::text, 'media_not_readable'::text, 'forbidden_path'::text, 'missing_object'::text, 'upstream_403'::text, 's3_read_failed'::text, 'upstream_timeout'::text, 'range_not_satisfiable'::text, 'playlist_read_failed'::text, 'playlist_rewrite_failed'::text, 'internal_error'::text])))
);


--
-- Name: media_playback_client_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_client_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_id uuid NOT NULL,
    user_id uuid NOT NULL,
    event_class text NOT NULL,
    delivery text,
    error_detail text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_playback_client_events_delivery_check CHECK (((delivery IS NULL) OR (delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text])))),
    CONSTRAINT media_playback_client_events_event_class_check CHECK ((event_class = ANY (ARRAY['hls_fatal'::text, 'video_error'::text, 'hls_import_failed'::text, 'playback_refetch_failed'::text, 'playback_refetch_exception'::text, 'hls_js_unsupported'::text])))
);


--
-- Name: media_playback_resolution_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_resolution_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    media_id uuid NOT NULL,
    delivery text NOT NULL,
    fallback_used boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_playback_resolution_events_delivery_check CHECK ((delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text])))
);


--
-- Name: media_playback_stats_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_stats_hourly (
    bucket_hour timestamp with time zone NOT NULL,
    delivery text NOT NULL,
    resolved_count integer DEFAULT 0 NOT NULL,
    fallback_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT media_playback_stats_hourly_delivery_check CHECK ((delivery = ANY (ARRAY['hls'::text, 'mp4'::text, 'file'::text])))
);


--
-- Name: media_playback_user_video_first_resolve; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_user_video_first_resolve (
    user_id uuid NOT NULL,
    media_id uuid NOT NULL,
    first_resolved_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_transcode_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_transcode_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    last_error text,
    next_attempt_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_started_at timestamp with time zone,
    finished_at timestamp with time zone,
    CONSTRAINT media_transcode_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: media_upload_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_upload_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_id uuid NOT NULL,
    s3_key text NOT NULL,
    upload_id text NOT NULL,
    owner_user_id uuid NOT NULL,
    status text DEFAULT 'initiated'::text NOT NULL,
    expected_size_bytes bigint NOT NULL,
    mime_type text NOT NULL,
    part_size_bytes integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    aborted_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_upload_sessions_expected_size_bytes_check CHECK ((expected_size_bytes > 0)),
    CONSTRAINT media_upload_sessions_part_size_bytes_check CHECK (((part_size_bytes >= 1) AND (part_size_bytes <= 536870912))),
    CONSTRAINT media_upload_sessions_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text, 'completed'::text, 'aborted'::text, 'expired'::text, 'failed'::text])))
);


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
    platform_user_id uuid,
    CONSTRAINT message_log_outcome_check CHECK ((outcome = ANY (ARRAY['sent'::text, 'partial'::text, 'failed'::text])))
);


--
-- Name: motivational_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motivational_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    body_text text NOT NULL,
    author text,
    is_active boolean DEFAULT true NOT NULL,
    archived_at timestamp with time zone,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_delivery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    integrator_user_id text,
    topic_code text,
    intent_type text,
    channel text NOT NULL,
    status text NOT NULL,
    reason text,
    provider_status_code integer,
    event_id text,
    occurrence_id uuid,
    endpoint_hash text,
    recipient_ref text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: online_intake_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_intake_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    question_id text NOT NULL,
    ordinal integer NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: online_intake_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_intake_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    attachment_type text NOT NULL,
    s3_key text,
    url text,
    mime_type text,
    size_bytes bigint,
    original_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT online_intake_attachments_attachment_type_check CHECK ((attachment_type = ANY (ARRAY['file'::text, 'url'::text]))),
    CONSTRAINT online_intake_attachments_check CHECK ((((attachment_type = 'file'::text) AND (s3_key IS NOT NULL)) OR ((attachment_type = 'url'::text) AND (url IS NOT NULL))))
);


--
-- Name: online_intake_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_intake_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT online_intake_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_review'::text, 'contacted'::text, 'closed'::text]))),
    CONSTRAINT online_intake_requests_type_check CHECK ((type = ANY (ARRAY['lfk'::text, 'nutrition'::text])))
);


--
-- Name: online_intake_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_intake_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid,
    note text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operator_health_alert_sent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_health_alert_sent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dedup_key text NOT NULL,
    severity text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operator_health_failure_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_health_failure_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    archived_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_by_user_id uuid,
    health_probe text NOT NULL,
    source_kind text NOT NULL,
    source_id text NOT NULL,
    severity_at_archive text DEFAULT 'dead'::text NOT NULL,
    doctor_user_id uuid,
    summary_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_error_truncated text
);


--
-- Name: operator_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dedup_key text NOT NULL,
    direction text NOT NULL,
    integration text NOT NULL,
    error_class text NOT NULL,
    error_detail text,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    resolved_at timestamp with time zone,
    alert_sent_at timestamp with time zone
);


--
-- Name: operator_job_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_job_status (
    job_key text NOT NULL,
    job_family text NOT NULL,
    last_status text NOT NULL,
    last_started_at timestamp with time zone,
    last_finished_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    last_duration_ms integer,
    last_error text,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: outgoing_delivery_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outgoing_delivery_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    kind text NOT NULL,
    channel text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 6 NOT NULL,
    next_retry_at timestamp with time zone NOT NULL,
    last_attempt_at timestamp with time zone,
    sent_at timestamp with time zone,
    dead_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    failure_class text,
    CONSTRAINT outgoing_delivery_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed_retryable'::text, 'dead'::text])))
);


--
-- Name: patient_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_bookings (
    id uuid NOT NULL,
    platform_user_id uuid,
    booking_type text NOT NULL,
    city text,
    category text NOT NULL,
    slot_start timestamp with time zone NOT NULL,
    slot_end timestamp with time zone NOT NULL,
    status text NOT NULL,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    rubitime_id text,
    gcal_event_id text,
    contact_phone text NOT NULL,
    contact_email text,
    contact_name text NOT NULL,
    reminder_24h_sent boolean DEFAULT false NOT NULL,
    reminder_2h_sent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    service_id uuid,
    branch_service_id uuid,
    city_code_snapshot text,
    branch_title_snapshot text,
    service_title_snapshot text,
    duration_minutes_snapshot integer,
    price_minor_snapshot integer,
    rubitime_branch_id_snapshot text,
    rubitime_cooperator_id_snapshot text,
    rubitime_service_id_snapshot text,
    source text DEFAULT 'native'::text NOT NULL,
    compat_quality text,
    provenance_created_by text,
    provenance_updated_by text,
    rubitime_manage_url text,
    canonical_appointment_id uuid,
    CONSTRAINT patient_bookings_booking_type_check CHECK ((booking_type = ANY (ARRAY['in_person'::text, 'online'::text]))),
    CONSTRAINT patient_bookings_category_check CHECK ((category = ANY (ARRAY['rehab_lfk'::text, 'nutrition'::text, 'general'::text]))),
    CONSTRAINT patient_bookings_check CHECK ((slot_end > slot_start)),
    CONSTRAINT patient_bookings_compat_quality_check CHECK ((compat_quality = ANY (ARRAY['full'::text, 'partial'::text, 'minimal'::text]))),
    CONSTRAINT patient_bookings_platform_user_native_required CHECK (((source <> 'native'::text) OR (platform_user_id IS NOT NULL))),
    CONSTRAINT patient_bookings_source_check CHECK ((source = ANY (ARRAY['native'::text, 'rubitime_projection'::text]))),
    CONSTRAINT patient_bookings_status_check CHECK ((status = ANY (ARRAY['creating'::text, 'awaiting_payment'::text, 'confirmed'::text, 'cancelling'::text, 'cancel_failed'::text, 'cancelled'::text, 'rescheduled'::text, 'completed'::text, 'no_show'::text, 'failed_sync'::text])))
);


--
-- Name: COLUMN patient_bookings.provenance_created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.patient_bookings.provenance_created_by IS 'Origin of create: e.g. rubitime_external, patient_native';


--
-- Name: COLUMN patient_bookings.provenance_updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.patient_bookings.provenance_updated_by IS 'Last external sync actor hint: e.g. rubitime_external';


--
-- Name: COLUMN patient_bookings.rubitime_manage_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.patient_bookings.rubitime_manage_url IS 'HTTPS URL to manage this record in Rubitime (from webhook payload or create-record response).';


--
-- Name: patient_content_rating_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_content_rating_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content_page_id uuid NOT NULL,
    rating_value smallint NOT NULL,
    reason_codes jsonb NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pcrf_rating_value_check CHECK (((rating_value >= 1) AND (rating_value <= 5)))
);


--
-- Name: patient_daily_warmup_presentations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_daily_warmup_presentations (
    user_id uuid NOT NULL,
    content_page_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_rotation_at timestamp with time zone,
    skip_next_scheduled_rotation boolean DEFAULT false NOT NULL
);


--
-- Name: patient_daily_warmup_video_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_daily_warmup_video_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content_page_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_diary_day_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_diary_day_snapshots (
    platform_user_id uuid NOT NULL,
    local_date date NOT NULL,
    iana text NOT NULL,
    warmup_slot_limit integer NOT NULL,
    warmup_done_count integer NOT NULL,
    warmup_all_done boolean NOT NULL,
    plan_instance_id uuid,
    plan_item_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    plan_done_mask jsonb DEFAULT '[]'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_home_block_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_home_block_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_code text NOT NULL,
    target_type text NOT NULL,
    target_ref text NOT NULL,
    title_override text,
    subtitle_override text,
    image_url_override text,
    badge_label text,
    is_visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    show_title boolean DEFAULT true NOT NULL,
    CONSTRAINT patient_home_block_items_target_type_check CHECK ((target_type = ANY (ARRAY['content_page'::text, 'content_section'::text, 'course'::text, 'static_action'::text])))
);


--
-- Name: patient_home_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_home_blocks (
    code text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon_image_url text
);


--
-- Name: patient_lfk_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_lfk_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_user_id uuid NOT NULL,
    template_id uuid NOT NULL,
    complex_id uuid,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: patient_merge_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_merge_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    anchor_user_id uuid NOT NULL,
    candidate_user_id uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    trigger_appointment_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    CONSTRAINT patient_merge_candidates_distinct_users CHECK ((anchor_user_id <> candidate_user_id)),
    CONSTRAINT patient_merge_candidates_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])))
);


--
-- Name: patient_practice_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_practice_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content_page_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    feeling smallint,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT ppc_feeling_check CHECK (((feeling IS NULL) OR ((feeling >= 1) AND (feeling <= 5)))),
    CONSTRAINT ppc_source_check CHECK ((source = ANY (ARRAY['home'::text, 'reminder'::text, 'section_page'::text, 'daily_warmup'::text])))
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    verify_attempts smallint DEFAULT 0 NOT NULL
);


--
-- Name: phone_messenger_bind_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_messenger_bind_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    phone_normalized text NOT NULL,
    channel_code text NOT NULL,
    purpose text NOT NULL,
    user_id uuid,
    status text DEFAULT 'pending_contact'::text NOT NULL,
    challenge_id text,
    failure_code text,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT phone_messenger_bind_secrets_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text]))),
    CONSTRAINT phone_messenger_bind_secrets_purpose_check CHECK ((purpose = ANY (ARRAY['login'::text, 'profile_bind'::text]))),
    CONSTRAINT phone_messenger_bind_secrets_status_check CHECK ((status = ANY (ARRAY['pending_contact'::text, 'otp_ready'::text, 'failed'::text, 'consumed'::text, 'expired'::text])))
);


--
-- Name: phone_otp_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_otp_locks (
    phone_normalized text NOT NULL,
    locked_until bigint NOT NULL
);


--
-- Name: platform_user_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_user_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_user_id uuid NOT NULL,
    contact_type text NOT NULL,
    value text NOT NULL,
    value_normalized text NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_user_contacts_source_check CHECK ((source = ANY (ARRAY['merge'::text, 'booking'::text, 'doctor'::text, 'admin'::text]))),
    CONSTRAINT platform_user_contacts_type_check CHECK ((contact_type = ANY (ARRAY['phone'::text, 'email'::text, 'whatsapp'::text, 'telegram'::text, 'max'::text, 'vk'::text, 'other'::text])))
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
    first_name text,
    last_name text,
    email text,
    email_verified_at timestamp with time zone,
    is_blocked boolean DEFAULT false NOT NULL,
    blocked_at timestamp with time zone,
    blocked_reason text,
    blocked_by uuid,
    is_archived boolean DEFAULT false NOT NULL,
    merged_into_id uuid,
    patient_phone_trust_at timestamp with time zone,
    calendar_timezone text,
    reminder_muted_until timestamp with time zone,
    merged_at timestamp with time zone,
    email_normalized text,
    CONSTRAINT platform_users_no_self_merge CHECK (((merged_into_id IS NULL) OR (merged_into_id <> id))),
    CONSTRAINT platform_users_role_check CHECK ((role = ANY (ARRAY['client'::text, 'doctor'::text, 'admin'::text])))
);


--
-- Name: COLUMN platform_users.patient_phone_trust_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_users.patient_phone_trust_at IS 'Set only via trusted writers (OTP, integrator projections, OAuth-verified phone). Used for client patient-tier; not implied by phone_normalized alone.';


--
-- Name: product_analytics_events_recent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_analytics_events_recent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    entry_channel text NOT NULL,
    page_key text,
    user_id uuid,
    client_session_id text,
    push_tracking_id uuid,
    topic_code text,
    push_kind text,
    warmup_slogan_key text,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: product_analytics_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_analytics_hourly (
    bucket_hour timestamp with time zone NOT NULL,
    event_type text NOT NULL,
    entry_channel text NOT NULL,
    page_key text NOT NULL,
    topic_code text NOT NULL,
    push_kind text NOT NULL,
    warmup_slogan_key text NOT NULL,
    event_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_analytics_user_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_analytics_user_hourly (
    bucket_hour timestamp with time zone NOT NULL,
    user_id uuid NOT NULL,
    entry_channel text NOT NULL,
    page_key text NOT NULL,
    app_opens integer DEFAULT 0 NOT NULL,
    page_views integer DEFAULT 0 NOT NULL,
    push_opens integer DEFAULT 0 NOT NULL,
    active_minutes integer DEFAULT 0 NOT NULL,
    last_seen_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_push_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_push_notifications (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    topic_code text,
    intent_type text,
    occurrence_id uuid,
    push_kind text,
    warmup_slogan_key text,
    warmup_slogan_text text,
    open_url text,
    title text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: program_action_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_action_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    instance_stage_item_id uuid NOT NULL,
    patient_user_id uuid NOT NULL,
    session_id uuid,
    action_type text NOT NULL,
    payload jsonb,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT program_action_log_action_type_check CHECK ((action_type = ANY (ARRAY['done'::text, 'viewed'::text, 'note'::text])))
);


--
-- Name: program_item_discussion_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_item_discussion_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_stage_item_id uuid NOT NULL,
    patient_user_id uuid NOT NULL,
    sender_role text NOT NULL,
    origin text NOT NULL,
    body text,
    media_file_id uuid,
    support_message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT program_item_discussion_messages_origin_check CHECK ((origin = ANY (ARRAY['patient_observation'::text, 'support_admin_reply'::text]))),
    CONSTRAINT program_item_discussion_messages_payload_check CHECK (((body IS NOT NULL) OR (media_file_id IS NOT NULL))),
    CONSTRAINT program_item_discussion_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['patient'::text, 'admin'::text])))
);


--
-- Name: program_item_discussion_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_item_discussion_reads (
    patient_user_id uuid NOT NULL,
    instance_stage_item_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projection_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projection_outbox (
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
-- Name: projection_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projection_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projection_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projection_outbox_id_seq OWNED BY public.projection_outbox.id;


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
-- Name: recommendation_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendation_regions (
    recommendation_id uuid NOT NULL,
    body_region_id uuid NOT NULL
);


--
-- Name: recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body_md text NOT NULL,
    media jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[],
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_region_id uuid,
    quantity_text text,
    frequency_text text,
    duration_text text,
    domain text
);


--
-- Name: reference_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    is_user_extensible boolean DEFAULT false NOT NULL,
    owner_id uuid,
    tenant_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reference_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    meta_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: COLUMN reference_items.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reference_items.deleted_at IS 'Soft delete timestamp; NULL means not deleted.';


--
-- Name: reminder_delivery_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_delivery_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_delivery_log_id text NOT NULL,
    integrator_occurrence_id text NOT NULL,
    integrator_rule_id text NOT NULL,
    integrator_user_id bigint NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    error_code text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reminder_journal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_journal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid NOT NULL,
    occurrence_id text,
    action text NOT NULL,
    snooze_until timestamp with time zone,
    skip_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reminder_journal_action_check CHECK ((action = ANY (ARRAY['done'::text, 'skipped'::text, 'snoozed'::text]))),
    CONSTRAINT reminder_journal_check CHECK ((((action = 'snoozed'::text) AND (snooze_until IS NOT NULL)) OR ((action <> 'snoozed'::text) AND (snooze_until IS NULL)))),
    CONSTRAINT reminder_journal_skip_reason_check CHECK (((skip_reason IS NULL) OR (length(skip_reason) <= 500)))
);


--
-- Name: reminder_occurrence_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_occurrence_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_occurrence_id text NOT NULL,
    integrator_rule_id text NOT NULL,
    integrator_user_id bigint NOT NULL,
    category text NOT NULL,
    status text NOT NULL,
    delivery_channel text,
    error_code text,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_at timestamp with time zone,
    snoozed_at timestamp with time zone,
    snoozed_until timestamp with time zone,
    skipped_at timestamp with time zone,
    skip_reason text,
    CONSTRAINT chk_reminder_occurrence_skip_reason_len CHECK (((skip_reason IS NULL) OR (length(skip_reason) <= 500))),
    CONSTRAINT chk_reminder_occurrence_snooze_pair CHECK ((((snoozed_at IS NULL) AND (snoozed_until IS NULL)) OR ((snoozed_at IS NOT NULL) AND (snoozed_until IS NOT NULL)))),
    CONSTRAINT reminder_occurrence_history_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])))
);


--
-- Name: reminder_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_rule_id text NOT NULL,
    platform_user_id uuid,
    integrator_user_id bigint,
    category text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    schedule_type text DEFAULT 'interval_window'::text NOT NULL,
    timezone text DEFAULT 'Europe/Moscow'::text NOT NULL,
    interval_minutes integer NOT NULL,
    window_start_minute integer NOT NULL,
    window_end_minute integer NOT NULL,
    days_mask text DEFAULT '1111111'::text NOT NULL,
    content_mode text DEFAULT 'none'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    linked_object_type text,
    linked_object_id text,
    custom_title text,
    custom_text text,
    schedule_data jsonb,
    reminder_intent text DEFAULT 'generic'::text,
    display_title text,
    display_description text,
    quiet_hours_start_minute integer,
    quiet_hours_end_minute integer,
    notification_topic_code text,
    CONSTRAINT chk_reminder_rules_custom_only_for_custom_type CHECK (((linked_object_type = 'custom'::text) OR ((custom_title IS NULL) AND (custom_text IS NULL)))),
    CONSTRAINT chk_reminder_rules_custom_required CHECK (((linked_object_type IS DISTINCT FROM 'custom'::text) OR ((custom_title IS NOT NULL) AND (btrim(custom_title) <> ''::text)))),
    CONSTRAINT chk_reminder_rules_display_rehab_only CHECK (((linked_object_type = 'rehab_program'::text) OR ((display_title IS NULL) AND (display_description IS NULL)))),
    CONSTRAINT chk_reminder_rules_linked_object_type CHECK (((linked_object_type IS NULL) OR (linked_object_type = ANY (ARRAY['lfk_complex'::text, 'content_section'::text, 'content_page'::text, 'custom'::text, 'rehab_program'::text])))),
    CONSTRAINT chk_reminder_rules_object_id_required CHECK (((linked_object_type IS NULL) OR (linked_object_type = 'custom'::text) OR ((linked_object_id IS NOT NULL) AND (btrim(linked_object_id) <> ''::text))))
);


--
-- Name: COLUMN reminder_rules.quiet_hours_start_minute; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminder_rules.quiet_hours_start_minute IS 'Minute 0-1439 inclusive; NULL if quiet hours disabled';


--
-- Name: COLUMN reminder_rules.quiet_hours_end_minute; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminder_rules.quiet_hours_end_minute IS 'Minute 1-1440 (exclusive upper like window_end_minute); NULL if quiet hours disabled';


--
-- Name: rubitime_api_throttle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubitime_api_throttle (
    id smallint NOT NULL,
    last_completed_at timestamp with time zone DEFAULT '1970-01-01 01:00:00+01'::timestamp with time zone NOT NULL,
    CONSTRAINT rubitime_api_throttle_id_check CHECK ((id = 1))
);


--
-- Name: rubitime_booking_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubitime_booking_profiles (
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
-- Name: rubitime_booking_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rubitime_booking_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_booking_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rubitime_booking_profiles_id_seq OWNED BY public.rubitime_booking_profiles.id;


--
-- Name: rubitime_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubitime_branches (
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
-- Name: rubitime_branches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rubitime_branches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_branches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rubitime_branches_id_seq OWNED BY public.rubitime_branches.id;


--
-- Name: rubitime_cooperators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubitime_cooperators (
    id bigint NOT NULL,
    rubitime_cooperator_id integer NOT NULL,
    title text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rubitime_cooperators_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rubitime_cooperators_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_cooperators_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rubitime_cooperators_id_seq OWNED BY public.rubitime_cooperators.id;


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
    gcal_event_id text,
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
-- Name: rubitime_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubitime_services (
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
-- Name: rubitime_services_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rubitime_services_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rubitime_services_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rubitime_services_id_seq OWNED BY public.rubitime_services.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: specialist_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.specialist_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    patient_user_id uuid,
    title text NOT NULL,
    description text,
    due_at timestamp with time zone,
    remind_at timestamp with time zone,
    is_important boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    reminder_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: support_conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_conversation_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_message_id text NOT NULL,
    conversation_id uuid NOT NULL,
    sender_role text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    text text NOT NULL,
    source text NOT NULL,
    external_chat_id text,
    external_message_id text,
    delivery_status text,
    created_at timestamp with time zone NOT NULL,
    media_url text,
    media_type text,
    read_at timestamp with time zone,
    delivered_at timestamp with time zone
);


--
-- Name: support_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_conversation_id text NOT NULL,
    platform_user_id uuid,
    integrator_user_id bigint,
    source text NOT NULL,
    admin_scope text NOT NULL,
    status text NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    last_message_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    close_reason text,
    channel_code text,
    channel_external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_delivery_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_delivery_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_message_id uuid,
    integrator_intent_event_id text,
    correlation_id text,
    channel_code text NOT NULL,
    status text NOT NULL,
    attempt integer NOT NULL,
    reason text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL
);


--
-- Name: support_question_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_question_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_question_message_id text NOT NULL,
    question_id uuid NOT NULL,
    sender_role text NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: support_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_question_id text NOT NULL,
    conversation_id uuid,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
    platform_user_id uuid NOT NULL,
    patient_practice_completion_id uuid,
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    symptom_type_ref_id uuid,
    region_ref_id uuid,
    side text,
    diagnosis_text text,
    diagnosis_ref_id uuid,
    stage_ref_id uuid,
    deleted_at timestamp with time zone,
    platform_user_id uuid NOT NULL,
    CONSTRAINT symptom_trackings_side_check CHECK (((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))))
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    value_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT system_settings_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])))
);


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
-- Name: test_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_stage_item_id uuid NOT NULL,
    patient_user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    accepted_at timestamp with time zone,
    accepted_by uuid
);


--
-- Name: test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    test_id uuid NOT NULL,
    raw_value jsonb NOT NULL,
    normalized_decision text NOT NULL,
    decided_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT test_results_normalized_decision_check CHECK ((normalized_decision = ANY (ARRAY['passed'::text, 'failed'::text, 'partial'::text])))
);


--
-- Name: test_set_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_set_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_set_id uuid NOT NULL,
    test_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    comment text
);


--
-- Name: test_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    publication_status text DEFAULT 'draft'::text NOT NULL,
    CONSTRAINT test_sets_publication_status_check CHECK ((publication_status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    test_type text,
    media jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[],
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scoring jsonb,
    raw_text text,
    assessment_kind text,
    body_region_id uuid
);


--
-- Name: treatment_program_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    actor_id uuid,
    event_type text NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treatment_program_events_event_type_check CHECK ((event_type = ANY (ARRAY['item_added'::text, 'item_removed'::text, 'item_disabled'::text, 'item_enabled'::text, 'item_replaced'::text, 'comment_changed'::text, 'stage_added'::text, 'stage_removed'::text, 'stage_skipped'::text, 'stage_completed'::text, 'status_changed'::text, 'test_completed'::text, 'program_changed'::text]))),
    CONSTRAINT treatment_program_events_target_type_check CHECK ((target_type = ANY (ARRAY['stage'::text, 'stage_item'::text, 'program'::text])))
);


--
-- Name: treatment_program_instance_stage_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_instance_stage_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    source_group_id uuid,
    title text NOT NULL,
    description text,
    schedule_text text,
    sort_order integer DEFAULT 0 NOT NULL,
    system_kind text,
    CONSTRAINT treatment_program_instance_stage_groups_system_kind_check CHECK (((system_kind IS NULL) OR (system_kind = ANY (ARRAY['recommendations'::text, 'tests'::text]))))
);


--
-- Name: treatment_program_instance_stage_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_instance_stage_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    item_type text NOT NULL,
    item_ref_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    comment text,
    local_comment text,
    settings jsonb,
    snapshot jsonb NOT NULL,
    completed_at timestamp with time zone,
    is_actionable boolean,
    status text DEFAULT 'active'::text NOT NULL,
    group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_viewed_at timestamp with time zone,
    CONSTRAINT treatment_program_instance_stage_items_item_type_check CHECK ((item_type = ANY (ARRAY['exercise'::text, 'recommendation'::text, 'lesson'::text, 'clinical_test'::text]))),
    CONSTRAINT treatment_program_instance_stage_items_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);


--
-- Name: treatment_program_instance_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_instance_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    source_stage_id uuid,
    title text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    local_comment text,
    status text NOT NULL,
    skip_reason text,
    goals text,
    objectives text,
    expected_duration_days integer,
    expected_duration_text text,
    started_at timestamp with time zone,
    CONSTRAINT treatment_program_instance_stages_status_check CHECK ((status = ANY (ARRAY['locked'::text, 'available'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text])))
);


--
-- Name: treatment_program_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    patient_user_id uuid NOT NULL,
    assigned_by uuid,
    title text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    patient_plan_last_opened_at timestamp with time zone,
    assignment_source text NOT NULL,
    CONSTRAINT treatment_program_instances_assignment_source_check CHECK ((assignment_source = ANY (ARRAY['doctor'::text, 'promo'::text, 'course'::text]))),
    CONSTRAINT treatment_program_instances_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text])))
);


--
-- Name: treatment_program_template_stage_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_template_stage_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    schedule_text text,
    sort_order integer DEFAULT 0 NOT NULL,
    system_kind text,
    CONSTRAINT treatment_program_template_stage_groups_system_kind_check CHECK (((system_kind IS NULL) OR (system_kind = ANY (ARRAY['recommendations'::text, 'tests'::text]))))
);


--
-- Name: treatment_program_template_stage_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_template_stage_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    item_type text NOT NULL,
    item_ref_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    comment text,
    settings jsonb,
    group_id uuid,
    CONSTRAINT treatment_program_template_stage_items_item_type_check CHECK ((item_type = ANY (ARRAY['exercise'::text, 'recommendation'::text, 'lesson'::text, 'clinical_test'::text])))
);


--
-- Name: treatment_program_template_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_template_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    goals text,
    objectives text,
    expected_duration_days integer,
    expected_duration_text text
);


--
-- Name: treatment_program_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_program_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treatment_program_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: user_channel_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_channel_bindings (
    user_id uuid NOT NULL,
    channel_code text NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bot_blocked_at timestamp with time zone,
    bot_blocked_reason text,
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
    is_preferred_for_auth boolean DEFAULT false NOT NULL,
    platform_user_id uuid NOT NULL,
    CONSTRAINT user_channel_preferences_channel_code_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text, 'sms'::text, 'email'::text, 'web_push'::text])))
);


--
-- Name: user_email_setup_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_email_setup_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_normalized text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    source text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_email_setup_tokens_source_check CHECK ((source = ANY (ARRAY['rubitime'::text, 'doctor_profile'::text, 'manual_resend'::text, 'registration_claim'::text])))
);


--
-- Name: user_notification_topic_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_topic_channels (
    user_id uuid NOT NULL,
    topic_code text NOT NULL,
    channel_code text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_notification_topic_channels_channel_check CHECK ((channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'email'::text, 'web_push'::text])))
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
-- Name: user_oauth_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_oauth_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_user_id text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_oauth_bindings_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'apple'::text, 'yandex'::text])))
);


--
-- Name: user_password_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_password_credentials (
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    algo text DEFAULT 'argon2id'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_phone_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_phone_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_user_id uuid NOT NULL,
    phone_normalized text NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_to timestamp with time zone,
    source text NOT NULL,
    CONSTRAINT user_phone_history_source_check CHECK ((source = ANY (ARRAY['otp'::text, 'messenger'::text, 'merge'::text, 'admin'::text, 'projection'::text])))
);


--
-- Name: user_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_pins (
    user_id uuid NOT NULL,
    pin_hash text NOT NULL,
    attempts_failed smallint DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


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
-- Name: user_subscriptions_webapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions_webapp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_user_id bigint NOT NULL,
    integrator_topic_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_web_push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_web_push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    merged_into_user_id bigint,
    CONSTRAINT users_merged_into_user_id_not_self_check CHECK (((merged_into_user_id IS NULL) OR (merged_into_user_id <> id)))
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
-- Name: webapp_reminder_occurrences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webapp_reminder_occurrences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integrator_rule_id text NOT NULL,
    platform_user_id uuid NOT NULL,
    occurrence_key text NOT NULL,
    planned_at timestamp with time zone NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    sent_at timestamp with time zone,
    failed_at timestamp with time zone,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: webapp_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webapp_schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_calendar_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_calendar_map ALTER COLUMN id SET DEFAULT nextval('public.booking_calendar_map_id_seq'::regclass);


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
-- Name: integration_data_quality_incidents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_data_quality_incidents ALTER COLUMN id SET DEFAULT nextval('public.integration_data_quality_incidents_id_seq'::regclass);


--
-- Name: integrator_push_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrator_push_outbox ALTER COLUMN id SET DEFAULT nextval('public.integrator_push_outbox_id_seq'::regclass);


--
-- Name: mailing_topics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: mailings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailings ALTER COLUMN id SET DEFAULT nextval('public.mailings_id_seq'::regclass);


--
-- Name: projection_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projection_outbox ALTER COLUMN id SET DEFAULT nextval('public.projection_outbox_id_seq'::regclass);


--
-- Name: rubitime_booking_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_booking_profiles ALTER COLUMN id SET DEFAULT nextval('public.rubitime_booking_profiles_id_seq'::regclass);


--
-- Name: rubitime_branches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_branches ALTER COLUMN id SET DEFAULT nextval('public.rubitime_branches_id_seq'::regclass);


--
-- Name: rubitime_cooperators id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_cooperators ALTER COLUMN id SET DEFAULT nextval('public.rubitime_cooperators_id_seq'::regclass);


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
-- Name: rubitime_services id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_services ALTER COLUMN id SET DEFAULT nextval('public.rubitime_services_id_seq'::regclass);


--
-- Name: telegram_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_users ALTER COLUMN id SET DEFAULT nextval('public.telegram_users_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: appointment_records appointment_records_integrator_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_records
    ADD CONSTRAINT appointment_records_integrator_record_id_key UNIQUE (integrator_record_id);


--
-- Name: appointment_records appointment_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_records
    ADD CONSTRAINT appointment_records_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_cancellations be_appointment_cancellations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_events be_appointment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_events
    ADD CONSTRAINT be_appointment_events_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_history_events be_appointment_history_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_history_events
    ADD CONSTRAINT be_appointment_history_events_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_reschedules be_appointment_reschedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_pkey PRIMARY KEY (id);


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_pkey PRIMARY KEY (id);


--
-- Name: be_appointments be_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_pkey PRIMARY KEY (id);


--
-- Name: be_appointments be_appointments_specialist_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_specialist_no_overlap EXCLUDE USING gist (specialist_id WITH =, tstzrange(start_at, end_at, '[)'::text) WITH &&) WHERE (((specialist_id IS NOT NULL) AND (status <> ALL (ARRAY['cancelled_by_patient'::text, 'cancelled_by_specialist'::text, 'late_cancellation'::text, 'no_show'::text, 'completed'::text, 'visit_confirmed'::text]))));


--
-- Name: be_availability_rules be_availability_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_availability_rules
    ADD CONSTRAINT be_availability_rules_pkey PRIMARY KEY (id);


--
-- Name: be_booking_form_fields be_booking_form_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_fields
    ADD CONSTRAINT be_booking_form_fields_pkey PRIMARY KEY (id);


--
-- Name: be_booking_form_submissions be_booking_form_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT be_booking_form_submissions_pkey PRIMARY KEY (id);


--
-- Name: be_branches be_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_branches
    ADD CONSTRAINT be_branches_pkey PRIMARY KEY (id);


--
-- Name: be_cancellation_policies be_cancellation_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_cancellation_policies
    ADD CONSTRAINT be_cancellation_policies_pkey PRIMARY KEY (id);


--
-- Name: be_clinic_services be_clinic_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_clinic_services
    ADD CONSTRAINT be_clinic_services_pkey PRIMARY KEY (id);


--
-- Name: be_external_entity_mappings be_external_entity_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_external_entity_mappings
    ADD CONSTRAINT be_external_entity_mappings_pkey PRIMARY KEY (id);


--
-- Name: be_organizations be_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_organizations
    ADD CONSTRAINT be_organizations_pkey PRIMARY KEY (id);


--
-- Name: be_package_history_events be_package_history_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_history_events
    ADD CONSTRAINT be_package_history_events_pkey PRIMARY KEY (id);


--
-- Name: be_package_items be_package_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_items
    ADD CONSTRAINT be_package_items_pkey PRIMARY KEY (id);


--
-- Name: be_package_usages be_package_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_pkey PRIMARY KEY (id);


--
-- Name: be_patient_booking_profiles be_patient_booking_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_booking_profiles
    ADD CONSTRAINT be_patient_booking_profiles_pkey PRIMARY KEY (id);


--
-- Name: be_patient_package_items be_patient_package_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_package_items
    ADD CONSTRAINT be_patient_package_items_pkey PRIMARY KEY (id);


--
-- Name: be_patient_packages be_patient_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_pkey PRIMARY KEY (id);


--
-- Name: be_patient_timeline_events be_patient_timeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_timeline_events
    ADD CONSTRAINT be_patient_timeline_events_pkey PRIMARY KEY (id);


--
-- Name: be_payment_history_events be_payment_history_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_pkey PRIMARY KEY (id);


--
-- Name: be_payment_intents be_payment_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_intents
    ADD CONSTRAINT be_payment_intents_pkey PRIMARY KEY (id);


--
-- Name: be_payment_provider_events be_payment_provider_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_provider_events
    ADD CONSTRAINT be_payment_provider_events_pkey PRIMARY KEY (id);


--
-- Name: be_payments be_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payments
    ADD CONSTRAINT be_payments_pkey PRIMARY KEY (id);


--
-- Name: be_prepayment_policies be_prepayment_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_prepayment_policies
    ADD CONSTRAINT be_prepayment_policies_pkey PRIMARY KEY (id);


--
-- Name: be_product_history_events be_product_history_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_history_events
    ADD CONSTRAINT be_product_history_events_pkey PRIMARY KEY (id);


--
-- Name: be_product_pay_links be_product_pay_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_pay_links
    ADD CONSTRAINT be_product_pay_links_pkey PRIMARY KEY (id);


--
-- Name: be_product_purchases be_product_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_pkey PRIMARY KEY (id);


--
-- Name: be_products be_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_products
    ADD CONSTRAINT be_products_pkey PRIMARY KEY (id);


--
-- Name: be_refunds be_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_refunds
    ADD CONSTRAINT be_refunds_pkey PRIMARY KEY (id);


--
-- Name: be_reschedule_policies be_reschedule_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_reschedule_policies
    ADD CONSTRAINT be_reschedule_policies_pkey PRIMARY KEY (id);


--
-- Name: be_rooms be_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_rooms
    ADD CONSTRAINT be_rooms_pkey PRIMARY KEY (id);


--
-- Name: be_schedule_blocks be_schedule_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_pkey PRIMARY KEY (id);


--
-- Name: be_service_location_availability be_service_location_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT be_service_location_availability_pkey PRIMARY KEY (id);


--
-- Name: be_specialist_locations be_specialist_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT be_specialist_locations_pkey PRIMARY KEY (id);


--
-- Name: be_specialist_rooms be_specialist_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT be_specialist_rooms_pkey PRIMARY KEY (id);


--
-- Name: be_specialist_service_availability be_specialist_service_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_specialist_service_availability_pkey PRIMARY KEY (id);


--
-- Name: be_specialists be_specialists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialists
    ADD CONSTRAINT be_specialists_pkey PRIMARY KEY (id);


--
-- Name: be_subscription_packages be_subscription_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_subscription_packages
    ADD CONSTRAINT be_subscription_packages_pkey PRIMARY KEY (id);


--
-- Name: be_working_hours be_working_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_pkey PRIMARY KEY (id);


--
-- Name: booking_branch_services booking_branch_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT booking_branch_services_pkey PRIMARY KEY (id);


--
-- Name: booking_branches booking_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branches
    ADD CONSTRAINT booking_branches_pkey PRIMARY KEY (id);


--
-- Name: booking_calendar_map booking_calendar_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_calendar_map
    ADD CONSTRAINT booking_calendar_map_pkey PRIMARY KEY (id);


--
-- Name: booking_calendar_map booking_calendar_map_rubitime_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_calendar_map
    ADD CONSTRAINT booking_calendar_map_rubitime_record_id_key UNIQUE (rubitime_record_id);


--
-- Name: booking_cities booking_cities_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_cities
    ADD CONSTRAINT booking_cities_code_key UNIQUE (code);


--
-- Name: booking_cities booking_cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_cities
    ADD CONSTRAINT booking_cities_pkey PRIMARY KEY (id);


--
-- Name: booking_services booking_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_services
    ADD CONSTRAINT booking_services_pkey PRIMARY KEY (id);


--
-- Name: booking_specialists booking_specialists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_specialists
    ADD CONSTRAINT booking_specialists_pkey PRIMARY KEY (id);


--
-- Name: branches branches_integrator_branch_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_integrator_branch_id_key UNIQUE (integrator_branch_id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: broadcast_audit broadcast_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit
    ADD CONSTRAINT broadcast_audit_pkey PRIMARY KEY (id);


--
-- Name: broadcast_audit_recipients broadcast_audit_recipients_audit_id_platform_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit_recipients
    ADD CONSTRAINT broadcast_audit_recipients_audit_id_platform_user_id_pk PRIMARY KEY (audit_id, platform_user_id);


--
-- Name: channel_link_secrets channel_link_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_link_secrets
    ADD CONSTRAINT channel_link_secrets_pkey PRIMARY KEY (id);


--
-- Name: clinical_test_measure_kinds clinical_test_measure_kinds_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_measure_kinds
    ADD CONSTRAINT clinical_test_measure_kinds_code_key UNIQUE (code);


--
-- Name: clinical_test_measure_kinds clinical_test_measure_kinds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_measure_kinds
    ADD CONSTRAINT clinical_test_measure_kinds_pkey PRIMARY KEY (id);


--
-- Name: clinical_test_regions clinical_test_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_regions
    ADD CONSTRAINT clinical_test_regions_pkey PRIMARY KEY (clinical_test_id, body_region_id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


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
-- Name: content_access_grants_webapp content_access_grants_webapp_integrator_grant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants_webapp
    ADD CONSTRAINT content_access_grants_webapp_integrator_grant_id_key UNIQUE (integrator_grant_id);


--
-- Name: content_access_grants_webapp content_access_grants_webapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants_webapp
    ADD CONSTRAINT content_access_grants_webapp_pkey PRIMARY KEY (id);


--
-- Name: content_pages content_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_pages
    ADD CONSTRAINT content_pages_pkey PRIMARY KEY (id);


--
-- Name: content_pages content_pages_section_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_pages
    ADD CONSTRAINT content_pages_section_slug_key UNIQUE (section, slug);


--
-- Name: content_section_slug_history content_section_slug_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_section_slug_history
    ADD CONSTRAINT content_section_slug_history_pkey PRIMARY KEY (id);


--
-- Name: content_sections content_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_sections
    ADD CONSTRAINT content_sections_pkey PRIMARY KEY (id);


--
-- Name: content_sections content_sections_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_sections
    ADD CONSTRAINT content_sections_slug_key UNIQUE (slug);


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
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: delivery_attempt_logs delivery_attempt_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_attempt_logs
    ADD CONSTRAINT delivery_attempt_logs_pkey PRIMARY KEY (id);


--
-- Name: doctor_notes doctor_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_notes
    ADD CONSTRAINT doctor_notes_pkey PRIMARY KEY (id);


--
-- Name: doctor_patient_support doctor_patient_support_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_support
    ADD CONSTRAINT doctor_patient_support_pkey PRIMARY KEY (id);


--
-- Name: email_challenges email_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_challenges
    ADD CONSTRAINT email_challenges_pkey PRIMARY KEY (id);


--
-- Name: email_send_cooldowns email_send_cooldowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_cooldowns
    ADD CONSTRAINT email_send_cooldowns_pkey PRIMARY KEY (user_id, email_normalized);


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
-- Name: integration_data_quality_incidents integration_data_quality_incidents_dedup; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_data_quality_incidents
    ADD CONSTRAINT integration_data_quality_incidents_dedup UNIQUE (integration, entity, external_id, field, error_reason);


--
-- Name: integration_data_quality_incidents integration_data_quality_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_data_quality_incidents
    ADD CONSTRAINT integration_data_quality_incidents_pkey PRIMARY KEY (id);


--
-- Name: integration_webhook_error_events integration_webhook_error_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_webhook_error_events
    ADD CONSTRAINT integration_webhook_error_events_pkey PRIMARY KEY (id);


--
-- Name: integration_webhook_last_status integration_webhook_last_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_webhook_last_status
    ADD CONSTRAINT integration_webhook_last_status_pkey PRIMARY KEY (source);


--
-- Name: integrator_push_outbox integrator_push_outbox_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrator_push_outbox
    ADD CONSTRAINT integrator_push_outbox_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: integrator_push_outbox integrator_push_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrator_push_outbox
    ADD CONSTRAINT integrator_push_outbox_pkey PRIMARY KEY (id);


--
-- Name: lfk_complex_exercises lfk_complex_exercises_complex_id_exercise_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_exercises
    ADD CONSTRAINT lfk_complex_exercises_complex_id_exercise_id_key UNIQUE (complex_id, exercise_id);


--
-- Name: lfk_complex_exercises lfk_complex_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_exercises
    ADD CONSTRAINT lfk_complex_exercises_pkey PRIMARY KEY (id);


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_template_exercises
    ADD CONSTRAINT lfk_complex_template_exercises_pkey PRIMARY KEY (id);


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_template_id_exercise_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_template_exercises
    ADD CONSTRAINT lfk_complex_template_exercises_template_id_exercise_id_key UNIQUE (template_id, exercise_id);


--
-- Name: lfk_complex_templates lfk_complex_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_templates
    ADD CONSTRAINT lfk_complex_templates_pkey PRIMARY KEY (id);


--
-- Name: lfk_complexes lfk_complexes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_pkey PRIMARY KEY (id);


--
-- Name: lfk_exercise_media lfk_exercise_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_media
    ADD CONSTRAINT lfk_exercise_media_pkey PRIMARY KEY (id);


--
-- Name: lfk_exercise_regions lfk_exercise_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_regions
    ADD CONSTRAINT lfk_exercise_regions_pkey PRIMARY KEY (exercise_id, region_ref_id);


--
-- Name: lfk_exercises lfk_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercises
    ADD CONSTRAINT lfk_exercises_pkey PRIMARY KEY (id);


--
-- Name: lfk_sessions lfk_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_sessions
    ADD CONSTRAINT lfk_sessions_pkey PRIMARY KEY (id);


--
-- Name: login_tokens login_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_tokens
    ADD CONSTRAINT login_tokens_pkey PRIMARY KEY (id);


--
-- Name: login_tokens login_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_tokens
    ADD CONSTRAINT login_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: mailing_logs mailing_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_logs
    ADD CONSTRAINT mailing_logs_pkey PRIMARY KEY (user_id, mailing_id);


--
-- Name: mailing_logs_webapp mailing_logs_webapp_integrator_user_id_integrator_mailing_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_logs_webapp
    ADD CONSTRAINT mailing_logs_webapp_integrator_user_id_integrator_mailing_i_key UNIQUE (integrator_user_id, integrator_mailing_id);


--
-- Name: mailing_logs_webapp mailing_logs_webapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_logs_webapp
    ADD CONSTRAINT mailing_logs_webapp_pkey PRIMARY KEY (id);


--
-- Name: mailing_topics_webapp mailing_topics_webapp_integrator_topic_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics_webapp
    ADD CONSTRAINT mailing_topics_webapp_integrator_topic_id_key UNIQUE (integrator_topic_id);


--
-- Name: mailing_topics_webapp mailing_topics_webapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics_webapp
    ADD CONSTRAINT mailing_topics_webapp_pkey PRIMARY KEY (id);


--
-- Name: mailings mailings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailings
    ADD CONSTRAINT mailings_pkey PRIMARY KEY (id);


--
-- Name: material_ratings material_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_ratings
    ADD CONSTRAINT material_ratings_pkey PRIMARY KEY (id);


--
-- Name: material_ratings material_ratings_user_target_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_ratings
    ADD CONSTRAINT material_ratings_user_target_unique UNIQUE (user_id, target_kind, target_id);


--
-- Name: media_files media_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_pkey PRIMARY KEY (id);


--
-- Name: media_folders media_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_pkey PRIMARY KEY (id);


--
-- Name: media_hls_proxy_error_events media_hls_proxy_error_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_hls_proxy_error_events
    ADD CONSTRAINT media_hls_proxy_error_events_pkey PRIMARY KEY (id);


--
-- Name: media_playback_client_events media_playback_client_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_client_events
    ADD CONSTRAINT media_playback_client_events_pkey PRIMARY KEY (id);


--
-- Name: media_playback_resolution_events media_playback_resolution_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_resolution_events
    ADD CONSTRAINT media_playback_resolution_events_pkey PRIMARY KEY (id);


--
-- Name: media_playback_stats_hourly media_playback_stats_hourly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_stats_hourly
    ADD CONSTRAINT media_playback_stats_hourly_pkey PRIMARY KEY (bucket_hour, delivery);


--
-- Name: media_playback_user_video_first_resolve media_playback_user_video_first_resolve_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_user_video_first_resolve
    ADD CONSTRAINT media_playback_user_video_first_resolve_pkey PRIMARY KEY (user_id, media_id);


--
-- Name: media_transcode_jobs media_transcode_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_transcode_jobs
    ADD CONSTRAINT media_transcode_jobs_pkey PRIMARY KEY (id);


--
-- Name: media_upload_sessions media_upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: message_drafts message_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_drafts
    ADD CONSTRAINT message_drafts_pkey PRIMARY KEY (id);


--
-- Name: message_log message_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_log
    ADD CONSTRAINT message_log_pkey PRIMARY KEY (id);


--
-- Name: motivational_quotes motivational_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motivational_quotes
    ADD CONSTRAINT motivational_quotes_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery_attempts notification_delivery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_attempts
    ADD CONSTRAINT notification_delivery_attempts_pkey PRIMARY KEY (id);


--
-- Name: online_intake_answers online_intake_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_answers
    ADD CONSTRAINT online_intake_answers_pkey PRIMARY KEY (id);


--
-- Name: online_intake_answers online_intake_answers_request_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_answers
    ADD CONSTRAINT online_intake_answers_request_id_question_id_key UNIQUE (request_id, question_id);


--
-- Name: online_intake_attachments online_intake_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_attachments
    ADD CONSTRAINT online_intake_attachments_pkey PRIMARY KEY (id);


--
-- Name: online_intake_requests online_intake_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_requests
    ADD CONSTRAINT online_intake_requests_pkey PRIMARY KEY (id);


--
-- Name: online_intake_status_history online_intake_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_status_history
    ADD CONSTRAINT online_intake_status_history_pkey PRIMARY KEY (id);


--
-- Name: operator_health_alert_sent operator_health_alert_sent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_health_alert_sent
    ADD CONSTRAINT operator_health_alert_sent_pkey PRIMARY KEY (id);


--
-- Name: operator_health_failure_archive operator_health_failure_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_health_failure_archive
    ADD CONSTRAINT operator_health_failure_archive_pkey PRIMARY KEY (id);


--
-- Name: operator_incidents operator_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_incidents
    ADD CONSTRAINT operator_incidents_pkey PRIMARY KEY (id);


--
-- Name: operator_job_status operator_job_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_job_status
    ADD CONSTRAINT operator_job_status_pkey PRIMARY KEY (job_key);


--
-- Name: outgoing_delivery_queue outgoing_delivery_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outgoing_delivery_queue
    ADD CONSTRAINT outgoing_delivery_queue_pkey PRIMARY KEY (id);


--
-- Name: patient_bookings patient_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_pkey PRIMARY KEY (id);


--
-- Name: patient_bookings patient_bookings_rubitime_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_rubitime_id_key UNIQUE (rubitime_id);


--
-- Name: patient_bookings patient_bookings_slot_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_slot_no_overlap EXCLUDE USING gist (rubitime_cooperator_id_snapshot WITH =, tstzrange(slot_start, slot_end, '[)'::text) WITH &&) WHERE (((status = ANY (ARRAY['confirmed'::text, 'rescheduled'::text])) AND (rubitime_cooperator_id_snapshot IS NOT NULL)));


--
-- Name: patient_content_rating_feedback patient_content_rating_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_content_rating_feedback
    ADD CONSTRAINT patient_content_rating_feedback_pkey PRIMARY KEY (id);


--
-- Name: patient_daily_warmup_presentations patient_daily_warmup_presentations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_presentations
    ADD CONSTRAINT patient_daily_warmup_presentations_pkey PRIMARY KEY (user_id);


--
-- Name: patient_daily_warmup_video_views patient_daily_warmup_video_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_video_views
    ADD CONSTRAINT patient_daily_warmup_video_views_pkey PRIMARY KEY (id);


--
-- Name: patient_diary_day_snapshots patient_diary_day_snapshots_platform_user_id_local_date_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_diary_day_snapshots
    ADD CONSTRAINT patient_diary_day_snapshots_platform_user_id_local_date_pk PRIMARY KEY (platform_user_id, local_date);


--
-- Name: patient_home_block_items patient_home_block_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_block_items
    ADD CONSTRAINT patient_home_block_items_pkey PRIMARY KEY (id);


--
-- Name: patient_home_blocks patient_home_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_blocks
    ADD CONSTRAINT patient_home_blocks_pkey PRIMARY KEY (code);


--
-- Name: patient_lfk_assignments patient_lfk_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_pkey PRIMARY KEY (id);


--
-- Name: patient_merge_candidates patient_merge_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_pkey PRIMARY KEY (id);


--
-- Name: patient_practice_completions patient_practice_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_practice_completions
    ADD CONSTRAINT patient_practice_completions_pkey PRIMARY KEY (id);


--
-- Name: phone_challenges phone_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_challenges
    ADD CONSTRAINT phone_challenges_pkey PRIMARY KEY (challenge_id);


--
-- Name: phone_messenger_bind_secrets phone_messenger_bind_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_messenger_bind_secrets
    ADD CONSTRAINT phone_messenger_bind_secrets_pkey PRIMARY KEY (id);


--
-- Name: phone_messenger_bind_secrets phone_messenger_bind_secrets_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_messenger_bind_secrets
    ADD CONSTRAINT phone_messenger_bind_secrets_token_hash_key UNIQUE (token_hash);


--
-- Name: phone_otp_locks phone_otp_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_otp_locks
    ADD CONSTRAINT phone_otp_locks_pkey PRIMARY KEY (phone_normalized);


--
-- Name: platform_user_contacts platform_user_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_user_contacts
    ADD CONSTRAINT platform_user_contacts_pkey PRIMARY KEY (id);


--
-- Name: platform_users platform_users_integrator_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_integrator_user_id_key UNIQUE (integrator_user_id) DEFERRABLE;


--
-- Name: platform_users platform_users_phone_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_phone_normalized_key UNIQUE (phone_normalized) DEFERRABLE;


--
-- Name: platform_users platform_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_pkey PRIMARY KEY (id);


--
-- Name: product_analytics_events_recent product_analytics_events_recent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_events_recent
    ADD CONSTRAINT product_analytics_events_recent_pkey PRIMARY KEY (id);


--
-- Name: product_analytics_hourly product_analytics_hourly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_hourly
    ADD CONSTRAINT product_analytics_hourly_pkey PRIMARY KEY (bucket_hour, event_type, entry_channel, page_key, topic_code, push_kind, warmup_slogan_key);


--
-- Name: product_analytics_user_hourly product_analytics_user_hourly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_user_hourly
    ADD CONSTRAINT product_analytics_user_hourly_pkey PRIMARY KEY (bucket_hour, user_id, entry_channel, page_key);


--
-- Name: product_push_notifications product_push_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_push_notifications
    ADD CONSTRAINT product_push_notifications_pkey PRIMARY KEY (id);


--
-- Name: program_action_log program_action_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_action_log
    ADD CONSTRAINT program_action_log_pkey PRIMARY KEY (id);


--
-- Name: program_item_discussion_messages program_item_discussion_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_pkey PRIMARY KEY (id);


--
-- Name: program_item_discussion_reads program_item_discussion_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_reads
    ADD CONSTRAINT program_item_discussion_reads_pkey PRIMARY KEY (patient_user_id, instance_stage_item_id);


--
-- Name: projection_outbox projection_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projection_outbox
    ADD CONSTRAINT projection_outbox_pkey PRIMARY KEY (id);


--
-- Name: question_messages question_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_messages
    ADD CONSTRAINT question_messages_pkey PRIMARY KEY (id);


--
-- Name: recommendation_regions recommendation_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_regions
    ADD CONSTRAINT recommendation_regions_pkey PRIMARY KEY (recommendation_id, body_region_id);


--
-- Name: recommendations recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);


--
-- Name: reference_categories reference_categories_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_categories
    ADD CONSTRAINT reference_categories_code_key UNIQUE (code);


--
-- Name: reference_categories reference_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_categories
    ADD CONSTRAINT reference_categories_pkey PRIMARY KEY (id);


--
-- Name: reference_items reference_items_category_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_items
    ADD CONSTRAINT reference_items_category_id_code_key UNIQUE (category_id, code);


--
-- Name: reference_items reference_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_items
    ADD CONSTRAINT reference_items_pkey PRIMARY KEY (id);


--
-- Name: reminder_delivery_events reminder_delivery_events_integrator_delivery_log_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_delivery_events
    ADD CONSTRAINT reminder_delivery_events_integrator_delivery_log_id_key UNIQUE (integrator_delivery_log_id);


--
-- Name: reminder_delivery_events reminder_delivery_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_delivery_events
    ADD CONSTRAINT reminder_delivery_events_pkey PRIMARY KEY (id);


--
-- Name: reminder_journal reminder_journal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_journal
    ADD CONSTRAINT reminder_journal_pkey PRIMARY KEY (id);


--
-- Name: reminder_occurrence_history reminder_occurrence_history_integrator_occurrence_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_occurrence_history
    ADD CONSTRAINT reminder_occurrence_history_integrator_occurrence_id_key UNIQUE (integrator_occurrence_id);


--
-- Name: reminder_occurrence_history reminder_occurrence_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_occurrence_history
    ADD CONSTRAINT reminder_occurrence_history_pkey PRIMARY KEY (id);


--
-- Name: reminder_rules reminder_rules_integrator_rule_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_integrator_rule_id_key UNIQUE (integrator_rule_id);


--
-- Name: reminder_rules reminder_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_pkey PRIMARY KEY (id);


--
-- Name: rubitime_api_throttle rubitime_api_throttle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_api_throttle
    ADD CONSTRAINT rubitime_api_throttle_pkey PRIMARY KEY (id);


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_pkey PRIMARY KEY (id);


--
-- Name: rubitime_branches rubitime_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_branches
    ADD CONSTRAINT rubitime_branches_pkey PRIMARY KEY (id);


--
-- Name: rubitime_branches rubitime_branches_rubitime_branch_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_branches
    ADD CONSTRAINT rubitime_branches_rubitime_branch_id_key UNIQUE (rubitime_branch_id);


--
-- Name: rubitime_cooperators rubitime_cooperators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_cooperators
    ADD CONSTRAINT rubitime_cooperators_pkey PRIMARY KEY (id);


--
-- Name: rubitime_cooperators rubitime_cooperators_rubitime_cooperator_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_cooperators
    ADD CONSTRAINT rubitime_cooperators_rubitime_cooperator_id_key UNIQUE (rubitime_cooperator_id);


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
-- Name: rubitime_services rubitime_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_services
    ADD CONSTRAINT rubitime_services_pkey PRIMARY KEY (id);


--
-- Name: rubitime_services rubitime_services_rubitime_service_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_services
    ADD CONSTRAINT rubitime_services_rubitime_service_id_key UNIQUE (rubitime_service_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: specialist_tasks specialist_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_tasks
    ADD CONSTRAINT specialist_tasks_pkey PRIMARY KEY (id);


--
-- Name: mailing_topics subscriptions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics
    ADD CONSTRAINT subscriptions_code_key UNIQUE (code);


--
-- Name: mailing_topics subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mailing_topics
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: support_conversation_messages support_conversation_messages_integrator_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversation_messages
    ADD CONSTRAINT support_conversation_messages_integrator_message_id_key UNIQUE (integrator_message_id);


--
-- Name: support_conversation_messages support_conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversation_messages
    ADD CONSTRAINT support_conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: support_conversations support_conversations_integrator_conversation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_integrator_conversation_id_key UNIQUE (integrator_conversation_id);


--
-- Name: support_conversations support_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_pkey PRIMARY KEY (id);


--
-- Name: support_delivery_events support_delivery_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_delivery_events
    ADD CONSTRAINT support_delivery_events_pkey PRIMARY KEY (id);


--
-- Name: support_question_messages support_question_messages_integrator_question_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_question_messages
    ADD CONSTRAINT support_question_messages_integrator_question_message_id_key UNIQUE (integrator_question_message_id);


--
-- Name: support_question_messages support_question_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_question_messages
    ADD CONSTRAINT support_question_messages_pkey PRIMARY KEY (id);


--
-- Name: support_questions support_questions_integrator_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_questions
    ADD CONSTRAINT support_questions_integrator_question_id_key UNIQUE (integrator_question_id);


--
-- Name: support_questions support_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_questions
    ADD CONSTRAINT support_questions_pkey PRIMARY KEY (id);


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
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key, scope);


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
-- Name: test_attempts test_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_pkey PRIMARY KEY (id);


--
-- Name: test_results test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_pkey PRIMARY KEY (id);


--
-- Name: test_set_items test_set_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_set_items
    ADD CONSTRAINT test_set_items_pkey PRIMARY KEY (id);


--
-- Name: test_sets test_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sets
    ADD CONSTRAINT test_sets_pkey PRIMARY KEY (id);


--
-- Name: tests tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_events treatment_program_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_events
    ADD CONSTRAINT treatment_program_events_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_instance_stage_groups treatment_program_instance_stage_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_groups
    ADD CONSTRAINT treatment_program_instance_stage_groups_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_instance_stage_items treatment_program_instance_stage_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_items
    ADD CONSTRAINT treatment_program_instance_stage_items_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_instance_stages treatment_program_instance_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stages
    ADD CONSTRAINT treatment_program_instance_stages_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_instances treatment_program_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instances
    ADD CONSTRAINT treatment_program_instances_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_template_stage_groups treatment_program_template_stage_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_groups
    ADD CONSTRAINT treatment_program_template_stage_groups_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_template_stage_items treatment_program_template_stage_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_items
    ADD CONSTRAINT treatment_program_template_stage_items_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_template_stages treatment_program_template_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stages
    ADD CONSTRAINT treatment_program_template_stages_pkey PRIMARY KEY (id);


--
-- Name: treatment_program_templates treatment_program_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_templates
    ADD CONSTRAINT treatment_program_templates_pkey PRIMARY KEY (id);


--
-- Name: be_booking_form_fields uq_be_booking_form_fields_org_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_fields
    ADD CONSTRAINT uq_be_booking_form_fields_org_key UNIQUE (organization_id, field_key);


--
-- Name: be_booking_form_submissions uq_be_booking_form_submissions_appt_field; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT uq_be_booking_form_submissions_appt_field UNIQUE (appointment_id, field_id);


--
-- Name: be_branches uq_be_branches_org_city_title; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_branches
    ADD CONSTRAINT uq_be_branches_org_city_title UNIQUE (organization_id, city_code, title);


--
-- Name: be_clinic_services uq_be_clinic_services_org_title_duration; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_clinic_services
    ADD CONSTRAINT uq_be_clinic_services_org_title_duration UNIQUE (organization_id, title, duration_minutes);


--
-- Name: be_rooms uq_be_rooms_branch_title; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_rooms
    ADD CONSTRAINT uq_be_rooms_branch_title UNIQUE (branch_id, title);


--
-- Name: be_service_location_availability uq_be_sla_service_branch; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT uq_be_sla_service_branch UNIQUE (service_id, branch_id);


--
-- Name: be_specialist_locations uq_be_specialist_locations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT uq_be_specialist_locations UNIQUE (specialist_id, branch_id);


--
-- Name: be_specialist_rooms uq_be_specialist_rooms; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT uq_be_specialist_rooms UNIQUE (specialist_id, room_id);


--
-- Name: be_specialist_service_availability uq_be_ssa_specialist_service_scope; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT uq_be_ssa_specialist_service_scope UNIQUE (specialist_id, service_id, branch_id, room_id, city_code);


--
-- Name: booking_branch_services uq_booking_branch_services; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT uq_booking_branch_services UNIQUE (branch_id, service_id);


--
-- Name: booking_services uq_booking_services_title_duration; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_services
    ADD CONSTRAINT uq_booking_services_title_duration UNIQUE (title, duration_minutes);


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
-- Name: user_email_setup_tokens user_email_setup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_setup_tokens
    ADD CONSTRAINT user_email_setup_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_notification_topic_channels user_notification_topic_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topic_channels
    ADD CONSTRAINT user_notification_topic_channels_pkey PRIMARY KEY (user_id, topic_code, channel_code);


--
-- Name: user_notification_topics user_notification_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topics
    ADD CONSTRAINT user_notification_topics_pkey PRIMARY KEY (user_id, topic_code);


--
-- Name: user_oauth_bindings user_oauth_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oauth_bindings
    ADD CONSTRAINT user_oauth_bindings_pkey PRIMARY KEY (id);


--
-- Name: user_oauth_bindings user_oauth_bindings_provider_provider_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oauth_bindings
    ADD CONSTRAINT user_oauth_bindings_provider_provider_user_id_key UNIQUE (provider, provider_user_id);


--
-- Name: user_password_credentials user_password_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_password_credentials
    ADD CONSTRAINT user_password_credentials_pkey PRIMARY KEY (user_id);


--
-- Name: user_phone_history user_phone_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_phone_history
    ADD CONSTRAINT user_phone_history_pkey PRIMARY KEY (id);


--
-- Name: user_pins user_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pins
    ADD CONSTRAINT user_pins_pkey PRIMARY KEY (user_id);


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
-- Name: user_subscriptions_webapp user_subscriptions_webapp_integrator_user_id_integrator_top_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions_webapp
    ADD CONSTRAINT user_subscriptions_webapp_integrator_user_id_integrator_top_key UNIQUE (integrator_user_id, integrator_topic_id);


--
-- Name: user_subscriptions_webapp user_subscriptions_webapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions_webapp
    ADD CONSTRAINT user_subscriptions_webapp_pkey PRIMARY KEY (id);


--
-- Name: user_web_push_subscriptions user_web_push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_web_push_subscriptions
    ADD CONSTRAINT user_web_push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webapp_reminder_occurrences webapp_reminder_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webapp_reminder_occurrences
    ADD CONSTRAINT webapp_reminder_occurrences_pkey PRIMARY KEY (id);


--
-- Name: webapp_schema_migrations webapp_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webapp_schema_migrations
    ADD CONSTRAINT webapp_schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: be_payment_intents_idempotency_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_payment_intents_idempotency_uidx ON public.be_payment_intents USING btree (organization_id, idempotency_key);


--
-- Name: be_payment_provider_events_idempotency_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_payment_provider_events_idempotency_uidx ON public.be_payment_provider_events USING btree (organization_id, provider_id, idempotency_key);


--
-- Name: be_payments_intent_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_payments_intent_uidx ON public.be_payments USING btree (payment_intent_id);


--
-- Name: be_prepayment_policies_online_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_prepayment_policies_online_uidx ON public.be_prepayment_policies USING btree (organization_id, online_category) WHERE (online_category IS NOT NULL);


--
-- Name: be_prepayment_policies_service_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_prepayment_policies_service_uidx ON public.be_prepayment_policies USING btree (organization_id, service_id) WHERE (service_id IS NOT NULL);


--
-- Name: be_product_pay_links_token_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX be_product_pay_links_token_uidx ON public.be_product_pay_links USING btree (token);


--
-- Name: content_access_grants_user_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_access_grants_user_expires_idx ON public.content_access_grants USING btree (user_id, expires_at DESC);


--
-- Name: content_section_slug_history_old_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX content_section_slug_history_old_slug_key ON public.content_section_slug_history USING btree (old_slug);


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
-- Name: idx_admin_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_action ON public.admin_audit_log USING btree (action);


--
-- Name: idx_admin_audit_log_conflict_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_conflict_key ON public.admin_audit_log USING btree (conflict_key) WHERE (conflict_key IS NOT NULL);


--
-- Name: idx_admin_audit_log_conflict_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_admin_audit_log_conflict_open ON public.admin_audit_log USING btree (conflict_key) WHERE ((conflict_key IS NOT NULL) AND (resolved_at IS NULL));


--
-- Name: idx_admin_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: idx_admin_audit_log_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_target ON public.admin_audit_log USING btree (target_id) WHERE (target_id IS NOT NULL);


--
-- Name: idx_appointment_records_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_branch_id ON public.appointment_records USING btree (branch_id) WHERE (branch_id IS NOT NULL);


--
-- Name: idx_appointment_records_integrator_record_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_appointment_records_integrator_record_id ON public.appointment_records USING btree (integrator_record_id);


--
-- Name: idx_appointment_records_phone_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_phone_normalized ON public.appointment_records USING btree (phone_normalized) WHERE (phone_normalized IS NOT NULL);


--
-- Name: idx_appointment_records_phone_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_phone_not_deleted ON public.appointment_records USING btree (phone_normalized, record_at DESC) WHERE ((deleted_at IS NULL) AND (phone_normalized IS NOT NULL));


--
-- Name: idx_appointment_records_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_platform_user_id ON public.appointment_records USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_appointment_records_record_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_record_at ON public.appointment_records USING btree (record_at) WHERE (record_at IS NOT NULL);


--
-- Name: idx_appointment_records_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_records_status ON public.appointment_records USING btree (status);


--
-- Name: idx_assignments_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_patient ON public.patient_lfk_assignments USING btree (patient_user_id, is_active);


--
-- Name: idx_auth_rate_limit_events_scope_key_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_rate_limit_events_scope_key_time ON public.auth_rate_limit_events USING btree (scope, key, occurred_at);


--
-- Name: idx_be_appointment_events_appt_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointment_events_appt_created ON public.be_appointment_events USING btree (appointment_id, created_at);


--
-- Name: idx_be_appointment_history_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointment_history_appt ON public.be_appointment_history_events USING btree (appointment_id, occurred_at);


--
-- Name: idx_be_appointments_attribution_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointments_attribution_gin ON public.be_appointments USING gin (attribution_json);


--
-- Name: idx_be_appointments_org_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointments_org_start ON public.be_appointments USING btree (organization_id, start_at);


--
-- Name: idx_be_appointments_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointments_patient ON public.be_appointments USING btree (platform_user_id);


--
-- Name: idx_be_appointments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appointments_status ON public.be_appointments USING btree (status);


--
-- Name: idx_be_appt_cancellations_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appt_cancellations_appt ON public.be_appointment_cancellations USING btree (appointment_id, created_at DESC);


--
-- Name: idx_be_appt_reschedules_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appt_reschedules_appt ON public.be_appointment_reschedules USING btree (appointment_id, created_at DESC);


--
-- Name: idx_be_appt_staff_comments_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appt_staff_comments_appt ON public.be_appointment_staff_comments USING btree (appointment_id);


--
-- Name: idx_be_appt_staff_comments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_appt_staff_comments_user ON public.be_appointment_staff_comments USING btree (platform_user_id, created_at);


--
-- Name: idx_be_booking_form_fields_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_booking_form_fields_org ON public.be_booking_form_fields USING btree (organization_id);


--
-- Name: idx_be_booking_form_submissions_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_booking_form_submissions_appt ON public.be_booking_form_submissions USING btree (appointment_id);


--
-- Name: idx_be_branches_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_branches_city ON public.be_branches USING btree (organization_id, city_code);


--
-- Name: idx_be_branches_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_branches_org ON public.be_branches USING btree (organization_id);


--
-- Name: idx_be_cancel_policies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_cancel_policies_org ON public.be_cancellation_policies USING btree (organization_id);


--
-- Name: idx_be_clinic_services_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_clinic_services_org ON public.be_clinic_services USING btree (organization_id);


--
-- Name: idx_be_external_mapping_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_external_mapping_canonical ON public.be_external_entity_mappings USING btree (entity_type, canonical_id);


--
-- Name: idx_be_external_mapping_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_be_external_mapping_unique ON public.be_external_entity_mappings USING btree (external_system, entity_type, external_id);


--
-- Name: idx_be_organizations_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_organizations_is_active ON public.be_organizations USING btree (is_active);


--
-- Name: idx_be_package_history_pkg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_package_history_pkg ON public.be_package_history_events USING btree (patient_package_id);


--
-- Name: idx_be_package_items_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_package_items_package ON public.be_package_items USING btree (package_id);


--
-- Name: idx_be_package_usages_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_package_usages_appointment ON public.be_package_usages USING btree (appointment_id);


--
-- Name: idx_be_package_usages_pkg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_package_usages_pkg ON public.be_package_usages USING btree (patient_package_id);


--
-- Name: idx_be_patient_booking_profiles_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_booking_profiles_user ON public.be_patient_booking_profiles USING btree (platform_user_id);


--
-- Name: idx_be_patient_package_items_pkg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_package_items_pkg ON public.be_patient_package_items USING btree (patient_package_id);


--
-- Name: idx_be_patient_packages_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_packages_org_user ON public.be_patient_packages USING btree (organization_id, platform_user_id);


--
-- Name: idx_be_patient_packages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_packages_status ON public.be_patient_packages USING btree (status);


--
-- Name: idx_be_patient_timeline_user_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_patient_timeline_user_occurred ON public.be_patient_timeline_events USING btree (platform_user_id, occurred_at);


--
-- Name: idx_be_payment_history_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_payment_history_appointment ON public.be_payment_history_events USING btree (appointment_id);


--
-- Name: idx_be_payment_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_payment_history_user ON public.be_payment_history_events USING btree (platform_user_id);


--
-- Name: idx_be_payment_intents_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_payment_intents_appointment ON public.be_payment_intents USING btree (appointment_id);


--
-- Name: idx_be_payments_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_payments_appointment ON public.be_payments USING btree (appointment_id);


--
-- Name: idx_be_prepayment_policies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_prepayment_policies_org ON public.be_prepayment_policies USING btree (organization_id);


--
-- Name: idx_be_product_history_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_history_purchase ON public.be_product_history_events USING btree (product_purchase_id);


--
-- Name: idx_be_product_pay_links_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_pay_links_product ON public.be_product_pay_links USING btree (product_id);


--
-- Name: idx_be_product_purchases_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_purchases_org_user ON public.be_product_purchases USING btree (organization_id, platform_user_id);


--
-- Name: idx_be_product_purchases_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_purchases_phone ON public.be_product_purchases USING btree (organization_id, buyer_phone_normalized);


--
-- Name: idx_be_product_purchases_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_purchases_product ON public.be_product_purchases USING btree (product_id);


--
-- Name: idx_be_product_purchases_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_product_purchases_status ON public.be_product_purchases USING btree (status);


--
-- Name: idx_be_products_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_products_org ON public.be_products USING btree (organization_id);


--
-- Name: idx_be_products_org_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_products_org_type ON public.be_products USING btree (organization_id, product_type);


--
-- Name: idx_be_refunds_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_refunds_payment ON public.be_refunds USING btree (payment_id);


--
-- Name: idx_be_reschedule_policies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_reschedule_policies_org ON public.be_reschedule_policies USING btree (organization_id);


--
-- Name: idx_be_rooms_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_rooms_branch ON public.be_rooms USING btree (branch_id);


--
-- Name: idx_be_schedule_blocks_org_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_schedule_blocks_org_start ON public.be_schedule_blocks USING btree (organization_id, start_at);


--
-- Name: idx_be_specialists_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_specialists_org ON public.be_specialists USING btree (organization_id);


--
-- Name: idx_be_ssa_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_ssa_service ON public.be_specialist_service_availability USING btree (service_id);


--
-- Name: idx_be_ssa_specialist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_ssa_specialist ON public.be_specialist_service_availability USING btree (specialist_id);


--
-- Name: idx_be_subscription_packages_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_subscription_packages_org ON public.be_subscription_packages USING btree (organization_id);


--
-- Name: idx_be_working_hours_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_be_working_hours_scope ON public.be_working_hours USING btree (organization_id, specialist_id, branch_id);


--
-- Name: idx_booking_branch_services_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branch_services_branch_id ON public.booking_branch_services USING btree (branch_id);


--
-- Name: idx_booking_branch_services_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branch_services_is_active ON public.booking_branch_services USING btree (is_active);


--
-- Name: idx_booking_branch_services_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branch_services_service_id ON public.booking_branch_services USING btree (service_id);


--
-- Name: idx_booking_branches_city_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branches_city_id ON public.booking_branches USING btree (city_id);


--
-- Name: idx_booking_branches_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_branches_is_active ON public.booking_branches USING btree (is_active);


--
-- Name: idx_booking_branches_rubitime_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_booking_branches_rubitime_id ON public.booking_branches USING btree (rubitime_branch_id);


--
-- Name: idx_booking_calendar_map_gcal_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_calendar_map_gcal_event_id ON public.booking_calendar_map USING btree (gcal_event_id);


--
-- Name: idx_booking_cities_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_cities_is_active ON public.booking_cities USING btree (is_active);


--
-- Name: idx_booking_services_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_services_is_active ON public.booking_services USING btree (is_active);


--
-- Name: idx_booking_specialists_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_specialists_branch_id ON public.booking_specialists USING btree (branch_id);


--
-- Name: idx_booking_specialists_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_specialists_is_active ON public.booking_specialists USING btree (is_active);


--
-- Name: idx_booking_specialists_rubitime_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_booking_specialists_rubitime_id ON public.booking_specialists USING btree (rubitime_cooperator_id, branch_id);


--
-- Name: idx_branches_integrator_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_branches_integrator_branch_id ON public.branches USING btree (integrator_branch_id);


--
-- Name: idx_broadcast_audit_executed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcast_audit_executed_at ON public.broadcast_audit USING btree (executed_at DESC);


--
-- Name: idx_broadcast_audit_recipients_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcast_audit_recipients_platform_user_id ON public.broadcast_audit_recipients USING btree (platform_user_id);


--
-- Name: idx_channel_link_secrets_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_link_secrets_expires ON public.channel_link_secrets USING btree (expires_at);


--
-- Name: idx_channel_link_secrets_user_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_link_secrets_user_channel ON public.channel_link_secrets USING btree (user_id, channel_code);


--
-- Name: idx_clinical_test_measure_kinds_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_test_measure_kinds_sort ON public.clinical_test_measure_kinds USING btree (sort_order);


--
-- Name: idx_clinical_test_regions_body_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_test_regions_body_region ON public.clinical_test_regions USING btree (body_region_id);


--
-- Name: idx_comments_target_type_target_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_target_type_target_id ON public.comments USING btree (target_type, target_id);


--
-- Name: idx_contacts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_user_id ON public.contacts USING btree (user_id);


--
-- Name: idx_content_access_grants_webapp_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_access_grants_webapp_expires_at ON public.content_access_grants_webapp USING btree (expires_at DESC);


--
-- Name: idx_content_access_grants_webapp_integrator_grant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_content_access_grants_webapp_integrator_grant_id ON public.content_access_grants_webapp USING btree (integrator_grant_id);


--
-- Name: idx_content_access_grants_webapp_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_access_grants_webapp_integrator_user_id ON public.content_access_grants_webapp USING btree (integrator_user_id);


--
-- Name: idx_content_pages_linked_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_pages_linked_course ON public.content_pages USING btree (linked_course_id);


--
-- Name: idx_content_pages_section; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_pages_section ON public.content_pages USING btree (section);


--
-- Name: idx_content_pages_section_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_pages_section_sort ON public.content_pages USING btree (section, sort_order);


--
-- Name: idx_content_pages_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_pages_slug ON public.content_pages USING btree (slug);


--
-- Name: idx_content_section_slug_history_new_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_section_slug_history_new_slug ON public.content_section_slug_history USING btree (new_slug);


--
-- Name: idx_content_sections_kind_parent_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_sections_kind_parent_sort ON public.content_sections USING btree (kind, system_parent_code, sort_order, title);


--
-- Name: idx_content_sections_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_sections_sort ON public.content_sections USING btree (sort_order, title);


--
-- Name: idx_courses_program_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_program_template ON public.courses USING btree (program_template_id);


--
-- Name: idx_courses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_status ON public.courses USING btree (status);


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
-- Name: idx_doctor_notes_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctor_notes_user_created ON public.doctor_notes USING btree (user_id, created_at DESC);


--
-- Name: idx_doctor_patient_support_on_support; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctor_patient_support_on_support ON public.doctor_patient_support USING btree (on_support);


--
-- Name: idx_email_challenges_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_challenges_expires_at ON public.email_challenges USING btree (expires_at);


--
-- Name: idx_email_challenges_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_challenges_user_id ON public.email_challenges USING btree (user_id);


--
-- Name: idx_idempotency_keys_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_keys_expires_at ON public.idempotency_keys USING btree (expires_at);


--
-- Name: idx_identities_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_identities_user_id ON public.identities USING btree (user_id);


--
-- Name: idx_integration_data_quality_incidents_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_data_quality_incidents_last_seen ON public.integration_data_quality_incidents USING btree (last_seen_at DESC);


--
-- Name: idx_integration_webhook_error_events_burst; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_webhook_error_events_burst ON public.integration_webhook_error_events USING btree (source, error_class, occurred_at DESC);


--
-- Name: idx_integrator_push_outbox_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrator_push_outbox_due ON public.integrator_push_outbox USING btree (status, next_try_at) WHERE (status = 'pending'::text);


--
-- Name: idx_lfk_complex_exercises_complex; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complex_exercises_complex ON public.lfk_complex_exercises USING btree (complex_id, sort_order);


--
-- Name: idx_lfk_complexes_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complexes_platform_user_id ON public.lfk_complexes USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_lfk_complexes_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_complexes_user_active ON public.lfk_complexes USING btree (user_id, is_active);


--
-- Name: idx_lfk_exercise_media_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercise_media_exercise ON public.lfk_exercise_media USING btree (exercise_id, sort_order);


--
-- Name: idx_lfk_exercise_regions_region_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercise_regions_region_ref ON public.lfk_exercise_regions USING btree (region_ref_id);


--
-- Name: idx_lfk_exercises_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercises_archived ON public.lfk_exercises USING btree (is_archived);


--
-- Name: idx_lfk_exercises_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_exercises_region ON public.lfk_exercises USING btree (region_ref_id) WHERE (NOT is_archived);


--
-- Name: idx_lfk_sessions_complex_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_sessions_complex_completed ON public.lfk_sessions USING btree (complex_id, completed_at DESC);


--
-- Name: idx_lfk_sessions_user_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lfk_sessions_user_completed ON public.lfk_sessions USING btree (user_id, completed_at DESC);


--
-- Name: idx_login_tokens_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_tokens_status ON public.login_tokens USING btree (status, expires_at) WHERE (status = 'pending'::text);


--
-- Name: idx_mailing_logs_webapp_mailing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mailing_logs_webapp_mailing ON public.mailing_logs_webapp USING btree (integrator_mailing_id);


--
-- Name: idx_mailing_logs_webapp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mailing_logs_webapp_user ON public.mailing_logs_webapp USING btree (integrator_user_id);


--
-- Name: idx_mailing_topics_webapp_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mailing_topics_webapp_integrator_id ON public.mailing_topics_webapp USING btree (integrator_topic_id);


--
-- Name: idx_mailing_topics_webapp_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mailing_topics_webapp_key ON public.mailing_topics_webapp USING btree (key);


--
-- Name: idx_material_ratings_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_ratings_target ON public.material_ratings USING btree (target_kind, target_id);


--
-- Name: idx_media_files_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_created_at ON public.media_files USING btree (created_at DESC);


--
-- Name: idx_media_files_folder_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_folder_created ON public.media_files USING btree (folder_id, created_at DESC) WHERE (folder_id IS NOT NULL);


--
-- Name: idx_media_files_preview_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_preview_status ON public.media_files USING btree (preview_status) WHERE (preview_status = 'pending'::text);


--
-- Name: idx_media_files_purge_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_purge_queue ON public.media_files USING btree (next_attempt_at NULLS FIRST) WHERE (status = ANY (ARRAY['pending_delete'::text, 'deleting'::text]));


--
-- Name: idx_media_files_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_uploaded_by ON public.media_files USING btree (uploaded_by);


--
-- Name: idx_media_files_video_processing_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_video_processing_status ON public.media_files USING btree (video_processing_status) WHERE (mime_type ~~ 'video/%'::text);


--
-- Name: idx_media_folders_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_folders_parent_id ON public.media_folders USING btree (parent_id);


--
-- Name: idx_media_hls_proxy_error_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_hls_proxy_error_events_created_at ON public.media_hls_proxy_error_events USING btree (created_at DESC);


--
-- Name: idx_media_hls_proxy_error_events_reason_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_hls_proxy_error_events_reason_time ON public.media_hls_proxy_error_events USING btree (reason_code, created_at DESC);


--
-- Name: idx_media_playback_client_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_client_events_created_at ON public.media_playback_client_events USING btree (created_at DESC);


--
-- Name: idx_media_playback_client_events_event_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_client_events_event_time ON public.media_playback_client_events USING btree (event_class, created_at DESC);


--
-- Name: idx_media_playback_client_events_media_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_client_events_media_time ON public.media_playback_client_events USING btree (media_id, created_at DESC);


--
-- Name: idx_media_playback_resolution_events_resolved_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_resolution_events_resolved_at ON public.media_playback_resolution_events USING btree (resolved_at DESC);


--
-- Name: idx_media_playback_resolution_events_user_resolved_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_resolution_events_user_resolved_at ON public.media_playback_resolution_events USING btree (user_id, resolved_at DESC);


--
-- Name: idx_media_playback_stats_hourly_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_stats_hourly_bucket ON public.media_playback_stats_hourly USING btree (bucket_hour);


--
-- Name: idx_media_playback_user_video_first_resolve_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_user_video_first_resolve_time ON public.media_playback_user_video_first_resolve USING btree (first_resolved_at);


--
-- Name: idx_media_transcode_jobs_finished_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_transcode_jobs_finished_at ON public.media_transcode_jobs USING btree (finished_at DESC) WHERE ((finished_at IS NOT NULL) AND (status = ANY (ARRAY['done'::text, 'failed'::text])));


--
-- Name: idx_media_transcode_jobs_pending_pick; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_transcode_jobs_pending_pick ON public.media_transcode_jobs USING btree (next_attempt_at, created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_media_upload_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_upload_sessions_expires ON public.media_upload_sessions USING btree (expires_at) WHERE (status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text]));


--
-- Name: idx_media_upload_sessions_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_upload_sessions_owner ON public.media_upload_sessions USING btree (owner_user_id);


--
-- Name: idx_message_log_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_log_platform_user_id ON public.message_log USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_message_log_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_log_sent_at ON public.message_log USING btree (sent_at DESC);


--
-- Name: idx_message_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_log_user_id ON public.message_log USING btree (user_id);


--
-- Name: idx_motivational_quotes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motivational_quotes_active ON public.motivational_quotes USING btree (is_active, sort_order);


--
-- Name: idx_notification_delivery_attempts_channel_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_channel_created ON public.notification_delivery_attempts USING btree (channel, created_at);


--
-- Name: idx_notification_delivery_attempts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_created_at ON public.notification_delivery_attempts USING btree (created_at);


--
-- Name: idx_notification_delivery_attempts_occurrence_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_occurrence_created ON public.notification_delivery_attempts USING btree (occurrence_id, created_at);


--
-- Name: idx_notification_delivery_attempts_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_status_created ON public.notification_delivery_attempts USING btree (status, created_at);


--
-- Name: idx_notification_delivery_attempts_topic_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_topic_created ON public.notification_delivery_attempts USING btree (topic_code, created_at);


--
-- Name: idx_notification_delivery_attempts_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_attempts_user_created ON public.notification_delivery_attempts USING btree (user_id, created_at);


--
-- Name: idx_oauth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_user ON public.user_oauth_bindings USING btree (user_id);


--
-- Name: idx_online_intake_answers_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_answers_request_id ON public.online_intake_answers USING btree (request_id);


--
-- Name: idx_online_intake_attachments_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_attachments_request_id ON public.online_intake_attachments USING btree (request_id);


--
-- Name: idx_online_intake_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_requests_created_at ON public.online_intake_requests USING btree (created_at DESC);


--
-- Name: idx_online_intake_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_requests_status ON public.online_intake_requests USING btree (status);


--
-- Name: idx_online_intake_requests_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_requests_type ON public.online_intake_requests USING btree (type);


--
-- Name: idx_online_intake_requests_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_requests_user_id ON public.online_intake_requests USING btree (user_id);


--
-- Name: idx_online_intake_status_history_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_status_history_changed_at ON public.online_intake_status_history USING btree (changed_at DESC);


--
-- Name: idx_online_intake_status_history_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_intake_status_history_request_id ON public.online_intake_status_history USING btree (request_id);


--
-- Name: idx_operator_health_alert_sent_dedup_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_health_alert_sent_dedup_sent_at ON public.operator_health_alert_sent USING btree (dedup_key, sent_at DESC);


--
-- Name: idx_operator_health_failure_archive_archived_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_health_failure_archive_archived_at ON public.operator_health_failure_archive USING btree (archived_at);


--
-- Name: idx_operator_health_failure_archive_doctor_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_health_failure_archive_doctor_archived ON public.operator_health_failure_archive USING btree (doctor_user_id, archived_at);


--
-- Name: idx_operator_health_failure_archive_probe_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_health_failure_archive_probe_archived ON public.operator_health_failure_archive USING btree (health_probe, archived_at);


--
-- Name: idx_operator_incidents_open_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_incidents_open_last_seen ON public.operator_incidents USING btree (last_seen_at DESC) WHERE (resolved_at IS NULL);


--
-- Name: idx_operator_job_status_family_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_job_status_family_key ON public.operator_job_status USING btree (job_family, job_key);


--
-- Name: idx_operator_job_status_last_finished; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_job_status_last_finished ON public.operator_job_status USING btree (last_finished_at DESC);


--
-- Name: idx_outgoing_delivery_queue_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outgoing_delivery_queue_due ON public.outgoing_delivery_queue USING btree (status, next_retry_at);


--
-- Name: idx_patient_bookings_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_branch_id ON public.patient_bookings USING btree (branch_id);


--
-- Name: idx_patient_bookings_branch_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_branch_service_id ON public.patient_bookings USING btree (branch_service_id);


--
-- Name: idx_patient_bookings_canonical_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_canonical_appt ON public.patient_bookings USING btree (canonical_appointment_id);


--
-- Name: idx_patient_bookings_rubitime_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_rubitime_id ON public.patient_bookings USING btree (rubitime_id);


--
-- Name: idx_patient_bookings_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_service_id ON public.patient_bookings USING btree (service_id);


--
-- Name: idx_patient_bookings_slot_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_slot_start ON public.patient_bookings USING btree (slot_start);


--
-- Name: idx_patient_bookings_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_source ON public.patient_bookings USING btree (source);


--
-- Name: idx_patient_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_status ON public.patient_bookings USING btree (status);


--
-- Name: idx_patient_bookings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_bookings_user_id ON public.patient_bookings USING btree (platform_user_id);


--
-- Name: idx_patient_daily_warmup_presentations_content_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_daily_warmup_presentations_content_page ON public.patient_daily_warmup_presentations USING btree (content_page_id);


--
-- Name: idx_patient_daily_warmup_video_views_page_viewed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_daily_warmup_video_views_page_viewed ON public.patient_daily_warmup_video_views USING btree (content_page_id, viewed_at);


--
-- Name: idx_patient_daily_warmup_video_views_viewed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_daily_warmup_video_views_viewed_at ON public.patient_daily_warmup_video_views USING btree (viewed_at);


--
-- Name: idx_patient_home_block_items_block_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_home_block_items_block_sort ON public.patient_home_block_items USING btree (block_code, sort_order);


--
-- Name: idx_patient_lfk_assign_active_template; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_patient_lfk_assign_active_template ON public.patient_lfk_assignments USING btree (patient_user_id, template_id) WHERE (is_active = true);


--
-- Name: idx_patient_merge_candidates_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_merge_candidates_org_status ON public.patient_merge_candidates USING btree (organization_id, status, created_at DESC);


--
-- Name: idx_pcrf_content_page_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pcrf_content_page_created_desc ON public.patient_content_rating_feedback USING btree (content_page_id, created_at);


--
-- Name: idx_pcrf_user_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pcrf_user_created_desc ON public.patient_content_rating_feedback USING btree (user_id, created_at);


--
-- Name: idx_phone_challenges_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_challenges_expires_at ON public.phone_challenges USING btree (expires_at);


--
-- Name: idx_phone_challenges_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_challenges_phone ON public.phone_challenges USING btree (phone);


--
-- Name: idx_phone_messenger_bind_secrets_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_messenger_bind_secrets_expires ON public.phone_messenger_bind_secrets USING btree (expires_at);


--
-- Name: idx_phone_messenger_bind_secrets_phone_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phone_messenger_bind_secrets_phone_status ON public.phone_messenger_bind_secrets USING btree (phone_normalized, status);


--
-- Name: idx_platform_user_contacts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_user_contacts_user ON public.platform_user_contacts USING btree (platform_user_id);


--
-- Name: idx_platform_users_integrator_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_integrator_uid ON public.platform_users USING btree (integrator_user_id) WHERE (integrator_user_id IS NOT NULL);


--
-- Name: idx_platform_users_merged_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_merged_at ON public.platform_users USING btree (merged_at) WHERE (merged_at IS NOT NULL);


--
-- Name: idx_platform_users_merged_into; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_merged_into ON public.platform_users USING btree (merged_into_id) WHERE (merged_into_id IS NOT NULL);


--
-- Name: idx_platform_users_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_users_phone ON public.platform_users USING btree (phone_normalized) WHERE (phone_normalized IS NOT NULL);


--
-- Name: idx_ppc_user_completed_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppc_user_completed_desc ON public.patient_practice_completions USING btree (user_id, completed_at);


--
-- Name: idx_ppc_user_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppc_user_page ON public.patient_practice_completions USING btree (user_id, content_page_id);


--
-- Name: idx_product_analytics_events_recent_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_events_recent_occurred ON public.product_analytics_events_recent USING btree (occurred_at);


--
-- Name: idx_product_analytics_events_recent_push_open_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_product_analytics_events_recent_push_open_dedupe ON public.product_analytics_events_recent USING btree (push_tracking_id) WHERE ((event_type = 'push_open'::text) AND (push_tracking_id IS NOT NULL));


--
-- Name: idx_product_analytics_events_recent_type_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_events_recent_type_occurred ON public.product_analytics_events_recent USING btree (event_type, occurred_at);


--
-- Name: idx_product_analytics_hourly_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_hourly_bucket ON public.product_analytics_hourly USING btree (bucket_hour);


--
-- Name: idx_product_analytics_user_hourly_user_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_analytics_user_hourly_user_bucket ON public.product_analytics_user_hourly USING btree (user_id, bucket_hour);


--
-- Name: idx_product_push_notifications_kind_slogan_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_push_notifications_kind_slogan_created ON public.product_push_notifications USING btree (push_kind, warmup_slogan_key, created_at);


--
-- Name: idx_product_push_notifications_topic_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_push_notifications_topic_created ON public.product_push_notifications USING btree (topic_code, created_at);


--
-- Name: idx_product_push_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_push_notifications_user_created ON public.product_push_notifications USING btree (user_id, created_at);


--
-- Name: idx_program_action_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_action_log_created_at ON public.program_action_log USING btree (created_at);


--
-- Name: idx_program_action_log_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_action_log_instance ON public.program_action_log USING btree (instance_id);


--
-- Name: idx_program_action_log_stage_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_action_log_stage_item ON public.program_action_log USING btree (instance_stage_item_id);


--
-- Name: idx_program_item_discussion_item_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_item_discussion_item_created ON public.program_item_discussion_messages USING btree (instance_stage_item_id, created_at);


--
-- Name: idx_program_item_discussion_patient_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_item_discussion_patient_created ON public.program_item_discussion_messages USING btree (patient_user_id, created_at DESC);


--
-- Name: idx_program_item_discussion_reads_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_item_discussion_reads_item ON public.program_item_discussion_reads USING btree (instance_stage_item_id);


--
-- Name: idx_projection_outbox_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projection_outbox_due ON public.projection_outbox USING btree (status, next_try_at) WHERE (status = 'pending'::text);


--
-- Name: idx_projection_outbox_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_projection_outbox_idempotency_key ON public.projection_outbox USING btree (idempotency_key);


--
-- Name: idx_rbp_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbp_is_active ON public.rubitime_booking_profiles USING btree (is_active);


--
-- Name: idx_rbp_type_category_city; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_rbp_type_category_city ON public.rubitime_booking_profiles USING btree (booking_type, category_code, COALESCE(city_code, ''::text));


--
-- Name: idx_recommendation_regions_body_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_regions_body_region ON public.recommendation_regions USING btree (body_region_id);


--
-- Name: idx_recommendations_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_archived ON public.recommendations USING btree (is_archived);


--
-- Name: idx_recommendations_body_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_body_region ON public.recommendations USING btree (body_region_id);


--
-- Name: idx_recommendations_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_domain ON public.recommendations USING btree (domain);


--
-- Name: idx_ref_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ref_items_category ON public.reference_items USING btree (category_id, sort_order);


--
-- Name: idx_reminder_delivery_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_delivery_events_created_at ON public.reminder_delivery_events USING btree (created_at DESC);


--
-- Name: idx_reminder_delivery_events_integrator_log_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reminder_delivery_events_integrator_log_id ON public.reminder_delivery_events USING btree (integrator_delivery_log_id);


--
-- Name: idx_reminder_delivery_events_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_delivery_events_integrator_user_id ON public.reminder_delivery_events USING btree (integrator_user_id);


--
-- Name: idx_reminder_journal_action_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_journal_action_created_at ON public.reminder_journal USING btree (action, created_at DESC);


--
-- Name: idx_reminder_journal_occurrence_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_journal_occurrence_id ON public.reminder_journal USING btree (occurrence_id, created_at DESC) WHERE (occurrence_id IS NOT NULL);


--
-- Name: idx_reminder_journal_rule_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_journal_rule_created_at ON public.reminder_journal USING btree (rule_id, created_at DESC);


--
-- Name: idx_reminder_occurrence_history_integrator_occ_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reminder_occurrence_history_integrator_occ_id ON public.reminder_occurrence_history USING btree (integrator_occurrence_id);


--
-- Name: idx_reminder_occurrence_history_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_integrator_user_id ON public.reminder_occurrence_history USING btree (integrator_user_id);


--
-- Name: idx_reminder_occurrence_history_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_occurred_at ON public.reminder_occurrence_history USING btree (occurred_at DESC);


--
-- Name: idx_reminder_occurrence_history_seen_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_seen_at ON public.reminder_occurrence_history USING btree (seen_at) WHERE (seen_at IS NULL);


--
-- Name: idx_reminder_occurrence_history_skipped_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_skipped_at ON public.reminder_occurrence_history USING btree (skipped_at DESC) WHERE (skipped_at IS NOT NULL);


--
-- Name: idx_reminder_occurrence_history_snoozed_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_occurrence_history_snoozed_until ON public.reminder_occurrence_history USING btree (snoozed_until) WHERE (snoozed_until IS NOT NULL);


--
-- Name: idx_reminder_rules_integrator_rule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reminder_rules_integrator_rule_id ON public.reminder_rules USING btree (integrator_rule_id);


--
-- Name: idx_reminder_rules_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_integrator_user_id ON public.reminder_rules USING btree (integrator_user_id);


--
-- Name: idx_reminder_rules_integrator_user_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_integrator_user_updated_at ON public.reminder_rules USING btree (integrator_user_id, updated_at DESC);


--
-- Name: idx_reminder_rules_linked_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_linked_object ON public.reminder_rules USING btree (linked_object_type, linked_object_id) WHERE ((linked_object_type IS NOT NULL) AND (linked_object_id IS NOT NULL));


--
-- Name: idx_reminder_rules_linked_object_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_linked_object_type ON public.reminder_rules USING btree (linked_object_type) WHERE (linked_object_type IS NOT NULL);


--
-- Name: idx_reminder_rules_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_platform_user_id ON public.reminder_rules USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_reminder_rules_platform_user_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_platform_user_updated_at ON public.reminder_rules USING btree (platform_user_id, updated_at DESC) WHERE (platform_user_id IS NOT NULL);


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
-- Name: idx_specialist_tasks_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_tasks_owner ON public.specialist_tasks USING btree (owner_user_id);


--
-- Name: idx_specialist_tasks_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_tasks_patient ON public.specialist_tasks USING btree (patient_user_id);


--
-- Name: idx_specialist_tasks_remind_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_tasks_remind_open ON public.specialist_tasks USING btree (remind_at);


--
-- Name: idx_support_conv_msg_conv_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conv_msg_conv_created ON public.support_conversation_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_support_conv_msg_unread_incoming; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conv_msg_unread_incoming ON public.support_conversation_messages USING btree (conversation_id) WHERE ((read_at IS NULL) AND (sender_role <> 'user'::text));


--
-- Name: idx_support_conv_msg_unread_user_msgs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conv_msg_unread_user_msgs ON public.support_conversation_messages USING btree (conversation_id) WHERE ((read_at IS NULL) AND (sender_role = 'user'::text));


--
-- Name: idx_support_conversation_messages_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversation_messages_conversation_created ON public.support_conversation_messages USING btree (conversation_id, created_at);


--
-- Name: idx_support_conversation_messages_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_conversation_messages_integrator_id ON public.support_conversation_messages USING btree (integrator_message_id);


--
-- Name: idx_support_conversations_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_conversations_integrator_id ON public.support_conversations USING btree (integrator_conversation_id);


--
-- Name: idx_support_conversations_integrator_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversations_integrator_user_id ON public.support_conversations USING btree (integrator_user_id) WHERE (integrator_user_id IS NOT NULL);


--
-- Name: idx_support_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversations_last_message ON public.support_conversations USING btree (last_message_at DESC);


--
-- Name: idx_support_conversations_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_conversations_platform_user_id ON public.support_conversations USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_support_delivery_events_channel_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_delivery_events_channel_occurred ON public.support_delivery_events USING btree (channel_code, occurred_at DESC);


--
-- Name: idx_support_delivery_events_conversation_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_delivery_events_conversation_message ON public.support_delivery_events USING btree (conversation_message_id) WHERE (conversation_message_id IS NOT NULL);


--
-- Name: idx_support_delivery_events_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_delivery_events_correlation ON public.support_delivery_events USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);


--
-- Name: idx_support_delivery_events_integrator_intent_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_delivery_events_integrator_intent_uniq ON public.support_delivery_events USING btree (integrator_intent_event_id) WHERE (integrator_intent_event_id IS NOT NULL);


--
-- Name: idx_support_delivery_events_intent_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_delivery_events_intent_event ON public.support_delivery_events USING btree (integrator_intent_event_id) WHERE (integrator_intent_event_id IS NOT NULL);


--
-- Name: idx_support_question_messages_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_question_messages_integrator_id ON public.support_question_messages USING btree (integrator_question_message_id);


--
-- Name: idx_support_question_messages_question_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_question_messages_question_created ON public.support_question_messages USING btree (question_id, created_at);


--
-- Name: idx_support_questions_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_questions_conversation_id ON public.support_questions USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: idx_support_questions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_questions_created ON public.support_questions USING btree (created_at DESC);


--
-- Name: idx_support_questions_integrator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_questions_integrator_id ON public.support_questions USING btree (integrator_question_id);


--
-- Name: idx_symptom_entries_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_platform_user_id ON public.symptom_entries USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_symptom_entries_tracking_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_tracking_recorded ON public.symptom_entries USING btree (tracking_id, recorded_at DESC);


--
-- Name: idx_symptom_entries_user_type_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_user_type_recorded ON public.symptom_entries USING btree (user_id, entry_type, recorded_at DESC);


--
-- Name: idx_symptom_trackings_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_trackings_deleted ON public.symptom_trackings USING btree (user_id) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_symptom_trackings_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_trackings_platform_user_id ON public.symptom_trackings USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_symptom_trackings_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_trackings_user_active ON public.symptom_trackings USING btree (user_id, is_active);


--
-- Name: idx_template_exercises_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_exercises_order ON public.lfk_complex_template_exercises USING btree (template_id, sort_order);


--
-- Name: idx_test_attempts_one_open_per_item_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_test_attempts_one_open_per_item_patient ON public.test_attempts USING btree (instance_stage_item_id, patient_user_id) WHERE (submitted_at IS NULL);


--
-- Name: idx_test_attempts_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempts_patient ON public.test_attempts USING btree (patient_user_id);


--
-- Name: idx_test_attempts_stage_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempts_stage_item ON public.test_attempts USING btree (instance_stage_item_id);


--
-- Name: idx_test_results_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_results_attempt ON public.test_results USING btree (attempt_id);


--
-- Name: idx_test_results_attempt_test; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_test_results_attempt_test ON public.test_results USING btree (attempt_id, test_id);


--
-- Name: idx_test_results_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_results_test ON public.test_results USING btree (test_id);


--
-- Name: idx_test_set_items_set_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_set_items_set_order ON public.test_set_items USING btree (test_set_id, sort_order);


--
-- Name: idx_test_sets_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_sets_archived ON public.test_sets USING btree (is_archived);


--
-- Name: idx_test_sets_publication_arch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_sets_publication_arch ON public.test_sets USING btree (is_archived, publication_status);


--
-- Name: idx_tests_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_archived ON public.tests USING btree (is_archived);


--
-- Name: idx_tests_assessment_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_assessment_kind ON public.tests USING btree (assessment_kind);


--
-- Name: idx_tests_body_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_body_region ON public.tests USING btree (body_region_id);


--
-- Name: idx_tests_title_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_title_search ON public.tests USING btree (title);


--
-- Name: idx_treatment_program_events_instance_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_events_instance_created ON public.treatment_program_events USING btree (instance_id, created_at DESC);


--
-- Name: idx_treatment_program_inst_stage_groups_stage_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_inst_stage_groups_stage_order ON public.treatment_program_instance_stage_groups USING btree (stage_id, sort_order);


--
-- Name: idx_treatment_program_instance_stage_items_stage_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instance_stage_items_stage_order ON public.treatment_program_instance_stage_items USING btree (stage_id, sort_order);


--
-- Name: idx_treatment_program_instance_stages_instance_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instance_stages_instance_order ON public.treatment_program_instance_stages USING btree (instance_id, sort_order);


--
-- Name: idx_treatment_program_instances_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instances_patient ON public.treatment_program_instances USING btree (patient_user_id, updated_at);


--
-- Name: idx_treatment_program_instances_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_instances_template ON public.treatment_program_instances USING btree (template_id);


--
-- Name: idx_treatment_program_stage_items_stage_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_stage_items_stage_order ON public.treatment_program_template_stage_items USING btree (stage_id, sort_order);


--
-- Name: idx_treatment_program_template_stages_template_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_template_stages_template_order ON public.treatment_program_template_stages USING btree (template_id, sort_order);


--
-- Name: idx_treatment_program_templates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_templates_status ON public.treatment_program_templates USING btree (status);


--
-- Name: idx_treatment_program_tpl_stage_groups_stage_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_program_tpl_stage_groups_stage_order ON public.treatment_program_template_stage_groups USING btree (stage_id, sort_order);


--
-- Name: idx_user_channel_bindings_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_bindings_lookup ON public.user_channel_bindings USING btree (channel_code, external_id);


--
-- Name: idx_user_channel_bindings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_bindings_user_id ON public.user_channel_bindings USING btree (user_id);


--
-- Name: idx_user_channel_preferences_one_auth_pref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_channel_preferences_one_auth_pref ON public.user_channel_preferences USING btree (user_id) WHERE (is_preferred_for_auth = true);


--
-- Name: idx_user_channel_preferences_platform_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_preferences_platform_user_id ON public.user_channel_preferences USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);


--
-- Name: idx_user_channel_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_channel_preferences_user_id ON public.user_channel_preferences USING btree (user_id);


--
-- Name: idx_user_email_setup_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_setup_tokens_expires_at ON public.user_email_setup_tokens USING btree (expires_at);


--
-- Name: idx_user_email_setup_tokens_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_setup_tokens_user_email ON public.user_email_setup_tokens USING btree (user_id, email_normalized);


--
-- Name: idx_user_notification_topic_channels_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_topic_channels_user ON public.user_notification_topic_channels USING btree (user_id);


--
-- Name: idx_user_notification_topics_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_topics_user ON public.user_notification_topics USING btree (user_id);


--
-- Name: idx_user_phone_history_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_phone_history_phone ON public.user_phone_history USING btree (phone_normalized);


--
-- Name: idx_user_phone_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_phone_history_user ON public.user_phone_history USING btree (platform_user_id);


--
-- Name: idx_user_subscriptions_webapp_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_webapp_topic ON public.user_subscriptions_webapp USING btree (integrator_topic_id);


--
-- Name: idx_user_subscriptions_webapp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_webapp_user ON public.user_subscriptions_webapp USING btree (integrator_user_id);


--
-- Name: idx_user_web_push_subscriptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_web_push_subscriptions_user ON public.user_web_push_subscriptions USING btree (user_id);


--
-- Name: idx_users_merged_into_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_merged_into_user_id ON public.users USING btree (merged_into_user_id) WHERE (merged_into_user_id IS NOT NULL);


--
-- Name: media_transcode_jobs_one_active_per_media; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_transcode_jobs_one_active_per_media ON public.media_transcode_jobs USING btree (media_id) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: message_drafts_identity_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX message_drafts_identity_source_uidx ON public.message_drafts USING btree (identity_id, source);


--
-- Name: message_drafts_source_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_drafts_source_updated_idx ON public.message_drafts USING btree (source, updated_at DESC);


--
-- Name: operator_incidents_open_dedup_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operator_incidents_open_dedup_key_uniq ON public.operator_incidents USING btree (dedup_key) WHERE (resolved_at IS NULL);


--
-- Name: question_messages_question_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_messages_question_created_idx ON public.question_messages USING btree (question_id, created_at);


--
-- Name: reference_items_category_deleted_active_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_items_category_deleted_active_sort_idx ON public.reference_items USING btree (category_id, deleted_at, is_active, sort_order);


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
-- Name: treatment_program_instance_stage_groups_one_rec_per_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_instance_stage_groups_one_rec_per_stage ON public.treatment_program_instance_stage_groups USING btree (stage_id) WHERE (system_kind = 'recommendations'::text);


--
-- Name: treatment_program_instance_stage_groups_one_tests_per_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_instance_stage_groups_one_tests_per_stage ON public.treatment_program_instance_stage_groups USING btree (stage_id) WHERE (system_kind = 'tests'::text);


--
-- Name: treatment_program_template_stage_groups_one_rec_per_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_template_stage_groups_one_rec_per_stage ON public.treatment_program_template_stage_groups USING btree (stage_id) WHERE (system_kind = 'recommendations'::text);


--
-- Name: treatment_program_template_stage_groups_one_tests_per_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_template_stage_groups_one_tests_per_stage ON public.treatment_program_template_stage_groups USING btree (stage_id) WHERE (system_kind = 'tests'::text);


--
-- Name: treatment_program_template_stages_tpl_id_sort_order_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX treatment_program_template_stages_tpl_id_sort_order_uidx ON public.treatment_program_template_stages USING btree (template_id, sort_order);


--
-- Name: uq_be_cancel_policies_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_be_cancel_policies_scope ON public.be_cancellation_policies USING btree (organization_id, scope_level, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: uq_be_patient_booking_profiles_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_be_patient_booking_profiles_org_user ON public.be_patient_booking_profiles USING btree (organization_id, platform_user_id);


--
-- Name: uq_be_reschedule_policies_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_be_reschedule_policies_scope ON public.be_reschedule_policies USING btree (organization_id, scope_level, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: uq_doctor_patient_support_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_doctor_patient_support_patient ON public.doctor_patient_support USING btree (patient_user_id);


--
-- Name: uq_media_folders_child_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_folders_child_name ON public.media_folders USING btree (parent_id, name_normalized) WHERE (parent_id IS NOT NULL);


--
-- Name: uq_media_folders_client_files_root; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_folders_client_files_root ON public.media_folders USING btree ((1)) WHERE (kind = 'client_files_root'::text);


--
-- Name: uq_media_folders_client_patient_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_folders_client_patient_user ON public.media_folders USING btree (patient_user_id) WHERE ((kind = 'client_patient'::text) AND (patient_user_id IS NOT NULL));


--
-- Name: uq_media_folders_root_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_folders_root_name ON public.media_folders USING btree (name_normalized) WHERE (parent_id IS NULL);


--
-- Name: uq_media_upload_sessions_one_active_per_media; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_media_upload_sessions_one_active_per_media ON public.media_upload_sessions USING btree (media_id) WHERE (status = ANY (ARRAY['initiated'::text, 'uploading'::text, 'completing'::text]));


--
-- Name: uq_outgoing_delivery_queue_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_outgoing_delivery_queue_event_id ON public.outgoing_delivery_queue USING btree (event_id);


--
-- Name: uq_patient_merge_candidates_pending_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_patient_merge_candidates_pending_pair ON public.patient_merge_candidates USING btree (anchor_user_id, candidate_user_id) WHERE (status = 'pending'::text);


--
-- Name: uq_platform_user_contacts_user_type_value; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_platform_user_contacts_user_type_value ON public.platform_user_contacts USING btree (platform_user_id, contact_type, value_normalized);


--
-- Name: uq_platform_users_email_normalized_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_platform_users_email_normalized_active ON public.platform_users USING btree (email_normalized) WHERE ((merged_into_id IS NULL) AND (email_normalized IS NOT NULL));


--
-- Name: uq_program_item_discussion_support_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_program_item_discussion_support_message_id ON public.program_item_discussion_messages USING btree (support_message_id) WHERE (support_message_id IS NOT NULL);


--
-- Name: uq_reminder_journal_once_done_per_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reminder_journal_once_done_per_occurrence ON public.reminder_journal USING btree (occurrence_id, action) WHERE ((occurrence_id IS NOT NULL) AND (action = 'done'::text));


--
-- Name: uq_reminder_journal_once_skipped_per_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reminder_journal_once_skipped_per_occurrence ON public.reminder_journal USING btree (occurrence_id, action) WHERE ((occurrence_id IS NOT NULL) AND (action = 'skipped'::text));


--
-- Name: uq_reminder_journal_snooze_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reminder_journal_snooze_dedupe ON public.reminder_journal USING btree (occurrence_id, action, snooze_until) WHERE ((occurrence_id IS NOT NULL) AND (action = 'snoozed'::text) AND (snooze_until IS NOT NULL));


--
-- Name: uq_symptom_entries_patient_practice_completion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_symptom_entries_patient_practice_completion_id ON public.symptom_entries USING btree (patient_practice_completion_id) WHERE (patient_practice_completion_id IS NOT NULL);


--
-- Name: uq_symptom_trackings_general_wellbeing_active_platform_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_symptom_trackings_general_wellbeing_active_platform_user ON public.symptom_trackings USING btree (platform_user_id) WHERE ((symptom_key = 'general_wellbeing'::text) AND (deleted_at IS NULL) AND (platform_user_id IS NOT NULL));


--
-- Name: uq_symptom_trackings_warmup_feeling_active_platform_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_symptom_trackings_warmup_feeling_active_platform_user ON public.symptom_trackings USING btree (platform_user_id) WHERE ((symptom_key = 'warmup_feeling'::text) AND (deleted_at IS NULL) AND (platform_user_id IS NOT NULL));


--
-- Name: uq_treatment_program_instances_one_active_per_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_treatment_program_instances_one_active_per_patient ON public.treatment_program_instances USING btree (patient_user_id) WHERE (status = 'active'::text);


--
-- Name: uq_user_channel_preferences_platform_user_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_channel_preferences_platform_user_channel ON public.user_channel_preferences USING btree (platform_user_id, channel_code);


--
-- Name: uq_user_phone_history_phone_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_phone_history_phone_active ON public.user_phone_history USING btree (phone_normalized) WHERE (valid_to IS NULL);


--
-- Name: uq_user_phone_history_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_phone_history_user_active ON public.user_phone_history USING btree (platform_user_id) WHERE (valid_to IS NULL);


--
-- Name: uq_user_web_push_subscriptions_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_web_push_subscriptions_endpoint ON public.user_web_push_subscriptions USING btree (endpoint);


--
-- Name: user_email_setup_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_email_setup_tokens_token_hash_key ON public.user_email_setup_tokens USING btree (token_hash);


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
-- Name: webapp_reminder_occurrences_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webapp_reminder_occurrences_due_idx ON public.webapp_reminder_occurrences USING btree (status, planned_at) WHERE (status = 'planned'::text);


--
-- Name: webapp_reminder_occurrences_platform_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webapp_reminder_occurrences_platform_user_idx ON public.webapp_reminder_occurrences USING btree (platform_user_id);


--
-- Name: webapp_reminder_occurrences_rule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webapp_reminder_occurrences_rule_idx ON public.webapp_reminder_occurrences USING btree (integrator_rule_id);


--
-- Name: webapp_reminder_occurrences_rule_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webapp_reminder_occurrences_rule_key_uniq ON public.webapp_reminder_occurrences USING btree (integrator_rule_id, occurrence_key);


--
-- Name: mailing_topics stage13_freeze_mailing_topics; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stage13_freeze_mailing_topics BEFORE INSERT OR DELETE OR UPDATE ON public.mailing_topics FOR EACH ROW EXECUTE FUNCTION public.stage13_prevent_write_mailing_topics();


--
-- Name: user_subscriptions stage13_freeze_user_subscriptions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stage13_freeze_user_subscriptions BEFORE INSERT OR DELETE OR UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.stage13_prevent_write_user_subscriptions();


--
-- Name: media_folders trg_media_folders_cycle_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_media_folders_cycle_upd BEFORE UPDATE OF parent_id ON public.media_folders FOR EACH ROW WHEN ((new.parent_id IS DISTINCT FROM old.parent_id)) EXECUTE FUNCTION public.media_folders_prevent_cycle();


--
-- Name: media_folders trg_media_folders_depth_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_media_folders_depth_ins BEFORE INSERT ON public.media_folders FOR EACH ROW EXECUTE FUNCTION public.media_folders_enforce_depth();


--
-- Name: media_folders trg_media_folders_depth_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_media_folders_depth_upd BEFORE UPDATE OF parent_id ON public.media_folders FOR EACH ROW WHEN ((new.parent_id IS DISTINCT FROM old.parent_id)) EXECUTE FUNCTION public.media_folders_enforce_depth();


--
-- Name: admin_audit_log admin_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: appointment_records appointment_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_records
    ADD CONSTRAINT appointment_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: appointment_records appointment_records_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_records
    ADD CONSTRAINT appointment_records_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_cancellations be_appointment_cancellations_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_cancellations be_appointment_cancellations_applied_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_applied_policy_id_fkey FOREIGN KEY (applied_policy_id) REFERENCES public.be_cancellation_policies(id) ON DELETE SET NULL;


--
-- Name: be_appointment_cancellations be_appointment_cancellations_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_cancellations be_appointment_cancellations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_cancellations
    ADD CONSTRAINT be_appointment_cancellations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_events be_appointment_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_events
    ADD CONSTRAINT be_appointment_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_events be_appointment_events_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_events
    ADD CONSTRAINT be_appointment_events_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_events be_appointment_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_events
    ADD CONSTRAINT be_appointment_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_history_events be_appointment_history_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_history_events
    ADD CONSTRAINT be_appointment_history_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_history_events be_appointment_history_events_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_history_events
    ADD CONSTRAINT be_appointment_history_events_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_history_events be_appointment_history_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_history_events
    ADD CONSTRAINT be_appointment_history_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_reschedules be_appointment_reschedules_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointment_reschedules be_appointment_reschedules_applied_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_applied_policy_id_fkey FOREIGN KEY (applied_policy_id) REFERENCES public.be_reschedule_policies(id) ON DELETE SET NULL;


--
-- Name: be_appointment_reschedules be_appointment_reschedules_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_reschedules be_appointment_reschedules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_reschedules
    ADD CONSTRAINT be_appointment_reschedules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointment_staff_comments be_appointment_staff_comments_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointment_staff_comments
    ADD CONSTRAINT be_appointment_staff_comments_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_appointments be_appointments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE SET NULL;


--
-- Name: be_appointments be_appointments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_appointments be_appointments_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_appointments be_appointments_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE SET NULL;


--
-- Name: be_appointments be_appointments_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE SET NULL;


--
-- Name: be_appointments be_appointments_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_appointments
    ADD CONSTRAINT be_appointments_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE SET NULL;


--
-- Name: be_availability_rules be_availability_rules_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_availability_rules
    ADD CONSTRAINT be_availability_rules_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_availability_rules be_availability_rules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_availability_rules
    ADD CONSTRAINT be_availability_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_availability_rules be_availability_rules_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_availability_rules
    ADD CONSTRAINT be_availability_rules_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_booking_form_fields be_booking_form_fields_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_fields
    ADD CONSTRAINT be_booking_form_fields_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_booking_form_submissions be_booking_form_submissions_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT be_booking_form_submissions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE CASCADE;


--
-- Name: be_booking_form_submissions be_booking_form_submissions_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT be_booking_form_submissions_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.be_booking_form_fields(id) ON DELETE CASCADE;


--
-- Name: be_booking_form_submissions be_booking_form_submissions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_booking_form_submissions
    ADD CONSTRAINT be_booking_form_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_branches be_branches_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_branches
    ADD CONSTRAINT be_branches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_cancellation_policies be_cancellation_policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_cancellation_policies
    ADD CONSTRAINT be_cancellation_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_clinic_services be_clinic_services_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_clinic_services
    ADD CONSTRAINT be_clinic_services_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_external_entity_mappings be_external_entity_mappings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_external_entity_mappings
    ADD CONSTRAINT be_external_entity_mappings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_package_history_events be_package_history_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_history_events
    ADD CONSTRAINT be_package_history_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_package_history_events be_package_history_events_patient_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_history_events
    ADD CONSTRAINT be_package_history_events_patient_package_id_fkey FOREIGN KEY (patient_package_id) REFERENCES public.be_patient_packages(id) ON DELETE CASCADE;


--
-- Name: be_package_items be_package_items_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_items
    ADD CONSTRAINT be_package_items_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.be_subscription_packages(id) ON DELETE CASCADE;


--
-- Name: be_package_items be_package_items_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_items
    ADD CONSTRAINT be_package_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE RESTRICT;


--
-- Name: be_package_usages be_package_usages_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_package_usages be_package_usages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_created_by_fkey FOREIGN KEY (created_by_platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_package_usages be_package_usages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_package_usages be_package_usages_patient_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_patient_package_id_fkey FOREIGN KEY (patient_package_id) REFERENCES public.be_patient_packages(id) ON DELETE CASCADE;


--
-- Name: be_package_usages be_package_usages_patient_package_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_package_usages
    ADD CONSTRAINT be_package_usages_patient_package_item_id_fkey FOREIGN KEY (patient_package_item_id) REFERENCES public.be_patient_package_items(id) ON DELETE CASCADE;


--
-- Name: be_patient_booking_profiles be_patient_booking_profiles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_booking_profiles
    ADD CONSTRAINT be_patient_booking_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_patient_booking_profiles be_patient_booking_profiles_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_booking_profiles
    ADD CONSTRAINT be_patient_booking_profiles_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_patient_booking_profiles be_patient_booking_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_booking_profiles
    ADD CONSTRAINT be_patient_booking_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_patient_package_items be_patient_package_items_patient_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_package_items
    ADD CONSTRAINT be_patient_package_items_patient_package_id_fkey FOREIGN KEY (patient_package_id) REFERENCES public.be_patient_packages(id) ON DELETE CASCADE;


--
-- Name: be_patient_package_items be_patient_package_items_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_package_items
    ADD CONSTRAINT be_patient_package_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE RESTRICT;


--
-- Name: be_patient_packages be_patient_packages_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_assigned_by_fkey FOREIGN KEY (assigned_by_platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_patient_packages be_patient_packages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_patient_packages be_patient_packages_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_patient_packages be_patient_packages_subscription_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_packages
    ADD CONSTRAINT be_patient_packages_subscription_package_id_fkey FOREIGN KEY (subscription_package_id) REFERENCES public.be_subscription_packages(id) ON DELETE SET NULL;


--
-- Name: be_patient_timeline_events be_patient_timeline_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_timeline_events
    ADD CONSTRAINT be_patient_timeline_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_patient_timeline_events be_patient_timeline_events_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_patient_timeline_events
    ADD CONSTRAINT be_patient_timeline_events_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: be_payment_history_events be_payment_history_events_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_payment_history_events be_payment_history_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_payment_history_events be_payment_history_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.be_payments(id) ON DELETE SET NULL;


--
-- Name: be_payment_history_events be_payment_history_events_refund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_history_events
    ADD CONSTRAINT be_payment_history_events_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.be_refunds(id) ON DELETE SET NULL;


--
-- Name: be_payment_intents be_payment_intents_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_intents
    ADD CONSTRAINT be_payment_intents_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_payment_intents be_payment_intents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_intents
    ADD CONSTRAINT be_payment_intents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_payment_intents be_payment_intents_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_intents
    ADD CONSTRAINT be_payment_intents_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_payment_provider_events be_payment_provider_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payment_provider_events
    ADD CONSTRAINT be_payment_provider_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_payments be_payments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payments
    ADD CONSTRAINT be_payments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_payments be_payments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payments
    ADD CONSTRAINT be_payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_payments be_payments_payment_intent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_payments
    ADD CONSTRAINT be_payments_payment_intent_id_fkey FOREIGN KEY (payment_intent_id) REFERENCES public.be_payment_intents(id) ON DELETE CASCADE;


--
-- Name: be_prepayment_policies be_prepayment_policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_prepayment_policies
    ADD CONSTRAINT be_prepayment_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_prepayment_policies be_prepayment_policies_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_prepayment_policies
    ADD CONSTRAINT be_prepayment_policies_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE CASCADE;


--
-- Name: be_product_history_events be_product_history_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_history_events
    ADD CONSTRAINT be_product_history_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_product_history_events be_product_history_events_product_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_history_events
    ADD CONSTRAINT be_product_history_events_product_purchase_id_fkey FOREIGN KEY (product_purchase_id) REFERENCES public.be_product_purchases(id) ON DELETE CASCADE;


--
-- Name: be_product_pay_links be_product_pay_links_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_pay_links
    ADD CONSTRAINT be_product_pay_links_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_product_pay_links be_product_pay_links_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_pay_links
    ADD CONSTRAINT be_product_pay_links_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.be_products(id) ON DELETE CASCADE;


--
-- Name: be_product_purchases be_product_purchases_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_assigned_by_fkey FOREIGN KEY (assigned_by_platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_product_purchases be_product_purchases_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_product_purchases be_product_purchases_pay_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_pay_link_id_fkey FOREIGN KEY (pay_link_id) REFERENCES public.be_product_pay_links(id) ON DELETE SET NULL;


--
-- Name: be_product_purchases be_product_purchases_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: be_product_purchases be_product_purchases_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_product_purchases
    ADD CONSTRAINT be_product_purchases_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.be_products(id) ON DELETE RESTRICT;


--
-- Name: be_products be_products_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_products
    ADD CONSTRAINT be_products_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;


--
-- Name: be_products be_products_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_products
    ADD CONSTRAINT be_products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_products be_products_subscription_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_products
    ADD CONSTRAINT be_products_subscription_package_id_fkey FOREIGN KEY (subscription_package_id) REFERENCES public.be_subscription_packages(id) ON DELETE SET NULL;


--
-- Name: be_refunds be_refunds_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_refunds
    ADD CONSTRAINT be_refunds_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: be_refunds be_refunds_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_refunds
    ADD CONSTRAINT be_refunds_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_refunds be_refunds_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_refunds
    ADD CONSTRAINT be_refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.be_payments(id) ON DELETE CASCADE;


--
-- Name: be_reschedule_policies be_reschedule_policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_reschedule_policies
    ADD CONSTRAINT be_reschedule_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_rooms be_rooms_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_rooms
    ADD CONSTRAINT be_rooms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_rooms be_rooms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_rooms
    ADD CONSTRAINT be_rooms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_schedule_blocks be_schedule_blocks_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_schedule_blocks be_schedule_blocks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_schedule_blocks be_schedule_blocks_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE CASCADE;


--
-- Name: be_schedule_blocks be_schedule_blocks_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_schedule_blocks
    ADD CONSTRAINT be_schedule_blocks_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_service_location_availability be_sla_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT be_sla_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_service_location_availability be_sla_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT be_sla_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_service_location_availability be_sla_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_service_location_availability
    ADD CONSTRAINT be_sla_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE CASCADE;


--
-- Name: be_specialist_locations be_specialist_locations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT be_specialist_locations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_specialist_locations be_specialist_locations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT be_specialist_locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_specialist_locations be_specialist_locations_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_locations
    ADD CONSTRAINT be_specialist_locations_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_specialist_rooms be_specialist_rooms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT be_specialist_rooms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_specialist_rooms be_specialist_rooms_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT be_specialist_rooms_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE CASCADE;


--
-- Name: be_specialist_rooms be_specialist_rooms_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_rooms
    ADD CONSTRAINT be_specialist_rooms_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_specialists be_specialists_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialists
    ADD CONSTRAINT be_specialists_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_specialist_service_availability be_ssa_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_specialist_service_availability be_ssa_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_specialist_service_availability be_ssa_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE SET NULL;


--
-- Name: be_specialist_service_availability be_ssa_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.be_clinic_services(id) ON DELETE CASCADE;


--
-- Name: be_specialist_service_availability be_ssa_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_specialist_service_availability
    ADD CONSTRAINT be_ssa_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: be_subscription_packages be_subscription_packages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_subscription_packages
    ADD CONSTRAINT be_subscription_packages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_working_hours be_working_hours_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.be_branches(id) ON DELETE CASCADE;


--
-- Name: be_working_hours be_working_hours_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: be_working_hours be_working_hours_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.be_rooms(id) ON DELETE CASCADE;


--
-- Name: be_working_hours be_working_hours_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.be_working_hours
    ADD CONSTRAINT be_working_hours_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.be_specialists(id) ON DELETE CASCADE;


--
-- Name: booking_branch_services booking_branch_services_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT booking_branch_services_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.booking_branches(id);


--
-- Name: booking_branch_services booking_branch_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT booking_branch_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.booking_services(id);


--
-- Name: booking_branch_services booking_branch_services_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branch_services
    ADD CONSTRAINT booking_branch_services_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.booking_specialists(id);


--
-- Name: booking_branches booking_branches_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_branches
    ADD CONSTRAINT booking_branches_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.booking_cities(id);


--
-- Name: booking_specialists booking_specialists_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_specialists
    ADD CONSTRAINT booking_specialists_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.booking_branches(id);


--
-- Name: broadcast_audit_recipients broadcast_audit_recipients_audit_id_broadcast_audit_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit_recipients
    ADD CONSTRAINT broadcast_audit_recipients_audit_id_broadcast_audit_id_fk FOREIGN KEY (audit_id) REFERENCES public.broadcast_audit(id) ON DELETE CASCADE;


--
-- Name: broadcast_audit_recipients broadcast_audit_recipients_platform_user_id_platform_users_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_audit_recipients
    ADD CONSTRAINT broadcast_audit_recipients_platform_user_id_platform_users_id_f FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: channel_link_secrets channel_link_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_link_secrets
    ADD CONSTRAINT channel_link_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: clinical_test_regions clinical_test_regions_body_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_regions
    ADD CONSTRAINT clinical_test_regions_body_region_id_fkey FOREIGN KEY (body_region_id) REFERENCES public.reference_items(id) ON DELETE CASCADE;


--
-- Name: clinical_test_regions clinical_test_regions_clinical_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_test_regions
    ADD CONSTRAINT clinical_test_regions_clinical_test_id_fkey FOREIGN KEY (clinical_test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.platform_users(id) ON DELETE RESTRICT;


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
-- Name: content_access_grants_webapp content_access_grants_webapp_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants_webapp
    ADD CONSTRAINT content_access_grants_webapp_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: content_pages content_pages_linked_course_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_pages
    ADD CONSTRAINT content_pages_linked_course_fkey FOREIGN KEY (linked_course_id) REFERENCES public.courses(id) ON DELETE SET NULL;


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
-- Name: courses courses_intro_lesson_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_intro_lesson_page_id_fkey FOREIGN KEY (intro_lesson_page_id) REFERENCES public.content_pages(id) ON DELETE SET NULL;


--
-- Name: courses courses_program_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_program_template_id_fkey FOREIGN KEY (program_template_id) REFERENCES public.treatment_program_templates(id) ON DELETE RESTRICT;


--
-- Name: doctor_notes doctor_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_notes
    ADD CONSTRAINT doctor_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.platform_users(id);


--
-- Name: doctor_notes doctor_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_notes
    ADD CONSTRAINT doctor_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: doctor_patient_support doctor_patient_support_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_support
    ADD CONSTRAINT doctor_patient_support_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: doctor_patient_support doctor_patient_support_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_support
    ADD CONSTRAINT doctor_patient_support_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: email_challenges email_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_challenges
    ADD CONSTRAINT email_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: email_send_cooldowns email_send_cooldowns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_cooldowns
    ADD CONSTRAINT email_send_cooldowns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lfk_complex_exercises lfk_complex_exercises_complex_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_exercises
    ADD CONSTRAINT lfk_complex_exercises_complex_id_fkey FOREIGN KEY (complex_id) REFERENCES public.lfk_complexes(id) ON DELETE CASCADE;


--
-- Name: lfk_complex_exercises lfk_complex_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_exercises
    ADD CONSTRAINT lfk_complex_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.lfk_exercises(id);


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_template_exercises
    ADD CONSTRAINT lfk_complex_template_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.lfk_exercises(id);


--
-- Name: lfk_complex_template_exercises lfk_complex_template_exercises_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_template_exercises
    ADD CONSTRAINT lfk_complex_template_exercises_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.lfk_complex_templates(id) ON DELETE CASCADE;


--
-- Name: lfk_complex_templates lfk_complex_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complex_templates
    ADD CONSTRAINT lfk_complex_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id);


--
-- Name: lfk_complexes lfk_complexes_diagnosis_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_diagnosis_ref_id_fkey FOREIGN KEY (diagnosis_ref_id) REFERENCES public.reference_items(id);


--
-- Name: lfk_complexes lfk_complexes_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: lfk_complexes lfk_complexes_region_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_region_ref_id_fkey FOREIGN KEY (region_ref_id) REFERENCES public.reference_items(id);


--
-- Name: lfk_complexes lfk_complexes_symptom_tracking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_complexes
    ADD CONSTRAINT lfk_complexes_symptom_tracking_id_fkey FOREIGN KEY (symptom_tracking_id) REFERENCES public.symptom_trackings(id);


--
-- Name: lfk_exercise_media lfk_exercise_media_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_media
    ADD CONSTRAINT lfk_exercise_media_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.lfk_exercises(id) ON DELETE CASCADE;


--
-- Name: lfk_exercise_regions lfk_exercise_regions_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_regions
    ADD CONSTRAINT lfk_exercise_regions_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.lfk_exercises(id) ON DELETE CASCADE;


--
-- Name: lfk_exercise_regions lfk_exercise_regions_region_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercise_regions
    ADD CONSTRAINT lfk_exercise_regions_region_ref_id_fkey FOREIGN KEY (region_ref_id) REFERENCES public.reference_items(id) ON DELETE CASCADE;


--
-- Name: lfk_exercises lfk_exercises_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercises
    ADD CONSTRAINT lfk_exercises_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id);


--
-- Name: lfk_exercises lfk_exercises_region_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_exercises
    ADD CONSTRAINT lfk_exercises_region_ref_id_fkey FOREIGN KEY (region_ref_id) REFERENCES public.reference_items(id);


--
-- Name: lfk_sessions lfk_sessions_complex_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_sessions
    ADD CONSTRAINT lfk_sessions_complex_id_fkey FOREIGN KEY (complex_id) REFERENCES public.lfk_complexes(id) ON DELETE CASCADE;


--
-- Name: lfk_sessions lfk_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfk_sessions
    ADD CONSTRAINT lfk_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: login_tokens login_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_tokens
    ADD CONSTRAINT login_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


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
-- Name: material_ratings material_ratings_user_id_platform_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_ratings
    ADD CONSTRAINT material_ratings_user_id_platform_users_id_fk FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_files media_files_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.media_folders(id) ON DELETE RESTRICT;


--
-- Name: media_files media_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: media_folders media_folders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: media_folders media_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.media_folders(id) ON DELETE RESTRICT;


--
-- Name: media_folders media_folders_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: media_hls_proxy_error_events media_hls_proxy_error_events_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_hls_proxy_error_events
    ADD CONSTRAINT media_hls_proxy_error_events_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_hls_proxy_error_events media_hls_proxy_error_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_hls_proxy_error_events
    ADD CONSTRAINT media_hls_proxy_error_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_playback_client_events media_playback_client_events_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_client_events
    ADD CONSTRAINT media_playback_client_events_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_playback_client_events media_playback_client_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_client_events
    ADD CONSTRAINT media_playback_client_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_playback_resolution_events media_playback_resolution_events_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_resolution_events
    ADD CONSTRAINT media_playback_resolution_events_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_playback_resolution_events media_playback_resolution_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_resolution_events
    ADD CONSTRAINT media_playback_resolution_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_playback_user_video_first_resolve media_playback_user_video_first_resolve_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_user_video_first_resolve
    ADD CONSTRAINT media_playback_user_video_first_resolve_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_playback_user_video_first_resolve media_playback_user_video_first_resolve_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_user_video_first_resolve
    ADD CONSTRAINT media_playback_user_video_first_resolve_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: media_transcode_jobs media_transcode_jobs_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_transcode_jobs
    ADD CONSTRAINT media_transcode_jobs_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_upload_sessions media_upload_sessions_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: media_upload_sessions media_upload_sessions_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: message_drafts message_drafts_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_drafts
    ADD CONSTRAINT message_drafts_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.identities(id) ON DELETE CASCADE;


--
-- Name: message_log message_log_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_log
    ADD CONSTRAINT message_log_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: online_intake_answers online_intake_answers_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_answers
    ADD CONSTRAINT online_intake_answers_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.online_intake_requests(id) ON DELETE CASCADE;


--
-- Name: online_intake_attachments online_intake_attachments_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_attachments
    ADD CONSTRAINT online_intake_attachments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.online_intake_requests(id) ON DELETE CASCADE;


--
-- Name: online_intake_requests online_intake_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_requests
    ADD CONSTRAINT online_intake_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id);


--
-- Name: online_intake_status_history online_intake_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_status_history
    ADD CONSTRAINT online_intake_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.platform_users(id);


--
-- Name: online_intake_status_history online_intake_status_history_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_intake_status_history
    ADD CONSTRAINT online_intake_status_history_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.online_intake_requests(id) ON DELETE CASCADE;


--
-- Name: patient_bookings patient_bookings_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.booking_branches(id);


--
-- Name: patient_bookings patient_bookings_branch_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_branch_service_id_fkey FOREIGN KEY (branch_service_id) REFERENCES public.booking_branch_services(id);


--
-- Name: patient_bookings patient_bookings_canonical_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_canonical_appointment_id_fkey FOREIGN KEY (canonical_appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: patient_bookings patient_bookings_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_bookings patient_bookings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_bookings
    ADD CONSTRAINT patient_bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.booking_services(id);


--
-- Name: patient_content_rating_feedback patient_content_rating_feedback_content_page_id_content_pages_i; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_content_rating_feedback
    ADD CONSTRAINT patient_content_rating_feedback_content_page_id_content_pages_i FOREIGN KEY (content_page_id) REFERENCES public.content_pages(id) ON DELETE CASCADE;


--
-- Name: patient_content_rating_feedback patient_content_rating_feedback_user_id_platform_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_content_rating_feedback
    ADD CONSTRAINT patient_content_rating_feedback_user_id_platform_users_id_fk FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_presentations patient_daily_warmup_presentations_content_page_id_content_page; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_presentations
    ADD CONSTRAINT patient_daily_warmup_presentations_content_page_id_content_page FOREIGN KEY (content_page_id) REFERENCES public.content_pages(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_presentations patient_daily_warmup_presentations_user_id_platform_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_presentations
    ADD CONSTRAINT patient_daily_warmup_presentations_user_id_platform_users_id_fk FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_video_views patient_daily_warmup_video_views_content_page_id_content_pages_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_video_views
    ADD CONSTRAINT patient_daily_warmup_video_views_content_page_id_content_pages_ FOREIGN KEY (content_page_id) REFERENCES public.content_pages(id) ON DELETE CASCADE;


--
-- Name: patient_daily_warmup_video_views patient_daily_warmup_video_views_user_id_platform_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_daily_warmup_video_views
    ADD CONSTRAINT patient_daily_warmup_video_views_user_id_platform_users_id_fk FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_home_block_items patient_home_block_items_block_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_block_items
    ADD CONSTRAINT patient_home_block_items_block_fkey FOREIGN KEY (block_code) REFERENCES public.patient_home_blocks(code) ON DELETE CASCADE;


--
-- Name: patient_lfk_assignments patient_lfk_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.platform_users(id);


--
-- Name: patient_lfk_assignments patient_lfk_assignments_complex_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_complex_id_fkey FOREIGN KEY (complex_id) REFERENCES public.lfk_complexes(id);


--
-- Name: patient_lfk_assignments patient_lfk_assignments_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id);


--
-- Name: patient_lfk_assignments patient_lfk_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_lfk_assignments
    ADD CONSTRAINT patient_lfk_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.lfk_complex_templates(id);


--
-- Name: patient_merge_candidates patient_merge_candidates_anchor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_anchor_user_id_fkey FOREIGN KEY (anchor_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_merge_candidates patient_merge_candidates_candidate_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_candidate_user_id_fkey FOREIGN KEY (candidate_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: patient_merge_candidates patient_merge_candidates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;


--
-- Name: patient_merge_candidates patient_merge_candidates_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: patient_merge_candidates patient_merge_candidates_trigger_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_merge_candidates
    ADD CONSTRAINT patient_merge_candidates_trigger_appointment_id_fkey FOREIGN KEY (trigger_appointment_id) REFERENCES public.be_appointments(id) ON DELETE SET NULL;


--
-- Name: patient_practice_completions patient_practice_completions_content_page_id_content_pages_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_practice_completions
    ADD CONSTRAINT patient_practice_completions_content_page_id_content_pages_id_f FOREIGN KEY (content_page_id) REFERENCES public.content_pages(id) ON DELETE CASCADE;


--
-- Name: phone_messenger_bind_secrets phone_messenger_bind_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_messenger_bind_secrets
    ADD CONSTRAINT phone_messenger_bind_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: platform_user_contacts platform_user_contacts_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_user_contacts
    ADD CONSTRAINT platform_user_contacts_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: platform_users platform_users_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.platform_users(id);


--
-- Name: platform_users platform_users_merged_into_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_users
    ADD CONSTRAINT platform_users_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: product_analytics_events_recent product_analytics_events_recent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_events_recent
    ADD CONSTRAINT product_analytics_events_recent_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: product_analytics_user_hourly product_analytics_user_hourly_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_analytics_user_hourly
    ADD CONSTRAINT product_analytics_user_hourly_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: product_push_notifications product_push_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_push_notifications
    ADD CONSTRAINT product_push_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: program_action_log program_action_log_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_action_log
    ADD CONSTRAINT program_action_log_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.treatment_program_instances(id) ON DELETE CASCADE;


--
-- Name: program_action_log program_action_log_instance_stage_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_action_log
    ADD CONSTRAINT program_action_log_instance_stage_item_id_fkey FOREIGN KEY (instance_stage_item_id) REFERENCES public.treatment_program_instance_stage_items(id) ON DELETE CASCADE;


--
-- Name: program_action_log program_action_log_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_action_log
    ADD CONSTRAINT program_action_log_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_messages program_item_discussion_messages_media_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_media_file_id_fkey FOREIGN KEY (media_file_id) REFERENCES public.media_files(id) ON DELETE SET NULL;


--
-- Name: program_item_discussion_messages program_item_discussion_messages_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_messages program_item_discussion_messages_stage_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_stage_item_id_fkey FOREIGN KEY (instance_stage_item_id) REFERENCES public.treatment_program_instance_stage_items(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_messages program_item_discussion_messages_support_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_messages
    ADD CONSTRAINT program_item_discussion_messages_support_message_id_fkey FOREIGN KEY (support_message_id) REFERENCES public.support_conversation_messages(id) ON DELETE SET NULL;


--
-- Name: program_item_discussion_reads program_item_discussion_reads_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_reads
    ADD CONSTRAINT program_item_discussion_reads_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: program_item_discussion_reads program_item_discussion_reads_stage_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_item_discussion_reads
    ADD CONSTRAINT program_item_discussion_reads_stage_item_id_fkey FOREIGN KEY (instance_stage_item_id) REFERENCES public.treatment_program_instance_stage_items(id) ON DELETE CASCADE;


--
-- Name: question_messages question_messages_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_messages
    ADD CONSTRAINT question_messages_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.user_questions(id) ON DELETE CASCADE;


--
-- Name: recommendation_regions recommendation_regions_body_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_regions
    ADD CONSTRAINT recommendation_regions_body_region_id_fkey FOREIGN KEY (body_region_id) REFERENCES public.reference_items(id) ON DELETE CASCADE;


--
-- Name: recommendation_regions recommendation_regions_recommendation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_regions
    ADD CONSTRAINT recommendation_regions_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id) ON DELETE CASCADE;


--
-- Name: recommendations recommendations_body_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_body_region_id_fkey FOREIGN KEY (body_region_id) REFERENCES public.reference_items(id) ON DELETE SET NULL;


--
-- Name: recommendations recommendations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: reference_items reference_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_items
    ADD CONSTRAINT reference_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.reference_categories(id) ON DELETE CASCADE;


--
-- Name: reminder_journal reminder_journal_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_journal
    ADD CONSTRAINT reminder_journal_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.reminder_occurrence_history(integrator_occurrence_id) ON DELETE SET NULL;


--
-- Name: reminder_journal reminder_journal_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_journal
    ADD CONSTRAINT reminder_journal_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.reminder_rules(id) ON DELETE CASCADE;


--
-- Name: reminder_rules reminder_rules_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.rubitime_branches(id);


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_cooperator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_cooperator_id_fkey FOREIGN KEY (cooperator_id) REFERENCES public.rubitime_cooperators(id);


--
-- Name: rubitime_booking_profiles rubitime_booking_profiles_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubitime_booking_profiles
    ADD CONSTRAINT rubitime_booking_profiles_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.rubitime_services(id);


--
-- Name: specialist_tasks specialist_tasks_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specialist_tasks
    ADD CONSTRAINT specialist_tasks_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: support_conversation_messages support_conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversation_messages
    ADD CONSTRAINT support_conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.support_conversations(id) ON DELETE CASCADE;


--
-- Name: support_conversations support_conversations_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_conversations
    ADD CONSTRAINT support_conversations_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: support_delivery_events support_delivery_events_conversation_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_delivery_events
    ADD CONSTRAINT support_delivery_events_conversation_message_id_fkey FOREIGN KEY (conversation_message_id) REFERENCES public.support_conversation_messages(id) ON DELETE SET NULL;


--
-- Name: support_question_messages support_question_messages_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_question_messages
    ADD CONSTRAINT support_question_messages_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.support_questions(id) ON DELETE CASCADE;


--
-- Name: support_questions support_questions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_questions
    ADD CONSTRAINT support_questions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.support_conversations(id) ON DELETE SET NULL;


--
-- Name: symptom_entries symptom_entries_patient_practice_completion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_patient_practice_completion_id_fkey FOREIGN KEY (patient_practice_completion_id) REFERENCES public.patient_practice_completions(id) ON DELETE SET NULL;


--
-- Name: symptom_entries symptom_entries_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: symptom_entries symptom_entries_tracking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_tracking_id_fkey FOREIGN KEY (tracking_id) REFERENCES public.symptom_trackings(id) ON DELETE CASCADE;


--
-- Name: symptom_trackings symptom_trackings_diagnosis_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_diagnosis_ref_id_fkey FOREIGN KEY (diagnosis_ref_id) REFERENCES public.reference_items(id);


--
-- Name: symptom_trackings symptom_trackings_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: symptom_trackings symptom_trackings_region_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_region_ref_id_fkey FOREIGN KEY (region_ref_id) REFERENCES public.reference_items(id);


--
-- Name: symptom_trackings symptom_trackings_stage_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_stage_ref_id_fkey FOREIGN KEY (stage_ref_id) REFERENCES public.reference_items(id);


--
-- Name: symptom_trackings symptom_trackings_symptom_type_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_trackings
    ADD CONSTRAINT symptom_trackings_symptom_type_ref_id_fkey FOREIGN KEY (symptom_type_ref_id) REFERENCES public.reference_items(id);


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.platform_users(id);


--
-- Name: telegram_state telegram_state_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_state
    ADD CONSTRAINT telegram_state_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.identities(id) ON DELETE CASCADE;


--
-- Name: test_attempts test_attempts_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: test_attempts test_attempts_instance_stage_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_instance_stage_item_id_fkey FOREIGN KEY (instance_stage_item_id) REFERENCES public.treatment_program_instance_stage_items(id) ON DELETE CASCADE;


--
-- Name: test_attempts test_attempts_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: test_results test_results_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.test_attempts(id) ON DELETE CASCADE;


--
-- Name: test_results test_results_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: test_results test_results_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE RESTRICT;


--
-- Name: test_set_items test_set_items_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_set_items
    ADD CONSTRAINT test_set_items_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE RESTRICT;


--
-- Name: test_set_items test_set_items_test_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_set_items
    ADD CONSTRAINT test_set_items_test_set_id_fkey FOREIGN KEY (test_set_id) REFERENCES public.test_sets(id) ON DELETE CASCADE;


--
-- Name: test_sets test_sets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sets
    ADD CONSTRAINT test_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: tests tests_body_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_body_region_id_fkey FOREIGN KEY (body_region_id) REFERENCES public.reference_items(id) ON DELETE SET NULL;


--
-- Name: tests tests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: treatment_program_events treatment_program_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_events
    ADD CONSTRAINT treatment_program_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: treatment_program_events treatment_program_events_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_events
    ADD CONSTRAINT treatment_program_events_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.treatment_program_instances(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stage_groups treatment_program_instance_stage_groups_source_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_groups
    ADD CONSTRAINT treatment_program_instance_stage_groups_source_group_id_fkey FOREIGN KEY (source_group_id) REFERENCES public.treatment_program_template_stage_groups(id) ON DELETE SET NULL;


--
-- Name: treatment_program_instance_stage_groups treatment_program_instance_stage_groups_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_groups
    ADD CONSTRAINT treatment_program_instance_stage_groups_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.treatment_program_instance_stages(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stage_items treatment_program_instance_stage_items_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_items
    ADD CONSTRAINT treatment_program_instance_stage_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.treatment_program_instance_stage_groups(id) ON DELETE SET NULL;


--
-- Name: treatment_program_instance_stage_items treatment_program_instance_stage_items_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stage_items
    ADD CONSTRAINT treatment_program_instance_stage_items_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.treatment_program_instance_stages(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stages treatment_program_instance_stages_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stages
    ADD CONSTRAINT treatment_program_instance_stages_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.treatment_program_instances(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instance_stages treatment_program_instance_stages_source_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instance_stages
    ADD CONSTRAINT treatment_program_instance_stages_source_stage_id_fkey FOREIGN KEY (source_stage_id) REFERENCES public.treatment_program_template_stages(id) ON DELETE SET NULL;


--
-- Name: treatment_program_instances treatment_program_instances_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instances
    ADD CONSTRAINT treatment_program_instances_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: treatment_program_instances treatment_program_instances_patient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instances
    ADD CONSTRAINT treatment_program_instances_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: treatment_program_instances treatment_program_instances_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_instances
    ADD CONSTRAINT treatment_program_instances_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.treatment_program_templates(id) ON DELETE SET NULL;


--
-- Name: treatment_program_template_stage_groups treatment_program_template_stage_groups_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_groups
    ADD CONSTRAINT treatment_program_template_stage_groups_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.treatment_program_template_stages(id) ON DELETE CASCADE;


--
-- Name: treatment_program_template_stage_items treatment_program_template_stage_items_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_items
    ADD CONSTRAINT treatment_program_template_stage_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.treatment_program_template_stage_groups(id) ON DELETE SET NULL;


--
-- Name: treatment_program_template_stage_items treatment_program_template_stage_items_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stage_items
    ADD CONSTRAINT treatment_program_template_stage_items_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.treatment_program_template_stages(id) ON DELETE CASCADE;


--
-- Name: treatment_program_template_stages treatment_program_template_stages_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_template_stages
    ADD CONSTRAINT treatment_program_template_stages_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.treatment_program_templates(id) ON DELETE CASCADE;


--
-- Name: treatment_program_templates treatment_program_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_program_templates
    ADD CONSTRAINT treatment_program_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: user_channel_bindings user_channel_bindings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_bindings
    ADD CONSTRAINT user_channel_bindings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_channel_preferences user_channel_preferences_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_channel_preferences
    ADD CONSTRAINT user_channel_preferences_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_email_setup_tokens user_email_setup_tokens_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_setup_tokens
    ADD CONSTRAINT user_email_setup_tokens_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;


--
-- Name: user_email_setup_tokens user_email_setup_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_setup_tokens
    ADD CONSTRAINT user_email_setup_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_notification_topic_channels user_notification_topic_channels_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topic_channels
    ADD CONSTRAINT user_notification_topic_channels_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_notification_topics user_notification_topics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_topics
    ADD CONSTRAINT user_notification_topics_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_oauth_bindings user_oauth_bindings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oauth_bindings
    ADD CONSTRAINT user_oauth_bindings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_password_credentials user_password_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_password_credentials
    ADD CONSTRAINT user_password_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_phone_history user_phone_history_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_phone_history
    ADD CONSTRAINT user_phone_history_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: user_pins user_pins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pins
    ADD CONSTRAINT user_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


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
-- Name: user_web_push_subscriptions user_web_push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_web_push_subscriptions
    ADD CONSTRAINT user_web_push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- Name: users users_merged_into_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_merged_into_user_id_fkey FOREIGN KEY (merged_into_user_id) REFERENCES public.users(id);


--
-- Name: webapp_reminder_occurrences webapp_reminder_occurrences_platform_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webapp_reminder_occurrences
    ADD CONSTRAINT webapp_reminder_occurrences_platform_user_id_fkey FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 86kBquxOoudeUlalTKZvkbcR6uv4aKBuKNdV1UwD2eSj1XLtyfQLCzcdlLABPaW

