-- TEST ledger forward reconciliation after the 2026-08-03 deploy gate found seven historical
-- hashes absent from drizzle.__drizzle_migrations even though their durable schema effects are
-- already present. Never edit or replay the historical files: prove their current end state and
-- let the migration runner reconcile each source hash to this new, actually applied hash.
-- RECONCILES-MIGRATION-HASH: 0101_doctor_patient_support
-- RECONCILES-MIGRATION-HASH: 0237_r7_drop_public_rubitime_mirror_tables
-- RECONCILES-MIGRATION-HASH: 0259_saas_billing_foundation
-- RECONCILES-MIGRATION-HASH: 0262_remove_rubitime_data
-- RECONCILES-MIGRATION-HASH: 0265_platform_support_conversations_read
-- RECONCILES-MIGRATION-HASH: 0266_password_login_bruteforce_protection
-- RECONCILES-MIGRATION-HASH: 0267_platform_organization_members_directory

-- 0237's executable body never changed, but keep its final drop explicit and idempotent.
DROP TABLE IF EXISTS public.rubitime_records CASCADE;
DROP TABLE IF EXISTS public.rubitime_events CASCADE;

-- The applied 0259 hash predates the security correction that removed the historical agent seed
-- from the provider credential document and removed ambient app_staff access. Repeat 0278's exact
-- conditional cleanup so an absent setting or an owner-edited lifecycle policy is preserved.
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

-- 0265's applied hash exposed clinic conversations to the platform role. Converge only the two
-- exact mistaken policies and ACLs; patient/clinic policies are outside this repair.
DROP POLICY IF EXISTS support_conversations_platform_operations_select
  ON public.support_conversations;
DROP POLICY IF EXISTS support_conversation_messages_platform_operations_select
  ON public.support_conversation_messages;
REVOKE ALL PRIVILEGES ON TABLE
  public.support_conversations,
  public.support_conversation_messages
FROM app_platform_settings;

DO $ledger_parity$
DECLARE
  directory_function oid := to_regprocedure('app.list_platform_organization_members(uuid)');
BEGIN
  IF to_regclass('public.doctor_patient_support') IS NULL
    OR 7 <> (
      SELECT count(*)
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'doctor_patient_support'
        AND (column_name, udt_name, is_nullable) IN (
          ('id', 'uuid', 'NO'),
          ('patient_user_id', 'uuid', 'NO'),
          ('on_support', 'bool', 'NO'),
          ('comments_enabled', 'bool', 'YES'),
          ('media_enabled', 'bool', 'YES'),
          ('updated_at', 'timestamptz', 'NO'),
          ('updated_by', 'uuid', 'YES')
        )
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.doctor_patient_support'::regclass
        AND conname = 'doctor_patient_support_patient_user_id_fkey'
        AND contype = 'f'
        AND confrelid = 'public.platform_users'::regclass
        AND confdeltype = 'c'
        AND convalidated
        AND pg_get_constraintdef(oid) =
          'FOREIGN KEY (patient_user_id) REFERENCES platform_users(id) ON DELETE CASCADE'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.doctor_patient_support'::regclass
        AND conname = 'doctor_patient_support_updated_by_fkey'
        AND contype = 'f'
        AND confrelid = 'public.platform_users'::regclass
        AND confdeltype = 'n'
        AND convalidated
        AND pg_get_constraintdef(oid) =
          'FOREIGN KEY (updated_by) REFERENCES platform_users(id) ON DELETE SET NULL'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_index
      WHERE indexrelid = to_regclass('public.uq_doctor_patient_support_patient')
        AND indrelid = 'public.doctor_patient_support'::regclass
        AND indisunique AND indisvalid AND indisready
        AND pg_get_indexdef(indexrelid) =
          'CREATE UNIQUE INDEX uq_doctor_patient_support_patient ON public.doctor_patient_support USING btree (patient_user_id)'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_index
      WHERE indexrelid = to_regclass('public.idx_doctor_patient_support_on_support')
        AND indrelid = 'public.doctor_patient_support'::regclass
        AND NOT indisunique AND indisvalid AND indisready
        AND pg_get_indexdef(indexrelid) =
          'CREATE INDEX idx_doctor_patient_support_on_support ON public.doctor_patient_support USING btree (on_support)'
    )
  THEN
    RAISE EXCEPTION '0330 parity failed: 0101 doctor-patient support schema is incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF to_regclass('public.rubitime_records') IS NOT NULL
    OR to_regclass('public.rubitime_events') IS NOT NULL
  THEN
    RAISE EXCEPTION '0330 parity failed: 0237 public Rubitime mirrors still exist'
      USING ERRCODE = '23514';
  END IF;

  IF to_regclass('public.saas_billing_accounts') IS NULL
    OR to_regclass('public.saas_billing_subscriptions') IS NULL
    OR to_regclass('public.saas_billing_invoices') IS NULL
    OR to_regclass('public.saas_billing_provider_events') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.saas_billing_accounts'::regclass
        AND conname = 'saas_billing_accounts_organization_uidx'
        AND contype = 'u'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.saas_billing_subscriptions'::regclass
        AND conname = 'saas_billing_subscriptions_org_source_uidx'
        AND contype = 'u'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.saas_billing_invoices'::regclass
        AND conname = 'saas_billing_invoices_provider_idempotency_uidx'
        AND contype = 'u'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.saas_billing_provider_events'::regclass
        AND conname = 'saas_billing_provider_events_provider_event_uidx'
        AND contype = 'u'
    )
    -- 0308 deliberately superseded the original period-only uniqueness so seat-overage invoices
    -- can coexist; require the other 28 foundation constraints without resurrecting that one.
    OR 28 <> (
      SELECT count(*)
      FROM pg_constraint
      WHERE conname IN (
        'saas_billing_accounts_id_organization_uidx',
        'saas_billing_accounts_organization_id_fkey',
        'saas_billing_accounts_organization_uidx',
        'saas_billing_invoices_account_org_fkey',
        'saas_billing_invoices_amount_check',
        'saas_billing_invoices_currency_check',
        'saas_billing_invoices_id_organization_uidx',
        'saas_billing_invoices_organization_id_fkey',
        'saas_billing_invoices_period_check',
        'saas_billing_invoices_provider_idempotency_uidx',
        'saas_billing_invoices_saas_billing_subscription_org_fkey',
        'saas_billing_invoices_status_check',
        'saas_billing_invoices_tariff_billing_period_check',
        'saas_billing_invoices_tariff_id_fkey',
        'saas_billing_provider_events_invoice_org_fkey',
        'saas_billing_provider_events_organization_id_fkey',
        'saas_billing_provider_events_payload_check',
        'saas_billing_provider_events_provider_event_uidx',
        'saas_billing_subscriptions_account_org_fkey',
        'saas_billing_subscriptions_id_organization_uidx',
        'saas_billing_subscriptions_lifecycle_check',
        'saas_billing_subscriptions_lifecycle_dates_check',
        'saas_billing_subscriptions_org_source_uidx',
        'saas_billing_subscriptions_organization_id_fkey',
        'saas_billing_subscriptions_period_check',
        'saas_billing_subscriptions_source_check',
        'saas_billing_subscriptions_status_check',
        'saas_billing_subscriptions_tariff_id_fkey'
      )
        AND conrelid IN (
          'public.saas_billing_accounts'::regclass,
          'public.saas_billing_subscriptions'::regclass,
          'public.saas_billing_invoices'::regclass,
          'public.saas_billing_provider_events'::regclass
        )
    )
    OR '4389e12ce3433a9c9618b3e2b339e278' <> (
      SELECT md5(string_agg(
        constraint_row.conname || '|' || constraint_row.contype::text || '|' ||
        constraint_row.convalidated::text || '|' || pg_get_constraintdef(constraint_row.oid),
        E'\n' ORDER BY constraint_row.conname
      ))
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conname IN (
        'saas_billing_accounts_id_organization_uidx',
        'saas_billing_accounts_organization_id_fkey',
        'saas_billing_accounts_organization_uidx',
        'saas_billing_invoices_account_org_fkey',
        'saas_billing_invoices_amount_check',
        'saas_billing_invoices_currency_check',
        'saas_billing_invoices_id_organization_uidx',
        'saas_billing_invoices_organization_id_fkey',
        'saas_billing_invoices_period_check',
        'saas_billing_invoices_provider_idempotency_uidx',
        'saas_billing_invoices_saas_billing_subscription_org_fkey',
        'saas_billing_invoices_status_check',
        'saas_billing_invoices_tariff_billing_period_check',
        'saas_billing_invoices_tariff_id_fkey',
        'saas_billing_provider_events_invoice_org_fkey',
        'saas_billing_provider_events_organization_id_fkey',
        'saas_billing_provider_events_payload_check',
        'saas_billing_provider_events_provider_event_uidx',
        'saas_billing_subscriptions_account_org_fkey',
        'saas_billing_subscriptions_id_organization_uidx',
        'saas_billing_subscriptions_lifecycle_check',
        'saas_billing_subscriptions_lifecycle_dates_check',
        'saas_billing_subscriptions_org_source_uidx',
        'saas_billing_subscriptions_organization_id_fkey',
        'saas_billing_subscriptions_period_check',
        'saas_billing_subscriptions_source_check',
        'saas_billing_subscriptions_status_check',
        'saas_billing_subscriptions_tariff_id_fkey'
      )
        AND constraint_row.conrelid IN (
          'public.saas_billing_accounts'::regclass,
          'public.saas_billing_subscriptions'::regclass,
          'public.saas_billing_invoices'::regclass,
          'public.saas_billing_provider_events'::regclass
        )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_class AS relation
      WHERE relation.oid IN (
        'public.saas_billing_accounts'::regclass,
        'public.saas_billing_subscriptions'::regclass,
        'public.saas_billing_invoices'::regclass,
        'public.saas_billing_provider_events'::regclass
      )
        AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
    )
    OR has_table_privilege('app_staff', 'public.saas_billing_accounts', 'SELECT')
    OR has_table_privilege('app_staff', 'public.saas_billing_subscriptions', 'SELECT')
    OR has_table_privilege('app_staff', 'public.saas_billing_invoices', 'SELECT')
    OR has_table_privilege('app_staff', 'public.saas_billing_provider_events', 'SELECT')
    OR EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname IN (
          'saas_billing_accounts_staff_select',
          'saas_billing_subscriptions_staff_select',
          'saas_billing_invoices_staff_select',
          'saas_billing_provider_events_staff_select'
        )
    )
    OR 12 <> (
      SELECT count(*)
      FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname IN (
          'saas_billing_accounts_platform_select',
          'saas_billing_accounts_platform_insert',
          'saas_billing_accounts_platform_update',
          'saas_billing_subscriptions_platform_select',
          'saas_billing_subscriptions_platform_insert',
          'saas_billing_subscriptions_platform_update',
          'saas_billing_invoices_platform_select',
          'saas_billing_invoices_platform_insert',
          'saas_billing_invoices_platform_update',
          'saas_billing_provider_events_platform_select',
          'saas_billing_provider_events_platform_insert',
          'saas_billing_provider_events_platform_update'
        )
        AND 'app_platform_settings' = ANY (roles)
    )
    OR '2d22f840f5df5241e378fc19510474fd' <> (
      SELECT md5(string_agg(
        policy_row.policyname || '|' || policy_row.cmd || '|' || policy_row.permissive || '|' ||
        policy_row.roles::text || '|' || COALESCE(policy_row.qual, '') || '|' ||
        COALESCE(policy_row.with_check, ''),
        E'\n' ORDER BY policy_row.policyname
      ))
      FROM pg_policies AS policy_row
      WHERE policy_row.schemaname = 'public'
        AND policy_row.policyname IN (
          'saas_billing_accounts_platform_select',
          'saas_billing_accounts_platform_insert',
          'saas_billing_accounts_platform_update',
          'saas_billing_subscriptions_platform_select',
          'saas_billing_subscriptions_platform_insert',
          'saas_billing_subscriptions_platform_update',
          'saas_billing_invoices_platform_select',
          'saas_billing_invoices_platform_insert',
          'saas_billing_invoices_platform_update',
          'saas_billing_provider_events_platform_select',
          'saas_billing_provider_events_platform_insert',
          'saas_billing_provider_events_platform_update'
        )
    )
    OR NOT (
      has_table_privilege('app_platform_settings', 'public.saas_billing_accounts', 'SELECT,INSERT,UPDATE')
      AND has_table_privilege('app_platform_settings', 'public.saas_billing_subscriptions', 'SELECT,INSERT,UPDATE')
      AND has_table_privilege('app_platform_settings', 'public.saas_billing_invoices', 'SELECT,INSERT,UPDATE')
      AND has_table_privilege('app_platform_settings', 'public.saas_billing_provider_events', 'SELECT,INSERT,UPDATE')
    )
    OR has_table_privilege('app_patient', 'public.saas_billing_accounts', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('app_patient', 'public.saas_billing_subscriptions', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('app_patient', 'public.saas_billing_invoices', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('app_patient', 'public.saas_billing_provider_events', 'SELECT,INSERT,UPDATE,DELETE')
  THEN
    RAISE EXCEPTION '0330 parity failed: 0259 SaaS billing foundation is incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'patient_bookings' AND column_name IN (
          'rubitime_id', 'rubitime_manage_url', 'rubitime_branch_id_snapshot',
          'rubitime_cooperator_id_snapshot', 'rubitime_service_id_snapshot'
        ))
        OR (table_name = 'booking_branch_services' AND column_name = 'rubitime_service_id')
        OR (table_name = 'booking_branches' AND column_name = 'rubitime_branch_id')
        OR (table_name = 'booking_specialists' AND column_name = 'rubitime_cooperator_id')
      )
  )
    OR to_regclass('integrator.rubitime_booking_profiles') IS NOT NULL
    OR to_regclass('integrator.rubitime_events') IS NOT NULL
    OR to_regclass('integrator.rubitime_records') IS NOT NULL
    OR to_regclass('integrator.rubitime_api_throttle') IS NOT NULL
    OR to_regclass('integrator.rubitime_branches') IS NOT NULL
    OR to_regclass('integrator.rubitime_services') IS NOT NULL
    OR to_regclass('integrator.rubitime_cooperators') IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.patient_bookings WHERE source = 'rubitime_projection')
    OR EXISTS (SELECT 1 FROM public.be_appointments WHERE source = 'rubitime_projection')
    OR to_regclass('public.booking_calendar_map') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.patient_bookings'::regclass
        AND conname = 'patient_bookings_source_check'
        AND contype = 'c' AND convalidated
        AND pg_get_constraintdef(oid) =
          'CHECK ((source = ANY (ARRAY[''native''::text, ''imported''::text])))'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.be_appointments'::regclass
        AND conname = 'be_appointments_source_check'
        AND contype = 'c' AND convalidated
        AND pg_get_constraintdef(oid) =
          'CHECK ((source = ANY (ARRAY[''native''::text, ''imported''::text, ''admin_manual''::text, ''public_widget''::text])))'
    )
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'booking_calendar_map'
        AND column_name = 'appointment_key'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.booking_calendar_map'::regclass
        AND conname = 'booking_calendar_map_appointment_key_key'
        AND contype = 'u'
        AND convalidated
        AND pg_get_constraintdef(oid) = 'UNIQUE (appointment_key)'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = to_regprocedure('app.read_current_patient_booking_rows(text,timestamptz)')
        AND prosecdef
        AND pg_get_userbyid(proowner) = 'app_owner'
        AND provolatile = 's'
        AND proconfig = ARRAY['search_path=pg_catalog']
        AND pg_get_functiondef(oid) !~* 'rubitime'
    )
  THEN
    RAISE EXCEPTION '0330 parity failed: 0262 Rubitime-owned data surface remains'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'support_conversations_platform_operations_select',
        'support_conversation_messages_platform_operations_select'
      )
  )
    OR has_table_privilege('app_platform_settings', 'public.support_conversations', 'SELECT')
    OR has_table_privilege('app_platform_settings', 'public.support_conversation_messages', 'SELECT')
  THEN
    RAISE EXCEPTION '0330 parity failed: 0265 platform role can read clinic conversations'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_password_credentials'
      AND column_name = 'failed_attempts'
      AND udt_name = 'int4'
      AND is_nullable = 'NO'
      AND column_default = '0'
  )
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_password_credentials'
        AND column_name = 'locked_until'
        AND udt_name = 'timestamptz'
        AND is_nullable = 'YES'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.user_password_credentials'::regclass
        AND conname = 'user_password_credentials_failed_attempts_check'
        AND contype = 'c'
        AND convalidated
        AND pg_get_constraintdef(oid) = 'CHECK ((failed_attempts >= 0))'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = to_regprocedure('app.auth_rate_limit_record(text,text)')
        AND prosecdef AND pg_get_userbyid(proowner) = 'app_owner'
        AND provolatile = 'v' AND proconfig = ARRAY['search_path=pg_catalog']
        AND prolang = (SELECT oid FROM pg_language WHERE lanname = 'sql')
        AND pg_get_functiondef(oid) !~* 'UPDATE[[:space:]]+public[.]user_password_credentials'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = to_regprocedure('app.set_staff_security_self_password_hash(text)')
        AND prosecdef AND pg_get_userbyid(proowner) = 'app_owner'
        AND provolatile = 'v' AND proconfig = ARRAY['search_path=pg_catalog']
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = to_regprocedure('app.password_login_acquire(text,text,uuid,text)')
        AND prosecdef AND pg_get_userbyid(proowner) = 'app_owner'
        AND provolatile = 'v' AND proconfig = ARRAY['search_path=pg_catalog']
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = to_regprocedure('app.password_login_complete(uuid,boolean)')
        AND prosecdef AND pg_get_userbyid(proowner) = 'app_owner'
        AND provolatile = 'v' AND proconfig = ARRAY['search_path=pg_catalog']
    )
  THEN
    RAISE EXCEPTION '0330 parity failed: 0266 password brute-force protection is incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF directory_function IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc AS procedure
      WHERE procedure.oid = directory_function
        AND procedure.prosecdef
        AND pg_get_userbyid(procedure.proowner) = 'app_owner'
        AND procedure.provolatile = 's'
        AND procedure.proconfig = ARRAY['search_path=pg_catalog']
        AND pg_get_functiondef(procedure.oid) ~ 'display_name'
        AND pg_get_functiondef(procedure.oid) !~* '(phone|email|contact)'
    )
    OR NOT has_function_privilege(
      'app_platform_settings',
      'app.list_platform_organization_members(uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'app_staff',
      'app.list_platform_organization_members(uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'app_patient',
      'app.list_platform_organization_members(uuid)',
      'EXECUTE'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_proc AS procedure
      CROSS JOIN LATERAL aclexplode(
        COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
      ) AS privilege
      WHERE procedure.oid = directory_function
        AND (
          pg_get_userbyid(privilege.grantee) NOT IN ('app_owner', 'app_platform_settings')
          OR privilege.privilege_type <> 'EXECUTE'
          OR privilege.is_grantable
        )
    )
  THEN
    RAISE EXCEPTION '0330 parity failed: 0267 platform organization directory capability is incomplete'
      USING ERRCODE = '23514';
  END IF;
END
$ledger_parity$;
