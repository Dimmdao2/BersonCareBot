/**
 * Rollback-only named-DEV proof for the acquiring callback's two tenant_service doors.
 *
 * The callback resolves its clinic under the pre-session class, then runs the rest of the request
 * under an ORGANIZATION principal — the port's `tenant_service` class, which has no through-relation
 * capability at all. Both of its data steps therefore have to be named roots, and both must take the
 * clinic from the ACCEPTED CONTEXT rather than from an argument. This proves exactly that against
 * the live DEV catalog, with real roles, real FORCE RLS and real policies, inside one transaction
 * that is always rolled back.
 *
 *   RUN_ACQUIRING_WEBHOOK_SETTLEMENT_DB=1 node --test \
 *     deploy/postgres/privileges/patient-acquiring-webhook-settlement.devDbProof.test.mjs
 *
 * Fault injection (each must turn the matching assertion red):
 *   ACQUIRING_WEBHOOK_SETTLEMENT_FAULT=tenant_scope   — drop the accepted-tenant filter from the match
 *   ACQUIRING_WEBHOOK_SETTLEMENT_FAULT=terminal_guard — let a repeat callback overwrite a settled row
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_ACQUIRING_WEBHOOK_SETTLEMENT_DB === '1';
const DATABASE = process.env.ACQUIRING_WEBHOOK_SETTLEMENT_PROOF_DB ?? 'bcb_webapp_dev';
const FAULT = process.env.ACQUIRING_WEBHOOK_SETTLEMENT_FAULT ?? '';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (!['', 'tenant_scope', 'terminal_guard'].includes(FAULT)) {
  throw new Error(`unknown ACQUIRING_WEBHOOK_SETTLEMENT_FAULT '${FAULT}'`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const MIGRATION = path.join(
  repoRoot,
  'apps/webapp/db/drizzle-migrations/20260904T230000_the_acquiring_callback_settles_under_its_own_tenant.sql',
);
const CAPABILITY_SEED = path.join(
  repoRoot,
  `deploy/postgres/generated/port-context-capabilities.${DATABASE}.sql`,
);

const SETTLE_IDENTITY = 'app.settle_patient_acquiring_webhook_payment(text,text,text)';
const SETTLE_PURPOSE = 'patient-payment.webhook.settle';
const CONFIG_IDENTITY = 'app.read_acquiring_webhook_booking_payment_setting(text)';
const CONFIG_PURPOSE = 'patient-payment.webhook.booking-payment-config.read';

function psql(sql) {
  return execFileSync(
    'sudo',
    [
      '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-',
    ],
    { input: `\\set VERBOSITY verbose\n${sql}`, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ).trim();
}

/** The candidate body, taken from the migration file itself — never a retyped copy. */
function candidateBlock(marker) {
  const block = fs.readFileSync(MIGRATION, 'utf8')
    .split('--> statement-breakpoint')
    .find((candidate) => candidate.includes(`CREATE OR REPLACE FUNCTION ${marker}`));
  assert.ok(block, `candidate block for ${marker} is missing from the migration`);
  if (marker !== 'app.settle_patient_acquiring_webhook_payment') return block;

  if (FAULT === 'tenant_scope') {
    const healthy = '    AND payment.organization_id = v_org;';
    assert.ok(block.includes(healthy), 'tenant-scope fault injection target is missing');
    return block.replace(healthy, '    AND (payment.organization_id = v_org OR true);');
  }
  if (FAULT === 'terminal_guard') {
    const healthy = "  IF v_statuses[1] IN ('paid', 'failed', 'refunded') THEN\n    RETURN 'already_processed';\n  END IF;";
    assert.ok(block.includes(healthy), 'terminal-guard fault injection target is missing');
    return block
      .replace(healthy, '')
      .replace("    AND payment.status = 'pending';", '    AND payment.status IS NOT NULL;');
  }
  return block;
}

/** The exact capability the generator seeds for this purpose — not a test-local invention. */
function seededCapability(purpose, identity) {
  const seed = fs.readFileSync(CAPABILITY_SEED, 'utf8');
  const line = seed.split('\n').find((candidate) =>
    candidate.includes(`'${purpose}'`) && candidate.includes(identity));
  assert.ok(line, `generated capability seed has no row for ${purpose}`);
  const capabilityId = /\('([0-9a-f-]{36})'::uuid/u.exec(line)?.[1];
  const login = /'([a-z0-9_]+)'::name, 'app_tenant_service'::name/u.exec(line)?.[1];
  assert.ok(capabilityId && login, `cannot read capability id/login for ${purpose}`);
  return { capabilityId, login };
}

function fixture() {
  const row = psql(`
SELECT patient.id::text || '|' || member.platform_user_id::text || '|' || member.organization_id::text
FROM public.be_organization_members AS member
CROSS JOIN LATERAL (
  SELECT id FROM public.platform_users WHERE role = 'client' ORDER BY id LIMIT 1
) AS patient
WHERE member.status = 'active'
ORDER BY member.organization_id, member.platform_user_id
LIMIT 1;`);
  const parts = row.split('|');
  assert.equal(parts.length, 3, 'DEV needs one active organization member and one client account');
  return { patientId: parts[0], staffId: parts[1], ownOrganizationId: parts[2] };
}

const OTHER_ORGANIZATION_ID = '00000000-0000-4000-8000-0000000c12ec';
const OWN_REF = 'proof-own-ref';
const OTHER_REF = 'proof-other-ref';
const PROVIDER = 'alfabank';

/**
 * The declared typed-argument hash for one exact call, computed the way the DB itself computes it.
 *
 * It is resolved BEFORE the port context is opened and inlined as a literal, because the runtime
 * does the same: `packages/db-principal` builds this hash in the application and the session login
 * has no EXECUTE on `app.hash_port_typed_args`. Asking for it from inside the tenant session would
 * prove nothing about the door and only fail on the helper.
 */
const hashCache = new Map();
function hashedArgs(values) {
  const key = JSON.stringify(values);
  if (!hashCache.has(key)) {
    const args = values
      .map((value) => `ROW('text@1', pg_catalog.textsend('${value}'))::app.port_typed_arg`)
      .join(', ');
    const hex = psql(`SELECT encode(app.hash_port_typed_args(ARRAY[${args}]), 'hex');`);
    assert.match(hex, /^[0-9a-f]{64}$/u, `unexpected typed-argument hash for ${key}`);
    hashCache.set(key, `decode('${hex}', 'hex')`);
  }
  return hashCache.get(key);
}

/**
 * Production opens exactly one port context per transaction, and the accepted-context table enforces
 * that with a primary key on (database, backend, transaction). This probe replays SEVERAL production
 * transactions inside one rolled-back transaction, so the previous context row is removed first —
 * that is the transaction boundary the runtime would have provided, not a relaxation of the door:
 * every call below still executes under a freshly installed, fully validated context.
 */
function openTenantContext(capability, organizationId, purpose, identity, typedArgsSql) {
  return `RESET ROLE;
RESET SESSION AUTHORIZATION;
DELETE FROM app_ext.accepted_port_contexts
 WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
SET LOCAL SESSION AUTHORIZATION ${capability.login};
SELECT app.begin_port_context(
  '${capability.capabilityId}'::uuid,
  ROW(
    1::smallint,
    'tenant_service'::app.port_context_class,
    'app_tenant_service'::name,
    '${purpose}',
    '${identity}'::regprocedure,
    ${typedArgsSql},
    NULL::uuid,
    NULL::uuid,
    '${organizationId}'::uuid,
    NULL::bigint,
    NULL::uuid
  )::app.port_context_claims
);`;
}

function setupSql(f, settle, config) {
  return `BEGIN;
GRANT CREATE ON SCHEMA app TO app_seam_payment_webhook_owner, app_seam_settings_runtime_owner;
GRANT USAGE ON LANGUAGE plpgsql TO app_seam_payment_webhook_owner, app_seam_settings_runtime_owner;
SET LOCAL ROLE app_seam_payment_webhook_owner;
${candidateBlock('app.settle_patient_acquiring_webhook_payment')}
RESET ROLE;
SET LOCAL ROLE app_seam_settings_runtime_owner;
${candidateBlock('app.read_acquiring_webhook_booking_payment_setting')}
RESET ROLE;
REVOKE ALL ON FUNCTION ${SETTLE_IDENTITY} FROM PUBLIC;
REVOKE ALL ON FUNCTION ${CONFIG_IDENTITY} FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${SETTLE_IDENTITY} TO app_tenant_service;
GRANT EXECUTE ON FUNCTION ${CONFIG_IDENTITY} TO app_tenant_service;
GRANT SELECT (id, kind, organization_id, provider, provider_payment_id, status),
      UPDATE (status)
  ON public.patient_payment TO app_seam_payment_webhook_owner;
GRANT SELECT (key, scope, organization_id, value_json)
  ON public.system_settings TO app_seam_settings_runtime_owner;
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
VALUES
  ('${settle.capabilityId}'::uuid, 'webapp'::app.port_name, '${settle.login}'::name,
   'app_tenant_service'::name, 'tenant_service'::app.port_context_class, '${SETTLE_PURPOSE}',
   '${SETTLE_IDENTITY}'::regprocedure),
  ('${config.capabilityId}'::uuid, 'webapp'::app.port_name, '${config.login}'::name,
   'app_tenant_service'::name, 'tenant_service'::app.port_context_class, '${CONFIG_PURPOSE}',
   '${CONFIG_IDENTITY}'::regprocedure)
ON CONFLICT (capability_id) DO NOTHING;

-- A second clinic, because a cross-tenant wall cannot be proven with one tenant. It exists only
-- inside this transaction; the enrolment is what makes it a "known organization" for the claim gate.
-- The reference-catalog seeding trigger is off for this one insert: DEV carries no
-- reference_catalog_baselines row, so it raises P0002 for ANY new organization. That is a DEV data
-- gap unrelated to this proof, and the catalog it would seed is not read by either door below.
ALTER TABLE public.be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
INSERT INTO public.be_organizations (id, title)
VALUES ('${OTHER_ORGANIZATION_ID}'::uuid, 'Acquiring webhook proof clinic');
ALTER TABLE public.be_organizations ENABLE TRIGGER be_organizations_reference_catalog_snapshot;
INSERT INTO public.org_enrollments (organization_id, platform_user_id)
VALUES ('${OTHER_ORGANIZATION_ID}'::uuid, '${f.patientId}'::uuid);

-- One pending acquiring row per clinic, sharing a provider but not a reference.
INSERT INTO public.patient_payment
  (id, organization_id, patient_user_id, amount_minor, currency, kind, status, provider,
   provider_payment_id, created_by)
VALUES
  ('00000000-0000-4000-8000-0000000a0001'::uuid, '${f.ownOrganizationId}'::uuid,
   '${f.patientId}'::uuid, 12345, 'RUB', 'acquiring', 'pending', '${PROVIDER}', '${OWN_REF}',
   '${f.staffId}'::uuid),
  ('00000000-0000-4000-8000-0000000a0002'::uuid, '${OTHER_ORGANIZATION_ID}'::uuid,
   '${f.patientId}'::uuid, 54321, 'RUB', 'acquiring', 'pending', '${PROVIDER}', '${OTHER_REF}',
   '${f.staffId}'::uuid);

INSERT INTO public.system_settings (key, scope, organization_id, value_json)
VALUES
  ('booking_payment_providers', 'admin', '${f.ownOrganizationId}'::uuid,
   '{"value":{"defaultProviderId":"alfabank","providers":[{"id":"alfabank","label":"own","enabled":true,"webhookSecret":"own-secret"}]}}'::jsonb),
  ('booking_payment_providers', 'admin', '${OTHER_ORGANIZATION_ID}'::uuid,
   '{"value":{"defaultProviderId":"alfabank","providers":[{"id":"alfabank","label":"other","enabled":true,"webhookSecret":"other-secret"}]}}'::jsonb)
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
SET value_json = EXCLUDED.value_json;
`;
}

function ledgerStateSql() {
  return `RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT json_build_object(
  'own', (SELECT status FROM public.patient_payment WHERE provider_payment_id = '${OWN_REF}'),
  'other', (SELECT status FROM public.patient_payment WHERE provider_payment_id = '${OTHER_REF}')
)::text;`;
}

test('a verified callback settles only its own clinic row, and only once',
  { skip: !ENABLED, concurrency: false }, () => {
    const f = fixture();
    const settle = seededCapability(SETTLE_PURPOSE, SETTLE_IDENTITY);
    const config = seededCapability(CONFIG_PURPOSE, CONFIG_IDENTITY);
    const settleCall = (ref, status) => `${openTenantContext(
      settle, f.ownOrganizationId, SETTLE_PURPOSE, SETTLE_IDENTITY,
      hashedArgs([PROVIDER, ref, status]),
    )}
SELECT '<<' || app.settle_patient_acquiring_webhook_payment('${PROVIDER}', '${ref}', '${status}') || '>>';`;

    const output = psql(`${setupSql(f, settle, config)}
${settleCall(OWN_REF, 'paid')}
${ledgerStateSql()}
${settleCall(OWN_REF, 'failed')}
${ledgerStateSql()}
${settleCall(OTHER_REF, 'paid')}
${ledgerStateSql()}
ROLLBACK;`);

    const outcomes = [...output.matchAll(/<<([a-z_]+)>>/gu)].map((match) => match[1]);
    const states = [...output.matchAll(/\{"own"\s*:\s*"(\w+)",\s*"other"\s*:\s*"(\w+)"\}/gu)]
      .map((match) => ({ own: match[1], other: match[2] }));
    assert.equal(outcomes.length, 3, `expected three settlement outcomes, got: ${output}`);
    assert.equal(states.length, 3, `expected three ledger reads, got: ${output}`);

    // 1. The callback this clinic really owns moves out of pending; the neighbour is untouched.
    assert.equal(outcomes[0], 'settled');
    assert.deepEqual(states[0], { own: 'paid', other: 'pending' });

    // 2. The acquirer repeats the same callback — and a later cancellation must not undo a capture.
    assert.equal(outcomes[1], 'already_processed');
    assert.deepEqual(states[1], { own: 'paid', other: 'pending' });

    // 3. The neighbouring clinic's own provider reference, presented inside THIS clinic's accepted
    //    context, resolves to nothing and writes nothing.
    assert.equal(outcomes[2], 'not_found');
    assert.deepEqual(states[2], { own: 'paid', other: 'pending' });
  });

test("the provider config door returns the accepted clinic's secret and no other",
  { skip: !ENABLED, concurrency: false }, () => {
    const f = fixture();
    const settle = seededCapability(SETTLE_PURPOSE, SETTLE_IDENTITY);
    const config = seededCapability(CONFIG_PURPOSE, CONFIG_IDENTITY);
    const readCall = (organizationId, key) => `${openTenantContext(
      config, organizationId, CONFIG_PURPOSE, CONFIG_IDENTITY, hashedArgs([key]),
    )}
SELECT '<<' || coalesce(
  app.read_acquiring_webhook_booking_payment_setting('${key}')
    #>> '{value,providers,0,webhookSecret}', 'none') || '>>';`;

    const output = psql(`${setupSql(f, settle, config)}
${readCall(f.ownOrganizationId, 'booking_payment_providers')}
${readCall(OTHER_ORGANIZATION_ID, 'booking_payment_providers')}
${readCall(f.ownOrganizationId, 'telegram_bot_token')}
ROLLBACK;`);

    const secrets = [...output.matchAll(/<<([\w-]+)>>/gu)].map((match) => match[1]);
    assert.deepEqual(secrets, ['own-secret', 'other-secret', 'none'],
      `each accepted clinic must see only its own provider secret, and no key outside the pair: ${output}`);
  });

test('an unsupported target status is refused instead of written',
  { skip: !ENABLED, concurrency: false }, () => {
    const f = fixture();
    const settle = seededCapability(SETTLE_PURPOSE, SETTLE_IDENTITY);
    const config = seededCapability(CONFIG_PURPOSE, CONFIG_IDENTITY);
    let failure = '';
    try {
      psql(`${setupSql(f, settle, config)}
${openTenantContext(settle, f.ownOrganizationId, SETTLE_PURPOSE, SETTLE_IDENTITY,
        hashedArgs([PROVIDER, OWN_REF, 'refunded']))}
SELECT app.settle_patient_acquiring_webhook_payment('${PROVIDER}', '${OWN_REF}', 'refunded');
ROLLBACK;`);
    } catch (error) {
      failure = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    assert.match(failure, /patient_acquiring_webhook_settle_status_unsupported/u);
  });

test('the settlement door refuses a call the accepted context did not authorise',
  { skip: !ENABLED, concurrency: false }, () => {
    const f = fixture();
    const settle = seededCapability(SETTLE_PURPOSE, SETTLE_IDENTITY);
    const config = seededCapability(CONFIG_PURPOSE, CONFIG_IDENTITY);
    let failure = '';
    try {
      // Right role, right clinic, but the accepted context was installed for a DIFFERENT argument
      // transcript. The gate compares the typed-argument hash, so a context cannot be reused to
      // settle a reference it was never opened for.
      psql(`${setupSql(f, settle, config)}
${openTenantContext(settle, f.ownOrganizationId, SETTLE_PURPOSE, SETTLE_IDENTITY,
        hashedArgs([PROVIDER, OWN_REF, 'paid']))}
SELECT app.settle_patient_acquiring_webhook_payment('${PROVIDER}', '${OTHER_REF}', 'paid');
ROLLBACK;`);
    } catch (error) {
      failure = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    assert.match(failure, /42501|port context/u);
  });
