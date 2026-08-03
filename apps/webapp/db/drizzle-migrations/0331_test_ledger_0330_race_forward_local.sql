-- RECONCILES-MIGRATION-HASH: 0330_test_ledger_schema_parity_forward_local
-- TEST applied the 0330 body from merge 051b42e98 while bounded corrections to that same file
-- were still landing in parallel. Reconcile only the final state delta; never rewrite the applied
-- ledger row or replay superseded function bodies.

-- Match the final 0330/0278 owner-data rule: remove only the historical generated lifecycle seed.
-- A clinic-owned replacement is data and must be preserved.
UPDATE public.system_settings
SET value_json = value_json #- '{value,lifecyclePolicy}',
    updated_at = now()
WHERE key = 'saas_billing_payment_provider'
  AND scope = 'admin'
  AND organization_id IS NULL
  AND value_json #> '{value,lifecyclePolicy}' =
    '{"graceDays": 7, "chargeAttempts": 3, "readOnlyDays": 21}'::jsonb;

DROP POLICY IF EXISTS saas_billing_accounts_staff_select ON public.saas_billing_accounts;
DROP POLICY IF EXISTS saas_billing_subscriptions_staff_select ON public.saas_billing_subscriptions;
DROP POLICY IF EXISTS saas_billing_invoices_staff_select ON public.saas_billing_invoices;
DROP POLICY IF EXISTS saas_billing_provider_events_staff_select ON public.saas_billing_provider_events;
REVOKE ALL PRIVILEGES ON TABLE
  public.saas_billing_accounts,
  public.saas_billing_subscriptions,
  public.saas_billing_invoices,
  public.saas_billing_provider_events
FROM app_staff;

DROP POLICY IF EXISTS support_conversations_platform_operations_select
  ON public.support_conversations;
DROP POLICY IF EXISTS support_conversation_messages_platform_operations_select
  ON public.support_conversation_messages;
REVOKE ALL PRIVILEGES ON TABLE
  public.support_conversations,
  public.support_conversation_messages
FROM app_platform_settings;

DO $race_repair_parity$
BEGIN
  IF to_regclass('public.doctor_patient_support') IS NULL
    OR to_regclass('public.rubitime_records') IS NOT NULL
    OR to_regclass('public.rubitime_events') IS NOT NULL
    OR to_regclass('public.saas_billing_accounts') IS NULL
    OR to_regclass('public.saas_billing_subscriptions') IS NULL
    OR to_regclass('public.saas_billing_invoices') IS NULL
    OR to_regclass('public.saas_billing_provider_events') IS NULL
    OR has_table_privilege('app_staff', 'public.saas_billing_accounts', 'SELECT')
    OR has_table_privilege('app_staff', 'public.saas_billing_subscriptions', 'SELECT')
    OR has_table_privilege('app_staff', 'public.saas_billing_invoices', 'SELECT')
    OR has_table_privilege('app_staff', 'public.saas_billing_provider_events', 'SELECT')
    OR has_table_privilege('app_platform_settings', 'public.support_conversations', 'SELECT')
    OR has_table_privilege('app_platform_settings', 'public.support_conversation_messages', 'SELECT')
    OR to_regclass('public.booking_calendar_map') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'booking_calendar_map'
        AND column_name = 'appointment_key'
    )
    OR to_regprocedure('app.auth_rate_limit_record(text,text)') IS NULL
    OR to_regprocedure('app.password_login_acquire(text,text,uuid,text)') IS NULL
    OR to_regprocedure('app.password_login_complete(uuid,boolean)') IS NULL
    OR to_regprocedure('app.list_platform_organization_members(uuid)') IS NULL
  THEN
    RAISE EXCEPTION '0331 parity failed: final 0330 state is incomplete'
      USING ERRCODE = '23514';
  END IF;
END
$race_repair_parity$;
