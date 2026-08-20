/**
 * #1069 T10/T13 — opt-in behavioral oracle against both real SQL access doors on the named DEV
 * database. It catches the two audit failures that a TS mirror cannot observe:
 *
 * 1. global `tariff` must remain active in cabinet and mechanic doors even when the selected
 *    tariff carries a local unpaid ladder;
 * 2. tightening the global policy after the paid-period anchor must not shorten an already-earned
 *    rung.
 *
 * Every scenario creates its fixture inside one transaction and ends in ROLLBACK. The proof uses
 * the repository's canonical local admin socket pattern because the fixture crosses FORCE-RLS
 * billing tables:
 *
 *   RUN_GLOBAL_PAID_PERIOD_ACCESS_DB=1 node --test \
 *     deploy/postgres/privileges/global-paid-period-access.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_GLOBAL_PAID_PERIOD_ACCESS_DB === '1';
const DATABASE = process.env.GLOBAL_PAID_PERIOD_ACCESS_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (DATABASE !== 'bcb_webapp_dev' && DATABASE !== 'bersoncarebot_test') {
  throw new Error(`refusing non-named DEV/TEST database '${DATABASE}'`);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    [
      '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

function fixtureSql({ behavior, targetTariffId = null, audit = null }) {
  const sourceTariff = '7e510000-0000-4000-8000-0000002c1301';
  const targetTariff = '7e510000-0000-4000-8000-0000002c1302';
  const organization = '7e510000-0000-4000-8000-0000002c1303';
  const account = '7e510000-0000-4000-8000-0000002c1304';
  const subscription = '7e510000-0000-4000-8000-0000002c1305';
  const auditSql = audit
    ? `INSERT INTO public.admin_audit_log
         (id, action, target_id, details, status, created_at)
       VALUES (
         '7e510000-0000-4000-8000-0000002c1306'::uuid,
         'saas_paid_period_policy_update', 'global',
         '${JSON.stringify(audit)}'::jsonb, 'ok', now() - interval '1 minute'
       );`
    : '';
  const targetSql = targetTariffId ? `'${targetTariffId}'::uuid` : 'NULL';

  return `
BEGIN;
INSERT INTO public.saas_tariffs
  (id, name, mechanics, quotas, billing_period, included_seats, system_access_policy)
VALUES
  ('${sourceTariff}'::uuid, '#1069 source', '{"courses":true}'::jsonb, '{}'::jsonb,
   'month', 5, '{"graceDays":7,"readOnlyDays":7,"terminalState":"disabled","notifications":[]}'::jsonb),
  ('${targetTariff}'::uuid, '#1069 target', '{"courses":true}'::jsonb, '{}'::jsonb,
   'month', 5, '{"graceDays":0,"readOnlyDays":0,"terminalState":"disabled","notifications":[]}'::jsonb);
ALTER TABLE public.be_organizations DISABLE TRIGGER USER;
INSERT INTO public.be_organizations (id, title, tariff_id, is_active)
VALUES ('${organization}'::uuid, '#1069 proof', '${sourceTariff}'::uuid, true);
ALTER TABLE public.be_organizations ENABLE TRIGGER USER;
INSERT INTO app_ext.port_context_capabilities (
  capability_id, port, session_login, target_role, context_class, purpose, function_identity
)
SELECT
  '7e510000-0000-4000-8000-0000002c1307'::uuid,
  configured.port, 'postgres'::name, configured.target_role, configured.context_class,
  configured.purpose, configured.function_identity
FROM app_ext.port_context_capabilities AS configured
WHERE configured.target_role = 'app_staff'::name
LIMIT 1;
INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, function_identity, typed_args_hash, organization_id
)
SELECT
  database.oid, pg_backend_pid(), pg_current_xact_id(), capability.capability_id,
  capability.session_login, capability.port, capability.target_role,
  capability.context_class, capability.purpose, capability.function_identity,
  decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex'),
  '${organization}'::uuid
FROM pg_database AS database
CROSS JOIN LATERAL (
  SELECT configured.*
  FROM app_ext.port_context_capabilities AS configured
  WHERE configured.capability_id = '7e510000-0000-4000-8000-0000002c1307'::uuid
) AS capability
WHERE database.datname = current_database();
INSERT INTO public.saas_billing_accounts (id, organization_id)
VALUES ('${account}'::uuid, '${organization}'::uuid);
INSERT INTO public.saas_billing_subscriptions
  (id, organization_id, saas_billing_account_id, tariff_id, source, status, lifecycle_state,
   current_period_starts_at, current_period_ends_at, tariff_snapshot)
VALUES (
  '${subscription}'::uuid, '${organization}'::uuid, '${account}'::uuid, '${sourceTariff}'::uuid,
  'paid_subscription', 'expired', 'active', now() - interval '30 days', now() - interval '2 minutes',
  (SELECT to_jsonb(t) FROM public.saas_tariffs AS t WHERE t.id = '${sourceTariff}'::uuid)
);
INSERT INTO public.saas_paid_period_policy
  (key, post_paid_period_behavior, post_paid_period_tariff_id, is_active)
VALUES ('global', '${behavior}', ${targetSql}, true)
ON CONFLICT (key) DO UPDATE SET
  post_paid_period_behavior = EXCLUDED.post_paid_period_behavior,
  post_paid_period_tariff_id = EXCLUDED.post_paid_period_tariff_id,
  is_active = true;
${auditSql}
SELECT 'cabinet|' || state || '|' || policy_source
FROM app.resolve_organization_cabinet_access('${organization}'::uuid);
SELECT 'mechanic|' || state || '|' || policy_source || '|' || mutation_allowed::text
FROM app.resolve_organization_mechanic_access('${organization}'::uuid, 'courses');
ROLLBACK;
`;
}

test('global tariff skips the target tariff local unpaid ladder in both SQL doors', { skip: !ENABLED }, () => {
  const output = psql(
    fixtureSql({
      behavior: 'tariff',
      targetTariffId: '7e510000-0000-4000-8000-0000002c1302',
    }),
  );
  assert.match(output, /cabinet\|full_access\|global_paid_period/u);
  assert.match(output, /mechanic\|full_access\|global_paid_period\|true/u);
});

test('global read_only and blocked override the source tariff local unpaid ladder in both SQL doors', { skip: !ENABLED }, () => {
  const readOnly = psql(fixtureSql({ behavior: 'read_only' }));
  assert.match(readOnly, /cabinet\|read_only\|global_paid_period/u);
  assert.match(readOnly, /mechanic\|read_only\|global_paid_period\|false/u);

  const blocked = psql(fixtureSql({ behavior: 'blocked' }));
  assert.match(blocked, /cabinet\|disabled\|global_paid_period/u);
  assert.match(blocked, /mechanic\|disabled\|global_paid_period\|false/u);
});

test('a stricter global update preserves the earned grace rung in both SQL doors', { skip: !ENABLED }, () => {
  const output = psql(
    fixtureSql({
      behavior: 'blocked',
      audit: {
        before: {
          postPaidPeriodBehavior: 'read_only',
          postPaidPeriodTariffId: null,
          isActive: true,
        },
        after: {
          postPaidPeriodBehavior: 'blocked',
          postPaidPeriodTariffId: null,
          isActive: true,
        },
      },
    }),
  );
  assert.match(output, /cabinet\|grace\|global_paid_period/u);
  assert.match(output, /mechanic\|grace\|global_paid_period\|true/u);
});
