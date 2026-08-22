/**
 * Rollback-only DEV proof for D17's six tenant-facing SECURITY DEFINER roots.
 *
 * The proof uses existing DEV rows. It first calls the currently installed, vulnerable bodies with
 * a context for another organization, materializes the candidate migration in the same transaction,
 * and then repeats honest and foreign-organization calls. No fixture entity or persistent write is
 * left behind: the transaction always ends with ROLLBACK.
 *
 * Run:
 *   RUN_DEFINER_TENANT_SIX_ROOTS_DB=1 node --test \
 *     deploy/postgres/privileges/definer-tenant-six-roots.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ENABLED = process.env.RUN_DEFINER_TENANT_SIX_ROOTS_DB === '1';
const DATABASE = process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';
const MIGRATION = new URL(
  '../../../apps/webapp/db/drizzle-migrations/20260822T200000_tenant_definer_roots_validate_their_organization.sql',
  import.meta.url,
);

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  ).trim();
}

const ACCEPT_HELPER = String.raw`
CREATE OR REPLACE FUNCTION pg_temp.accept_context(
  p_target_role name,
  p_context_class app.port_context_class,
  p_purpose text,
  p_function_identity regprocedure,
  p_organization_id uuid,
  p_typed_args app.port_typed_arg[] DEFAULT ARRAY[]::app.port_typed_arg[]
) RETURNS void LANGUAGE plpgsql AS $accept$
DECLARE v_capability_id constant uuid := '00000000-0000-4000-8000-0000000000d6'::uuid;
BEGIN
  DELETE FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid()
     AND transaction_id = pg_current_xact_id();
  DELETE FROM app_ext.port_context_capabilities WHERE capability_id = v_capability_id;

  INSERT INTO app_ext.port_context_capabilities
    (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
  SELECT v_capability_id, declared.port, session_user, declared.target_role,
         declared.context_class, declared.purpose, declared.function_identity
    FROM app_ext.port_context_capabilities AS declared
   WHERE declared.target_role = p_target_role
     AND declared.context_class = p_context_class
     AND declared.purpose = p_purpose
     AND declared.function_identity IS NOT DISTINCT FROM p_function_identity
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no declared capability for % / % / % / %',
      p_target_role, p_context_class, p_purpose, p_function_identity;
  END IF;

  INSERT INTO app_ext.accepted_port_contexts (
    database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
    context_class, purpose, function_identity, typed_args_hash, organization_id
  )
  SELECT database.oid, pg_backend_pid(), pg_current_xact_id(), capability.capability_id,
         capability.session_login, capability.port, capability.target_role,
         capability.context_class, capability.purpose, capability.function_identity,
         app.hash_port_typed_args(p_typed_args), p_organization_id
    FROM pg_database AS database, app_ext.port_context_capabilities AS capability
   WHERE database.datname = current_database()
     AND capability.capability_id = v_capability_id;
END $accept$;
`;

const FIXTURES = String.raw`
CREATE TEMP TABLE probe_fixture AS
SELECT
  paid.id AS paid_invoice_id,
  paid.organization_id AS paid_org_id,
  paid.tariff_id AS paid_tariff_id,
  (SELECT organization.id FROM public.be_organizations AS organization
    WHERE organization.id <> paid.organization_id LIMIT 1) AS paid_context_org_id,
  draft.id AS draft_invoice_id,
  draft.organization_id AS draft_org_id,
  draft.tariff_id AS draft_tariff_id,
  (SELECT organization.id FROM public.be_organizations AS organization
    WHERE organization.id <> draft.organization_id LIMIT 1) AS draft_context_org_id,
  release_invoice.id AS release_invoice_id,
  release_invoice.organization_id AS release_org_id,
  (SELECT organization.id FROM public.be_organizations AS organization
    WHERE organization.id <> release_invoice.organization_id LIMIT 1) AS release_context_org_id,
  enrollment.platform_user_id,
  enrollment.organization_id AS reminder_org_id,
  reminder_user.integrator_user_id,
  (SELECT organization.id FROM public.be_organizations AS organization
    WHERE organization.id <> enrollment.organization_id LIMIT 1) AS reminder_context_org_id
FROM LATERAL (
  SELECT invoice.id, invoice.organization_id, invoice.tariff_id
    FROM public.saas_billing_invoices AS invoice
   WHERE invoice.status = 'paid'
   LIMIT 1
) AS paid
CROSS JOIN LATERAL (
  SELECT invoice.id, invoice.organization_id, invoice.tariff_id
    FROM public.saas_billing_invoices AS invoice
    JOIN public.saas_billing_subscriptions AS subscription
      ON subscription.id = invoice.saas_billing_subscription_id
     AND subscription.organization_id = invoice.organization_id
   WHERE invoice.invoice_kind = 'tariff_period'
     AND invoice.description IS NULL
     AND invoice.expires_at IS NULL
     AND invoice.status = 'draft'
     AND invoice.provider_invoice_ref IS NULL
     AND invoice.tariff_id IN (subscription.tariff_id, subscription.pending_tariff_id)
   LIMIT 1
) AS draft
CROSS JOIN LATERAL (
  SELECT invoice.id, invoice.organization_id
    FROM public.saas_billing_invoices AS invoice
   LIMIT 1
) AS release_invoice
CROSS JOIN LATERAL (
  SELECT candidate.platform_user_id, candidate.organization_id
    FROM public.org_enrollments AS candidate
    JOIN public.platform_users AS candidate_user ON candidate_user.id = candidate.platform_user_id
   WHERE candidate.status = 'active'
     AND candidate_user.integrator_user_id IS NOT NULL
   LIMIT 1
) AS enrollment
JOIN public.platform_users AS reminder_user ON reminder_user.id = enrollment.platform_user_id;

DO $fixture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM probe_fixture)
     OR EXISTS (
       SELECT 1 FROM probe_fixture
        WHERE paid_context_org_id IS NULL OR draft_context_org_id IS NULL
           OR release_context_org_id IS NULL OR reminder_context_org_id IS NULL
     ) THEN
    RAISE EXCEPTION 'DEV lacks the existing rows required by the six-root proof';
  END IF;
END $fixture$;

CREATE TEMP TABLE probe_out(ord serial PRIMARY KEY, key text NOT NULL, value text NOT NULL);
`;

const BEFORE_PROBE = String.raw`
DO $before$
DECLARE fixture probe_fixture%ROWTYPE; result text; occurred_at timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO fixture FROM probe_fixture;
  INSERT INTO probe_out(key, value) VALUES (
    'dead_root_before',
    (to_regprocedure('app.assert_org_patient_count_quota_available(uuid)') IS NOT NULL)::text
  );
  INSERT INTO probe_out(key, value) VALUES (
    'tenant_effective_execute_before',
    has_function_privilege(
      'app_tenant_service', 'app.saas_billing_effective_tariff(uuid,uuid)', 'EXECUTE'
    )::text
  );

  PERFORM pg_temp.accept_context(
    'app_staff', 'staff', 'relation', NULL, fixture.paid_context_org_id);
  SELECT app.apply_paid_saas_billing_tariff(fixture.paid_invoice_id, fixture.paid_org_id)::text
    INTO result;
  INSERT INTO probe_out(key, value) VALUES ('apply_foreign_before', result);

  PERFORM pg_temp.accept_context(
    'app_clinic_billing', 'staff', 'relation', NULL, fixture.draft_context_org_id);
  SELECT app.refresh_saas_billing_invoice_purchased_tariff(
    fixture.draft_invoice_id, fixture.draft_org_id, fixture.draft_tariff_id)::text INTO result;
  INSERT INTO probe_out(key, value) VALUES ('refresh_foreign_before', result);

  PERFORM pg_temp.accept_context(
    'app_clinic_billing', 'staff', 'relation', NULL, fixture.release_context_org_id);
  SELECT app.release_carried_seat_debt(fixture.release_invoice_id, fixture.release_org_id)
    INTO result;
  INSERT INTO probe_out(key, value) VALUES ('release_foreign_before', result);

  PERFORM pg_temp.accept_context(
    'app_tenant_service', 'tenant_service',
    'integrator.reminder-occurrence-finalized.record',
    'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)',
    fixture.reminder_context_org_id,
    ARRAY[
      ROW('text@1', pg_catalog.textsend('d17-six-roots-before'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('d17-rule'))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send(fixture.integrator_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(fixture.platform_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(fixture.reminder_org_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('appointment'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('sent'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('telegram'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(NULL))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(occurred_at))::app.port_typed_arg
    ]
  );
  SELECT app.record_reminder_occurrence_finalized_projection(
    'd17-six-roots-before', 'd17-rule', fixture.integrator_user_id,
    fixture.platform_user_id, fixture.reminder_org_id, 'appointment', 'sent', 'telegram', NULL,
    occurred_at
  )::text INTO result;
  INSERT INTO probe_out(key, value) VALUES ('reminder_foreign_before', result);
END $before$;
`;

const AFTER_PROBE = String.raw`
DO $after$
DECLARE fixture probe_fixture%ROWTYPE; result text; occurred_at timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO fixture FROM probe_fixture;

  PERFORM pg_temp.accept_context('app_staff', 'staff', 'relation', NULL, fixture.paid_org_id);
  SELECT app.apply_paid_saas_billing_tariff(fixture.paid_invoice_id, fixture.paid_org_id)::text
    INTO result;
  INSERT INTO probe_out(key, value) VALUES ('apply_honest_after', result);
  PERFORM pg_temp.accept_context(
    'app_staff', 'staff', 'relation', NULL, fixture.paid_context_org_id);
  BEGIN
    PERFORM app.apply_paid_saas_billing_tariff(fixture.paid_invoice_id, fixture.paid_org_id);
    result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN result := SQLSTATE || '|' || SQLERRM; END;
  INSERT INTO probe_out(key, value) VALUES ('apply_foreign_after', result);

  PERFORM pg_temp.accept_context(
    'app_clinic_billing', 'staff', 'relation', NULL, fixture.draft_org_id);
  SELECT app.refresh_saas_billing_invoice_purchased_tariff(
    fixture.draft_invoice_id, fixture.draft_org_id, fixture.draft_tariff_id)::text INTO result;
  INSERT INTO probe_out(key, value) VALUES ('refresh_honest_after', result);
  PERFORM pg_temp.accept_context(
    'app_clinic_billing', 'staff', 'relation', NULL, fixture.draft_context_org_id);
  BEGIN
    PERFORM app.refresh_saas_billing_invoice_purchased_tariff(
      fixture.draft_invoice_id, fixture.draft_org_id, fixture.draft_tariff_id);
    result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN result := SQLSTATE || '|' || SQLERRM; END;
  INSERT INTO probe_out(key, value) VALUES ('refresh_foreign_after', result);

  PERFORM pg_temp.accept_context(
    'app_clinic_billing', 'staff', 'relation', NULL, fixture.release_org_id);
  SELECT app.release_carried_seat_debt(fixture.release_invoice_id, fixture.release_org_id)
    INTO result;
  INSERT INTO probe_out(key, value) VALUES ('release_honest_after', result);
  PERFORM pg_temp.accept_context(
    'app_clinic_billing', 'staff', 'relation', NULL, fixture.release_context_org_id);
  BEGIN
    PERFORM app.release_carried_seat_debt(fixture.release_invoice_id, fixture.release_org_id);
    result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN result := SQLSTATE || '|' || SQLERRM; END;
  INSERT INTO probe_out(key, value) VALUES ('release_foreign_after', result);

  PERFORM pg_temp.accept_context(
    'app_tenant_service', 'tenant_service',
    'integrator.reminder-occurrence-finalized.record',
    'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)',
    fixture.reminder_org_id,
    ARRAY[
      ROW('text@1', pg_catalog.textsend('d17-six-roots-honest'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('d17-rule'))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send(fixture.integrator_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(fixture.platform_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(fixture.reminder_org_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('appointment'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('sent'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('telegram'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(NULL))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(occurred_at))::app.port_typed_arg
    ]
  );
  SELECT app.record_reminder_occurrence_finalized_projection(
    'd17-six-roots-honest', 'd17-rule', fixture.integrator_user_id,
    fixture.platform_user_id, fixture.reminder_org_id, 'appointment', 'sent', 'telegram', NULL,
    occurred_at
  )::text INTO result;
  INSERT INTO probe_out(key, value) VALUES ('reminder_honest_after', result);

  occurred_at := clock_timestamp();
  PERFORM pg_temp.accept_context(
    'app_tenant_service', 'tenant_service',
    'integrator.reminder-occurrence-finalized.record',
    'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)',
    fixture.reminder_context_org_id,
    ARRAY[
      ROW('text@1', pg_catalog.textsend('d17-six-roots-foreign'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('d17-rule'))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send(fixture.integrator_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(fixture.platform_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(fixture.reminder_org_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('appointment'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('sent'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend('telegram'))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(NULL))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(occurred_at))::app.port_typed_arg
    ]
  );
  BEGIN
    PERFORM app.record_reminder_occurrence_finalized_projection(
      'd17-six-roots-foreign', 'd17-rule', fixture.integrator_user_id,
      fixture.platform_user_id, fixture.reminder_org_id, 'appointment', 'sent', 'telegram', NULL,
      occurred_at
    );
    result := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN result := SQLSTATE || '|' || SQLERRM; END;
  INSERT INTO probe_out(key, value) VALUES ('reminder_foreign_after', result);

  PERFORM pg_temp.accept_context('app_staff', 'staff', 'relation', NULL, fixture.paid_org_id);
  SELECT count(*)::text INTO result
    FROM app.saas_billing_effective_tariff_for_current_org(
      fixture.paid_org_id, fixture.paid_tariff_id);
  INSERT INTO probe_out(key, value) VALUES ('effective_wrapper_honest_after', result);
END $after$;

INSERT INTO probe_out(key, value) VALUES (
  'dead_root_after',
  (to_regprocedure('app.assert_org_patient_count_quota_available(uuid)') IS NOT NULL)::text
);
REVOKE EXECUTE ON FUNCTION app.saas_billing_effective_tariff(uuid, uuid) FROM app_tenant_service;
INSERT INTO probe_out(key, value) VALUES (
  'tenant_effective_execute_after',
  has_function_privilege(
    'app_tenant_service', 'app.saas_billing_effective_tariff(uuid,uuid)', 'EXECUTE'
  )::text
);
`;

function parseOutput(output) {
  return Object.fromEntries(
    output.split('\n').filter((line) => line.includes('=')).map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }),
  );
}

test('candidate keeps honest calls and refuses foreign organization arguments',
  { skip: !ENABLED }, () => {
    const migrationSql = readFileSync(MIGRATION, 'utf8');
    const output = parseOutput(psql(`BEGIN;
${ACCEPT_HELPER}
${FIXTURES}
${BEFORE_PROBE}
${migrationSql}
${AFTER_PROBE}
SELECT key || '=' || value FROM probe_out ORDER BY ord;
ROLLBACK;`));

    console.log(`DEV rollback proof: ${JSON.stringify(output)}`);

    assert.equal(output.dead_root_before, 'true');
    assert.equal(output.dead_root_after, 'false');
    assert.equal(output.tenant_effective_execute_before, 'true');
    assert.equal(output.tenant_effective_execute_after, 'false');

    assert.equal(output.apply_foreign_before, 'true');
    assert.equal(output.refresh_foreign_before, 'true');
    assert.equal(output.reminder_foreign_before, 'true');
    assert.notEqual(output.release_foreign_before, '');

    for (const key of [
      'apply_foreign_after',
      'refresh_foreign_after',
      'release_foreign_after',
      'reminder_foreign_after',
    ]) {
      assert.match(output[key], /^42501\|/u, `${key}: ${output[key]}`);
    }

    assert.equal(output.apply_honest_after, 'true');
    assert.equal(output.refresh_honest_after, 'true');
    assert.notEqual(output.release_honest_after, '');
    assert.equal(output.reminder_honest_after, 'true');
    assert.equal(output.effective_wrapper_honest_after, '1');
  });
