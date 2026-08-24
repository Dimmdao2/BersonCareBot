/**
 * D25 live proof on the named DEV database: a generic Telegram/MAX webhook creates NOTHING, and the
 * candidate migration that makes it so can actually be applied by its declared owner.
 *
 * Failure caught (one line): `app.integrator_upsert_channel_identity` — the single SQL root behind
 * `writePort.ts` `user.upsert`, which `createIncomingEventPipeline` calls for EVERY user-originated
 * message/callback — creates a blank canonical person when the messenger id is unknown. Owner
 * decision 23.08.2026 («Роль бота после появления приложения»): «Произвольный `/start`, сообщение,
 * callback или contact без действующей token-bound попытки не создаёт `platform_users`».
 *
 * Why a live proof and not a unit test (AGENTS.md §24.4): the create branch lives in a SECURITY
 * DEFINER SQL body, not in TypeScript. A TS test can only prove what the caller does with the root's
 * answer; only the real function against real tables proves the root itself stopped creating.
 *
 * ARM A (fault injection, teeth): the accepted candidate body is read from its immutable migration,
 * then the first forbidden pre-candidate INSERT is reintroduced in memory and replayed inside the
 * rolled-back transaction. The shared identity seam owner intentionally retains that column-level
 * INSERT for the web registration roots, so this mutant must create a row. That proves arm B is able
 * to observe the exact forbidden bot-ingress regression after the generated schema-B snapshot is
 * refreshed to the accepted lookup-only state. The injection lives HERE; nothing on disk is touched.
 *
 * ARM B (acceptance): the candidate migration is materialized in the same transaction, and the same
 * unknown Telegram and MAX ids must leave `platform_users` / `user_identity` /
 * `user_channel_bindings` / `user_channel_preferences` unchanged, while a KNOWN existing binding
 * still resolves and still refreshes its display handle.
 *
 * ARM C (owner-aware preflight, AGENTS.md §1 «Миграции schema B»): the candidate migration is
 * replayed through the REAL runner contract — `parseOwnerStatements` markers, one
 * `SET LOCAL SESSION AUTHORIZATION <migrator>` + `SET LOCAL ROLE <owner>` per statement, and only
 * the temporary grants the markers ask for. «Голый SQL от `postgres` не является preflight: superuser
 * обходит именно те границы, которые должна проверить миграция» — so arms A/B alone cannot answer
 * whether the migration is appliable at all. Arm C also pins the post-state: same OID (no stale
 * `regprocedure`), same owner, SECURITY DEFINER and `search_path` intact, both `BCB-MIGRATION-VERIFY`
 * predicates true, and no leaked temporary role membership.
 *
 * All three arms run inside `BEGIN … ROLLBACK`. No disposable database, no persistent DEV data,
 * nothing left behind.
 *
 * Run:
 *   RUN_D25_GENERIC_INGRESS_DB=1 node --test \
 *     deploy/postgres/privileges/d25-generic-ingress-creates-nothing.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseOwnerStatements } from './migrate-local-parse.mjs';

const ENABLED = process.env.RUN_D25_GENERIC_INGRESS_DB === '1';
const DATABASE = process.env.D25_GENERIC_INGRESS_PROOF_DB ?? 'bcb_webapp_dev';
const MIGRATOR = process.env.D25_GENERIC_INGRESS_PROOF_MIGRATOR ?? 'bcb_dev_migrator';
const MIGRATION_TAGS = [
  '20260823T093000_channel_identity_root_becomes_lookup_only',
  '20260823T110000_phone_messenger_bind_claims_are_token_bound',
];
const MIGRATIONS = MIGRATION_TAGS.map(
  (tag) => new URL(`../../../apps/webapp/db/drizzle-migrations/${tag}.sql`, import.meta.url),
);
const ROOT = 'app.integrator_upsert_channel_identity(text,text,text)';

for (const [label, value] of [['database', DATABASE], ['migrator', MIGRATOR]]) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new Error(`unsafe ${label} identifier '${value}'`);
  }
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ).trim();
}

function parsed(output) {
  return Object.fromEntries(
    output
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
}

const candidateSource = MIGRATIONS.map((migration) => readFileSync(fileURLToPath(migration), 'utf8')).join('\n--> statement-breakpoint\n');

/** Reintroduce the first forbidden creation write into the accepted body without relying on a stale snapshot. */
function preCandidateBodySql() {
  const source = readFileSync(fileURLToPath(MIGRATIONS[0]), 'utf8');
  const start = source.indexOf('CREATE OR REPLACE FUNCTION app.integrator_upsert_channel_identity(');
  assert.ok(start >= 0, 'candidate migration no longer defines the channel-identity root');
  const endMarker = '\n$function$;';
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, 'could not find the end of the candidate channel-identity body');
  const acceptedBody = source.slice(start, end + endMarker.length);
  const terminalMiss = '  RETURN;\nEND\n$function$;';
  assert.ok(
    acceptedBody.endsWith(terminalMiss),
    'candidate body no longer ends in the lookup-only miss contract',
  );
  const body = acceptedBody.slice(0, -terminalMiss.length) + String.raw`  INSERT INTO public.platform_users (display_name)
  VALUES ('')
  RETURNING id INTO v_platform_user_id;

  RETURN QUERY SELECT v_platform_user_id, true, false;
END
$function$;`;
  assert.match(
    body,
    /INSERT INTO public\.platform_users/u,
    'fault body must reintroduce the forbidden platform-user creation write',
  );
  return body;
}

/** Same helper the other devDbProof files use: register + accept ONE port context in this xact. */
const ACCEPT_CONTEXT_HELPER = String.raw`
CREATE OR REPLACE FUNCTION pg_temp.accept_context(
  p_capability_id uuid,
  p_target_role name,
  p_context_class app.port_context_class,
  p_purpose text,
  p_function_identity regprocedure,
  p_organization_id uuid,
  p_typed_args app.port_typed_arg[] DEFAULT ARRAY[]::app.port_typed_arg[]
) RETURNS void LANGUAGE plpgsql AS $accept$
BEGIN
  DELETE FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid()
     AND transaction_id = pg_current_xact_id();
  DELETE FROM app_ext.port_context_capabilities WHERE capability_id = p_capability_id;

  INSERT INTO app_ext.port_context_capabilities
    (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
  SELECT p_capability_id, declared.port, session_user, declared.target_role,
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
     AND capability.capability_id = p_capability_id;
END $accept$;

-- One entry point for the probe: install the exact port context these three text arguments hash to,
-- become app_integrator_resolver (the only role granted EXECUTE), call the root, drop back. This is
-- the same door writeDirectPublic('identity-upsert', ...) enters through in product code.
CREATE OR REPLACE FUNCTION pg_temp.call_identity_root(
  p_channel text, p_external text, p_handle text
) RETURNS TABLE(platform_user_id uuid, account_created boolean, channel_binding_inserted boolean)
LANGUAGE plpgsql AS $call$
BEGIN
  PERFORM pg_temp.accept_context(
    'd25a0d17-0000-4000-8000-00000000d251'::uuid,
    'app_integrator_resolver'::name,
    'integrator'::app.port_context_class,
    'integrator.channel-identity.upsert',
    'app.integrator_upsert_channel_identity(text,text,text)'::regprocedure,
    NULL::uuid,
    ARRAY[
      ROW('text@1', pg_catalog.textsend(p_channel))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_external))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_handle))::app.port_typed_arg
    ]
  );
  EXECUTE 'SET LOCAL ROLE app_integrator_resolver';
  RETURN QUERY SELECT * FROM app.integrator_upsert_channel_identity(p_channel, p_external, p_handle);
  EXECUTE 'RESET ROLE';
END $call$;

CREATE TEMP TABLE probe_out(ord serial PRIMARY KEY, key text NOT NULL, value text NOT NULL);

CREATE OR REPLACE FUNCTION pg_temp.identity_counts() RETURNS text LANGUAGE sql AS $counts$
  SELECT pg_catalog.concat_ws('/',
    (SELECT count(*) FROM public.platform_users),
    (SELECT count(*) FROM public.user_identity),
    (SELECT count(*) FROM public.user_channel_bindings),
    (SELECT count(*) FROM public.user_channel_preferences));
$counts$;
`;

/** Fake ids that must not collide with real DEV rows; asserted absent before every arm. */
const UNKNOWN_TG = 'd25audit-tg-90210111';
const UNKNOWN_MAX = 'd25audit-max-90210222';

const FIXTURE_GUARD = String.raw`
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_channel_bindings
              WHERE external_id IN ('${UNKNOWN_TG}', '${UNKNOWN_MAX}')) THEN
    RAISE EXCEPTION 'fixture id collision on named DEV — pick fresh ids';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_channel_bindings AS binding
                  INNER JOIN public.platform_users AS person ON person.id = binding.user_id
                  WHERE binding.channel_code = 'telegram' AND person.merged_into_id IS NULL) THEN
    RAISE EXCEPTION 'named DEV needs one live telegram binding for the known-binding control';
  END IF;
END $guard$;
`;

function armAsql() {
  return String.raw`
BEGIN;
SET LOCAL statement_timeout = '120s';
${preCandidateBodySql()}
${ACCEPT_CONTEXT_HELPER}
${FIXTURE_GUARD}

DO $arm_a$
DECLARE
  before_counts text;
  after_counts text;
  created boolean;
  returned integer;
BEGIN
  before_counts := pg_temp.identity_counts();
  SELECT count(*), bool_or(root.account_created) INTO returned, created
    FROM pg_temp.call_identity_root('telegram', '${UNKNOWN_TG}', 'd25auditor') AS root;
  after_counts := pg_temp.identity_counts();
  INSERT INTO probe_out(key, value) VALUES
    ('arm_a_body_creates',
      (SELECT (pg_get_functiondef('${ROOT}'::regprocedure)
               ~ 'INSERT INTO public[.]platform_users')::text)),
    ('arm_a_rows_returned', returned::text),
    ('arm_a_account_created', coalesce(created::text, 'NULL')),
    ('arm_a_counts_before', before_counts),
    ('arm_a_counts_after', after_counts),
    ('arm_a_binding_rows',
      (SELECT count(*)::text FROM public.user_channel_bindings AS binding
        WHERE binding.external_id = '${UNKNOWN_TG}'));
END $arm_a$;

SELECT key || '=' || value FROM probe_out ORDER BY ord;
ROLLBACK;
`;
}

function armBsql() {
  return String.raw`
BEGIN;
SET LOCAL statement_timeout = '300s';
${candidateSource}
${ACCEPT_CONTEXT_HELPER}
${FIXTURE_GUARD}

CREATE TEMP TABLE known_binding AS
SELECT binding.external_id, binding.display_handle, binding.user_id
  FROM public.user_channel_bindings AS binding
  INNER JOIN public.platform_users AS person ON person.id = binding.user_id
 WHERE binding.channel_code = 'telegram'
   AND person.merged_into_id IS NULL
 ORDER BY binding.external_id
 LIMIT 1;

DO $arm_b$
DECLARE
  before_counts text; after_generic text; after_known text;
  tg_rows integer; max_rows integer;
  fixture known_binding%ROWTYPE;
  resolved uuid; resolved_created boolean; resolved_rows integer;
  handle_after text;
BEGIN
  INSERT INTO probe_out(key, value) VALUES
    ('arm_b_body_creates',
      (SELECT (pg_get_functiondef('${ROOT}'::regprocedure)
               ~ 'INSERT INTO public[.]platform_users')::text)),
    ('arm_b_body_marker',
      (SELECT (pg_get_functiondef('${ROOT}'::regprocedure)
               ~ 'unknown channel identity is a lookup miss')::text)),
    ('arm_b_body_touches_user_identity',
      (SELECT (pg_get_functiondef('${ROOT}'::regprocedure) ~ 'public[.]user_identity')::text)),
    ('arm_b_body_touches_preferences',
      (SELECT (pg_get_functiondef('${ROOT}'::regprocedure)
               ~ 'public[.]user_channel_preferences')::text));

  before_counts := pg_temp.identity_counts();

  SELECT count(*) INTO tg_rows
    FROM pg_temp.call_identity_root('telegram', '${UNKNOWN_TG}', 'd25auditor') AS root;
  SELECT count(*) INTO max_rows
    FROM pg_temp.call_identity_root('max', '${UNKNOWN_MAX}', NULL) AS root;

  after_generic := pg_temp.identity_counts();

  SELECT * INTO fixture FROM known_binding;
  SELECT count(*), (array_agg(root.platform_user_id))[1], bool_or(root.account_created)
    INTO resolved_rows, resolved, resolved_created
    FROM pg_temp.call_identity_root('telegram', fixture.external_id, 'd25AuditHandle') AS root;
  SELECT binding.display_handle INTO handle_after
    FROM public.user_channel_bindings AS binding
   WHERE binding.channel_code = 'telegram' AND binding.external_id = fixture.external_id;
  after_known := pg_temp.identity_counts();

  INSERT INTO probe_out(key, value) VALUES
    ('arm_b_counts_before', before_counts),
    ('arm_b_counts_after_generic', after_generic),
    ('arm_b_counts_after_known', after_known),
    ('arm_b_generic_tg_rows', tg_rows::text),
    ('arm_b_generic_max_rows', max_rows::text),
    ('arm_b_generic_binding_rows',
      (SELECT count(*)::text FROM public.user_channel_bindings AS binding
        WHERE binding.external_id IN ('${UNKNOWN_TG}', '${UNKNOWN_MAX}'))),
    ('arm_b_known_rows', resolved_rows::text),
    ('arm_b_known_resolves_same_person',
      (resolved IS NOT DISTINCT FROM fixture.user_id)::text),
    ('arm_b_known_account_created', coalesce(resolved_created::text, 'NULL')),
    ('arm_b_known_handle_after', coalesce(handle_after, 'NULL'));
END $arm_b$;

SELECT key || '=' || value FROM probe_out ORDER BY ord;
ROLLBACK;
`;
}

/**
 * The runner contract, reproduced from the migration's OWN markers via the runner's OWN parser
 * (`migrate-local.mjs` builds exactly these statements). A statement whose marker block does not ask
 * for BCB-MIGRATION-SCHEMA-CREATE gets no CREATE on that schema — which is the whole point: a seam
 * owner holds USAGE on schema app and nothing more.
 */
function armCsql() {
  const steps = parseOwnerStatements(candidateSource, MIGRATION_TAGS.join(','));
  const owned = steps.filter((step) => !step.backfill);
  const owners = [...new Set(owned.map((step) => step.owner))];
  const schemaCreates = [
    ...new Map(
      owned
        .filter((step) => step.schemaCreate)
        .map((step) => [`${step.owner}:${step.schemaCreate}`, step]),
    ).values(),
  ];
  const languageUsages = [
    ...new Map(
      owned
        .filter((step) => step.languageUsage)
        .map((step) => [`${step.owner}:${step.languageUsage}`, step]),
    ).values(),
  ];

  return [
    'BEGIN;',
    "SET LOCAL statement_timeout = '300s';",
    `SELECT 'oid_before=' || oid::text FROM pg_proc WHERE oid='${ROOT}'::regprocedure;`,
    ...owners.map(
      (owner) => `GRANT ${owner} TO ${MIGRATOR} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;`,
    ),
    ...schemaCreates.map((step) => `GRANT CREATE ON SCHEMA ${step.schemaCreate} TO ${step.owner};`),
    ...languageUsages.map(
      (step) => `GRANT USAGE ON LANGUAGE ${step.languageUsage} TO ${step.owner};`,
    ),
    `SET LOCAL SESSION AUTHORIZATION ${MIGRATOR};`,
    ...owned.flatMap((step) => [`SET LOCAL ROLE ${step.owner};`, step.sql, 'RESET ROLE;']),
    'RESET SESSION AUTHORIZATION;',
    ...schemaCreates.map(
      (step) => `REVOKE CREATE ON SCHEMA ${step.schemaCreate} FROM ${step.owner};`,
    ),
    ...languageUsages.map(
      (step) => `REVOKE USAGE ON LANGUAGE ${step.languageUsage} FROM ${step.owner};`,
    ),
    ...owners.map((owner) => `REVOKE ${owner} FROM ${MIGRATOR};`),
    `SELECT 'oid_after=' || oid::text FROM pg_proc WHERE oid='${ROOT}'::regprocedure;`,
    `SELECT 'owner_after=' || pg_get_userbyid(proowner) FROM pg_proc WHERE oid='${ROOT}'::regprocedure;`,
    `SELECT 'secdef_after=' || prosecdef::text FROM pg_proc WHERE oid='${ROOT}'::regprocedure;`,
    `SELECT 'proconfig_after=' || array_to_string(proconfig, ',') FROM pg_proc WHERE oid='${ROOT}'::regprocedure;`,
    `SELECT 'verify_no_insert=' || (pg_get_functiondef('${ROOT}'::regprocedure) !~ 'INSERT INTO public[.]platform_users')::text;`,
    `SELECT 'verify_marker=' || (pg_get_functiondef('${ROOT}'::regprocedure) ~ 'unknown channel identity is a lookup miss')::text;`,
    `SELECT 'membership_leaked=' || EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member='${MIGRATOR}'::regrole AND m.roleid = ANY (ARRAY[${owners
      .map((owner) => `'${owner}'::regrole`)
      .join(', ')}]))::text;`,
    'ROLLBACK;',
  ].join('\n');
}

test(
  'D25 named-DEV proof: generic messenger ingress creates nothing, known binding still resolves',
  {
    skip: ENABLED ? false : 'set RUN_D25_GENERIC_INGRESS_DB=1 to run against the named DEV database',
  },
  () => {
    // ARM A — fault injection. The shared seam owner still writes for normal web registration, so a
    // reintroduced bot-ingress INSERT must move the live counts or arm B's silence proves nothing.
    const a = parsed(psql(armAsql()));
    if (process.env.D25_PROOF_PRINT === '1') console.error('ARM A', a);
    assert.equal(
      a.arm_a_body_creates,
      'true',
      'arm A must run against the creating (pre-candidate) body',
    );
    assert.equal(a.arm_a_rows_returned, '1');
    assert.equal(
      a.arm_a_account_created,
      'true',
      'the injected forbidden branch must report the created canonical person',
    );
    assert.equal(a.arm_a_binding_rows, '0', 'the minimal injected branch writes no channel binding');
    assert.notEqual(
      a.arm_a_counts_before,
      a.arm_a_counts_after,
      'the injected forbidden branch must move the identity counts or the probe is blind',
    );

    // ARM B — acceptance on the candidate body.
    const b = parsed(psql(armBsql()));
    if (process.env.D25_PROOF_PRINT === '1') console.error('ARM B', b);
    assert.equal(
      b.arm_b_body_creates,
      'false',
      'candidate body must have no INSERT into platform_users',
    );
    assert.equal(b.arm_b_body_marker, 'true', 'candidate body must carry the D25 lookup-miss contract');
    assert.equal(
      b.arm_b_body_touches_user_identity,
      'false',
      'candidate body must not touch user_identity',
    );
    assert.equal(
      b.arm_b_body_touches_preferences,
      'false',
      'candidate body must not touch preferences',
    );

    assert.equal(b.arm_b_generic_tg_rows, '0', 'unknown telegram id resolves to zero rows');
    assert.equal(b.arm_b_generic_max_rows, '0', 'unknown MAX id resolves to zero rows');
    assert.equal(b.arm_b_generic_binding_rows, '0', 'no binding row appears for either unknown id');
    assert.equal(
      b.arm_b_counts_before,
      b.arm_b_counts_after_generic,
      'generic Telegram+MAX ingress must leave platform_users/user_identity/bindings/preferences unchanged',
    );

    assert.equal(b.arm_b_known_rows, '1', 'a known binding still resolves');
    assert.equal(
      b.arm_b_known_resolves_same_person,
      'true',
      'and resolves to the same canonical person',
    );
    assert.equal(b.arm_b_known_account_created, 'false', 'resolution never reports a creation');
    assert.equal(b.arm_b_known_handle_after, 'd25AuditHandle', 'display-handle refresh still works');
    assert.equal(
      b.arm_b_counts_before,
      b.arm_b_counts_after_known,
      'resolving a known binding creates no row either',
    );
  },
);

test(
  'D25 named-DEV preflight: the candidate migration applies as its declared statement owner',
  {
    skip: ENABLED ? false : 'set RUN_D25_GENERIC_INGRESS_DB=1 to run against the named DEV database',
  },
  () => {
    let out;
    try {
      out = psql(armCsql());
    } catch (error) {
      const stderr = String(error.stderr ?? error.message ?? '');
      assert.fail(
        `owner-aware rollback-only preflight of ${MIGRATION_TAGS.join(', ')} failed — the migration cannot be `
          + 'applied by the owner its own marker block declares, so the DEV/TEST deploy would abort '
          + `on it:\n${stderr.trim()}\n\nCompare the marker block with every other migration that `
          + 'does CREATE OR REPLACE FUNCTION app.*: a seam owner holds USAGE on schema app and '
          + 'nothing more, so the statement must also declare "-- BCB-MIGRATION-SCHEMA-CREATE: app" '
          + 'for the runner to grant it CREATE for the duration of the transaction.',
      );
    }
    const c = parsed(out);
    if (process.env.D25_PROOF_PRINT === '1') console.error('ARM C', c);
    assert.equal(c.oid_after, c.oid_before, 'CREATE OR REPLACE must keep the OID — no stale regprocedure');
    assert.equal(c.owner_after, 'app_seam_identity_lookup_owner', 'owner must not change');
    assert.equal(c.secdef_after, 'true', 'SECURITY DEFINER must survive the replace');
    assert.equal(
      c.proconfig_after,
      'search_path=pg_catalog, app, public, pg_temp',
      'search_path must survive the replace',
    );
    assert.equal(c.verify_no_insert, 'true', 'BCB-MIGRATION-VERIFY #1 must hold after apply');
    assert.equal(c.verify_marker, 'true', 'BCB-MIGRATION-VERIFY #2 must hold after apply');
    assert.equal(c.membership_leaked, 'false', 'temporary migration membership must not survive');
  },
);
