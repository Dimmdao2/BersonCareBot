/**
 * #1069 §5a 4b.3/4b.4 — opt-in behavioural oracle for the single live access door
 * `app.resolve_organization_mechanic_access` against the named DEV database.
 *
 * Named fault this catches (owner requirement 4b.3/4b.4,
 * `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`): two DIFFERENT stored downgrade
 * values for the same capability mechanic produce the SAME final state, so a clinic downgraded
 * under `оставить только чтение` loses read access to data it accumulated, exactly as if the owner
 * had chosen `выключить сразу`. Only the SQL door can be asked this — the TS mirrors resolve
 * against fakes and cannot observe which tariff column the door actually reads (§10b, "DB/RLS —
 * актуальный механизм проверки").
 *
 * Three independent failure classes, each with its recorded targeted mutation:
 *   1. `read_only` must keep reads (state `read_only`, no mutation). Injection: a door that never
 *      reads `downgrade_policies` -> case 1 reddens (`disabled`), cases 2-6 stay green.
 *   2. Everything else fails closed to `disabled` — `disable_immediately`, unset, JSON null,
 *      unknown value, `block`, and a padded ` read_only `. Injection: replace the equality with
 *      `IS DISTINCT FROM 'disable_immediately'` -> cases 2-6 redden, case 1 stays green.
 *   3. Capability policy must not reach numeric/seat mechanics: `files`, `branches` and
 *      `clinic_team` stay included whatever value the tariff stores, because their ceiling belongs
 *      to their own write door. Injection: drop `files`/`branches` from the always-included list
 *      -> the numeric cases redden.
 * Cross-organization isolation is asserted in the same fixture: an accepted context for org A must
 * not resolve org B, so one tariff's stored policy can never answer for another tenant.
 *
 * Every scenario builds its fixture inside one transaction and ends in ROLLBACK; the proof uses
 * the repository's local admin socket pattern because the fixture crosses FORCE-RLS billing tables.
 *
 *   RUN_DOWNGRADE_CAPABILITY_POLICY_DB=1 node --test \
 *     deploy/postgres/privileges/downgrade-capability-policy.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_DOWNGRADE_CAPABILITY_POLICY_DB === '1';
const DATABASE = process.env.DOWNGRADE_CAPABILITY_POLICY_PROOF_DB ?? 'bcb_webapp_dev';

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

const OWN_TARIFF = '7e510000-0000-4000-8000-0000004b3001';
const FOREIGN_TARIFF = '7e510000-0000-4000-8000-0000004b3002';
const OWN_ORGANIZATION = '7e510000-0000-4000-8000-0000004b3003';
const FOREIGN_ORGANIZATION = '7e510000-0000-4000-8000-0000004b3004';
const CAPABILITY = '7e510000-0000-4000-8000-0000004b3005';

/**
 * `mechanics` decides inclusion, `downgradePolicies` carries the owner's stored value. The tariff
 * always names a full ladder so a green result can never come from an unconfigured system policy.
 */
function fixtureSql({ mechanics, downgradePolicies, probe }) {
  return `
BEGIN;
INSERT INTO public.saas_tariffs
  (id, name, mechanics, quotas, billing_period, included_seats, system_access_policy,
   downgrade_policies)
VALUES
  ('${OWN_TARIFF}'::uuid, '#1069 4b.3 own', '${JSON.stringify(mechanics)}'::jsonb, '{}'::jsonb,
   'month', 5,
   '{"graceDays":7,"readOnlyDays":7,"terminalState":"disabled","notifications":[]}'::jsonb,
   '${JSON.stringify(downgradePolicies)}'::jsonb),
  ('${FOREIGN_TARIFF}'::uuid, '#1069 4b.3 foreign', '{}'::jsonb, '{}'::jsonb, 'month', 5,
   '{"graceDays":7,"readOnlyDays":7,"terminalState":"disabled","notifications":[]}'::jsonb,
   '{"courses":"read_only"}'::jsonb);
ALTER TABLE public.be_organizations DISABLE TRIGGER USER;
INSERT INTO public.be_organizations (id, title, tariff_id, is_active)
VALUES
  ('${OWN_ORGANIZATION}'::uuid, '#1069 4b.3 own', '${OWN_TARIFF}'::uuid, true),
  ('${FOREIGN_ORGANIZATION}'::uuid, '#1069 4b.3 foreign', '${FOREIGN_TARIFF}'::uuid, true);
ALTER TABLE public.be_organizations ENABLE TRIGGER USER;
INSERT INTO app_ext.port_context_capabilities (
  capability_id, port, session_login, target_role, context_class, purpose, function_identity
)
SELECT
  '${CAPABILITY}'::uuid,
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
  '${OWN_ORGANIZATION}'::uuid
FROM pg_database AS database
CROSS JOIN LATERAL (
  SELECT configured.*
  FROM app_ext.port_context_capabilities AS configured
  WHERE configured.capability_id = '${CAPABILITY}'::uuid
) AS capability
WHERE database.datname = current_database();
SELECT 'mechanic|' || state || '|' || mutation_allowed::text
FROM app.resolve_organization_mechanic_access('${OWN_ORGANIZATION}'::uuid, '${probe}');
CREATE FUNCTION pg_temp.probe_foreign_organization() RETURNS text LANGUAGE plpgsql AS $foreign$
BEGIN
  PERFORM app.resolve_organization_mechanic_access('${FOREIGN_ORGANIZATION}'::uuid, '${probe}');
  RETURN 'ALLOWED';
EXCEPTION WHEN OTHERS THEN RETURN 'REFUSED ' || SQLSTATE;
END $foreign$;
SELECT 'foreign|' || pg_temp.probe_foreign_organization();
ROLLBACK;
`;
}

function resolve(options) {
  return psql(fixtureSql(options));
}

test('an excluded capability stored as read_only keeps reads and refuses writes', { skip: !ENABLED }, () => {
  const output = resolve({
    mechanics: { booking: true },
    downgradePolicies: { courses: 'read_only' },
    probe: 'courses',
  });
  assert.match(output, /mechanic\|read_only\|false/u);
});

test('every other stored value for an excluded capability fails closed to disabled', { skip: !ENABLED }, () => {
  for (const downgradePolicies of [
    { courses: 'disable_immediately' },
    {},
    { courses: null },
    { courses: 'full_access' },
    { courses: 'block' },
    { courses: ' read_only ' },
  ]) {
    const output = resolve({ mechanics: { booking: true }, downgradePolicies, probe: 'courses' });
    assert.match(
      output,
      /mechanic\|disabled\|false/u,
      `expected fail-closed for ${JSON.stringify(downgradePolicies)}, got: ${output}`,
    );
  }
});

test('an included capability is unaffected by the stored downgrade value', { skip: !ENABLED }, () => {
  const output = resolve({
    mechanics: { courses: true },
    downgradePolicies: { courses: 'read_only' },
    probe: 'courses',
  });
  assert.match(output, /mechanic\|full_access\|true/u);
});

test('capability policy never reaches numeric or seat mechanics', { skip: !ENABLED }, () => {
  for (const [probe, downgradePolicies] of [
    ['files', { files: 'freeze_growth' }],
    ['files', { files: 'read_only' }],
    ['branches', { branches: 'read_only' }],
    ['clinic_team', { clinic_team: 'read_only' }],
  ]) {
    const output = resolve({ mechanics: { booking: true }, downgradePolicies, probe });
    assert.match(
      output,
      /mechanic\|full_access\|true/u,
      `expected ${probe} to stay included, got: ${output}`,
    );
  }
});

test('one organization context never resolves another organization', { skip: !ENABLED }, () => {
  const output = resolve({
    mechanics: { booking: true },
    downgradePolicies: { courses: 'read_only' },
    probe: 'courses',
  });
  assert.match(output, /foreign\|REFUSED 42501/u);
});
