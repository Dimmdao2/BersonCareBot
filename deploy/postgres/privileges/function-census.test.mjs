import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { declaration } from './declaration.ts';
import {
  BUSINESS_SEAM_FUNCTIONS,
  BUSINESS_SEAM_STATS,
  LEGACY_DEFINER_CENSUS_COUNT,
  OBSOLETE_CONTEXT_SIGNATURES,
} from './function-census.ts';
import { collectGaps, generateFunctionCensusSql } from './generate.mjs';
import {
  compareFunctionSurfaces,
  currentPatientArtifactFunctions,
  extractPublicRelationOperations,
  latestArtifactFunctions,
  parseExecutableFunctions,
} from './function-body-surface.mjs';
import { assertNameCensus } from './name-census.mjs';
import {
  compareDeclaredFunctionReturnShapes,
  extractFunctionReturnShapes,
  latestFunctionReturnShapes,
  parseReturnShape,
} from './function-return-shape.mjs';

const PRIVILEGES_DIR = path.dirname(fileURLToPath(import.meta.url));
const CURRENT_PATIENT_MIGRATIONS = [
  path.resolve(PRIVILEGES_DIR, '../../../apps/webapp/db/drizzle-migrations/0016_patient_self_action_capabilities.sql'),
  path.resolve(PRIVILEGES_DIR, '../../../apps/webapp/db/drizzle-migrations/0017_patient_shared_core_capabilities.sql'),
];
const B0_FORWARD_MIGRATIONS = fs.readdirSync(path.resolve(PRIVILEGES_DIR, '../../../apps/webapp/db/drizzle-migrations'))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort()
  .map((file) => path.resolve(PRIVILEGES_DIR, '../../../apps/webapp/db/drizzle-migrations', file));
const B0_EVIDENCE_COMMIT = '2e8ffe851a404da1894cb20b5b9d27e2dd409394';
const B0_EVIDENCE_PATH = 'deploy/postgres/generated/prod-to-target/schema-pre.sql';
const REPOSITORY_ROOT = path.resolve(PRIVILEGES_DIR, '../../..');

const DATABASES = ['bersoncarebot_test', 'bcb_webapp_dev'];
const TEST_ONLY = [
  'app.read_saas_isolation_test_scenario_fixture_counts()',
  'app.set_saas_isolation_test_scenario(text)',
].sort();
const GENUINE_PRE_SESSION_FUNCTIONS = `
auth_login_token_confirm
auth_login_token_create
auth_login_token_mark_session_issued
auth_login_token_read
auth_oauth_find_user
auth_oauth_upsert_binding
auth_rate_limit_check_and_record
email_auth_find_email_otp_lock
email_auth_register_email_otp_lockout
email_auth_reset_email_otp_lockout
get_public_reference_baseline
read_saas_billing_payment_provider_preauth
resolve_patient_acquiring_webhook_organization
is_organization_slug_available
is_smtp_outbound_configured
integrator_event_idempotency_read
integrator_event_idempotency_store
phone_auth_find_latest_challenge_created_at
phone_auth_find_otp_lock
phone_auth_register_otp_lockout
phone_auth_reset_otp_lockout
phone_challenge_store_delete
phone_challenge_store_delete_by_phone
phone_challenge_store_increment_attempts
phone_challenge_store_read
phone_challenge_store_upsert
phone_otp_public_booking_consume_challenge
phone_otp_public_booking_issue_challenge
`.trim().split('\n');

const functionsFor = (database) => Object.entries(declaration.portContext.functions)
  .filter(([, fn]) => !fn.databases || fn.databases.includes(database));

// Владелец шва — это стена: тело SECURITY DEFINER исполняется ЕГО правами, а не правами вызвавшего.
// Счётчик владельцев не двигался, когда функция переезжала с собственного узкого владельца на
// соседнего широкого, — а это ровно расширение шва на чужие таблицы. Сверка имён называет и
// осиротевшую объявленную роль шва, и владельца, которого в кластере никто не объявлял.
const assertDefinerOwnersAreDeclaredSeamRoles = () => {
  const owners = new Set(Object.values(declaration.portContext.functions)
    .filter((fn) => fn.security === 'DEFINER').map((fn) => fn.owner));
  assert.deepEqual(
    [...owners].filter((owner) => !declaration.cluster.roles[owner]).sort(), [],
    'DEFINER owners that the cluster never declares as a role',
  );
  assert.deepEqual(
    Object.keys(declaration.cluster.roles)
      .filter((role) => role.startsWith('app_seam_') && !owners.has(role)).sort(), [],
    'declared app_seam_* seam roles that own no DEFINER function',
  );
  assertNameCensus(
    'definerOwnersOutsideSeamPrefix',
    [...owners].filter((owner) => !owner.startsWith('app_seam_')),
    'DEFINER owners that are not app_seam_* seam roles',
  );
  return owners;
};

test('the current-patient B0-forward roots are exactly the recorded set with exact executable relation-operation surfaces', () => {
  const functions = currentPatientArtifactFunctions(CURRENT_PATIENT_MIGRATIONS);
  assertNameCensus('currentPatientArtifactRoots', functions.map((fn) => fn.name),
    'current-patient roots reconstructed from migrations 0016+0017');
  assert.deepEqual(compareFunctionSurfaces(functions, declaration.portContext.functions), []);
});

test('all latest active B0-forward definers have exact executable relation-operation surfaces', () => {
  const functions = latestArtifactFunctions(B0_FORWARD_MIGRATIONS);
  // Каждое имя здесь — тело SECURITY DEFINER функции, которое живая база получает ТОЛЬКО из
  // пронумерованной миграции. Исчезнувшее имя означает, что тело перестало доезжать до базы;
  // появившееся — новую дверь, которую никто не сверял. Счёт этого не различал: он менялся на
  // единицу и в том, и в другом случае, и правился подгонкой числа.
  assertNameCensus('b0ForwardArtifactRoots', functions.map((fn) => fn.name),
    'latest active B0-forward definer bodies in numbered migrations');
  assert.equal(functions.every((fn) => fn.securityDefiner), true);
  for (const fn of functions) {
    const candidates = Object.entries(declaration.portContext.functions)
      .filter(([signature]) => signature.startsWith(`${fn.name}(`));
    assert.equal(candidates.length, 1, fn.name);
    assert.equal(candidates[0][1].security, 'DEFINER', candidates[0][0]);
  }
  assert.deepEqual(compareFunctionSurfaces(functions, declaration.portContext.functions), []);
});

test('every declared function has the exact source-reconstructed base type and set-returning flag, and no body is undeclared', () => {
  const sources = [{
    source: `${B0_EVIDENCE_COMMIT}:${B0_EVIDENCE_PATH}`,
    text: execFileSync('git', ['show', `${B0_EVIDENCE_COMMIT}:${B0_EVIDENCE_PATH}`], {
      cwd: REPOSITORY_ROOT, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024,
    }),
  }, ...B0_FORWARD_MIGRATIONS.map((file) => ({ source: path.relative(REPOSITORY_ROOT, file), text: fs.readFileSync(file, 'utf8') })), {
    source: 'deploy/postgres/port-context/contract.sql',
    text: fs.readFileSync(path.resolve(REPOSITORY_ROOT, 'deploy/postgres/port-context/contract.sql'), 'utf8'),
  }, {
    source: 'deploy/postgres/test-saas-isolation-telemetry-fixtures.sql',
    text: fs.readFileSync(path.resolve(REPOSITORY_ROOT, 'deploy/postgres/test-saas-isolation-telemetry-fixtures.sql'), 'utf8'),
  }];
  const canonical = latestFunctionReturnShapes(sources);
  const external = {
    'app_ext.digest(text,text)': { returns: 'bytea', returnsSet: false },
    'app_ext.hmac(text,text,text)': { returns: 'bytea', returnsSet: false },
  };
  // Обратное направление к `compareDeclaredFunctionReturnShapes`: тот идёт по ОБЪЯВЛЕННЫМ функциям
  // и называет каждую, которой не нашлось тела в исходниках. Здесь — недостающая половина: тело,
  // восстановленное из исходников, которое не объявлено ничем. Такая функция не получает ни
  // владельца шва, ни закрытого EXECUTE, ни сверки поверхности тела, и увидеть это нечем.
  const declaredNames = new Set(Object.keys(declaration.portContext.functions)
    .map((signature) => signature.slice(0, signature.indexOf('('))));
  assert.deepEqual(
    [...canonical.keys()].filter((name) => !declaredNames.has(name)).sort(),
    [],
    'function bodies reconstructed from the sources that no declaration claims',
  );
  assert.deepEqual(compareDeclaredFunctionReturnShapes(declaration.portContext.functions, canonical, external), []);

  const practice = structuredClone(declaration.portContext.functions);
  practice['app.record_current_patient_practice_completion(uuid,text,integer)'].returns = 'record';
  assert.deepEqual(compareDeclaredFunctionReturnShapes(practice, canonical, external), [
    'app.record_current_patient_practice_completion(uuid,text,integer): actual=uuid/set declared=record/set',
  ]);
  const rating = structuredClone(declaration.portContext.functions);
  rating['app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)'].returns = 'record';
  assert.deepEqual(compareDeclaredFunctionReturnShapes(rating, canonical, external), [
    'app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid): actual=boolean/set declared=record/set',
  ]);
  const tableToScalar = structuredClone(declaration.portContext.functions);
  tableToScalar['app.accept_org_invite(text,uuid,text)'].returnsSet = false;
  assert.deepEqual(compareDeclaredFunctionReturnShapes(tableToScalar, canonical, external), [
    'app.accept_org_invite(text,uuid,text): actual=record/set declared=record/scalar',
  ]);
  const scalarToSet = structuredClone(declaration.portContext.functions);
  scalarToSet['app.abort_patient_program_submission_media(uuid)'].returnsSet = true;
  assert.deepEqual(compareDeclaredFunctionReturnShapes(scalarToSet, canonical, external), [
    'app.abort_patient_program_submission_media(uuid): actual=boolean/scalar declared=boolean/set',
  ]);
});

test('return-shape parser covers TABLE, SETOF, OUT, dollar tags, defaults and comments', () => {
  assert.deepEqual(parseReturnShape('', ' RETURNS TABLE(id uuid) LANGUAGE sql '),
    { returns: 'uuid', returnsSet: true, form: 'TABLE' });
  assert.deepEqual(parseReturnShape('', ' RETURNS TABLE(id uuid, label text) LANGUAGE sql '),
    { returns: 'record', returnsSet: true, form: 'TABLE' });
  assert.deepEqual(parseReturnShape('', ' RETURNS SETOF public.saas_tariffs LANGUAGE sql '),
    { returns: 'saas_tariffs', returnsSet: true, form: 'SETOF' });
  assert.deepEqual(parseReturnShape('IN value integer, OUT id uuid', ' LANGUAGE sql '),
    { returns: 'uuid', returnsSet: false, form: 'OUT' });
  assert.deepEqual(parseReturnShape('OUT id uuid, OUT label text', ' LANGUAGE sql '),
    { returns: 'record', returnsSet: false, form: 'OUT' });
  assert.deepEqual(parseReturnShape('', ' RETURNS numeric(12, 4) LANGUAGE sql '),
    { returns: 'numeric', returnsSet: false, form: 'SCALAR' });
  assert.deepEqual(parseReturnShape('', ' RETURNS TABLE(label character varying(63)) LANGUAGE sql '),
    { returns: 'character varying', returnsSet: true, form: 'TABLE' });
  const rows = extractFunctionReturnShapes('probe.sql', `
    -- CREATE FUNCTION app.ignored() RETURNS SETOF uuid AS $$ SELECT NULL::uuid $$;
    /* CREATE FUNCTION app.also_ignored() RETURNS TABLE(id uuid) AS $$ SELECT NULL::uuid $$; */
    CREATE FUNCTION app.probe(value text DEFAULT ') RETURNS SETOF boolean')
    RETURNS TABLE(id uuid) LANGUAGE sql AS $shape$ SELECT NULL::uuid $shape$;
  `);
  assert.deepEqual(rows, [{ name: 'app.probe', source: 'probe.sql', returns: 'uuid', returnsSet: true, form: 'TABLE' }]);
});

test('function parser removes real comments without truncating comment markers inside literals', () => {
  const [fn] = parseExecutableFunctions(`
    CREATE FUNCTION app.fixture_comment_parser() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER AS $body$
    BEGIN
      PERFORM 'literal -- is data';
      PERFORM 'literal /* is data */';
      INSERT INTO public.fixture_live (value) VALUES ('--');
      -- SELECT * FROM public.fixture_line_comment;
      /* SELECT * FROM public.fixture_block_comment; */
    END
    $body$;
  `);
  assert.equal(fn.securityDefiner, true);
  assert.deepEqual([...extractPublicRelationOperations(fn.body)], [
    ['public.fixture_live', ['INSERT']],
  ]);
});

test('aggregated runtime surface findings separate invoker triggers from exact definer corrections', () => {
  // Both organization-slug guards left this list on 2026-08-18: they are DEFERRABLE INITIALLY
  // DEFERRED constraint triggers, so as SECURITY INVOKER they ran at COMMIT under the bare login
  // role and could not reach schema public at all — see the dedicated test below.
  const invokerTriggers = [
    'app.enforce_lfk_child_owner()',
    'app.guard_clinic_directory_current_slug()',
    'app.guard_org_brand_revision()',
    'public.sync_registered_app_runtime_setting()',
  ];
  for (const signature of invokerTriggers) {
    const fn = declaration.portContext.functions[signature];
    assert.equal(fn.security, 'INVOKER', signature);
    assert.equal(fn.invocation, 'trigger', signature);
    assert.equal(fn.relationSurfaces, undefined, signature);
  }

  const surface = (signature, relation) => declaration.portContext.functions[signature]
    .relationSurfaces.find((candidate) => candidate.relation === relation);
  assert.deepEqual(surface('app.create_current_patient_booking_appointments(text)', 'public.be_appointments').operations,
    ['SELECT', 'INSERT']);
  assert.deepEqual(surface('app.update_current_patient_fio(text,text,text)', 'public.platform_users').operationColumns,
    { SELECT: ['id', 'role', 'merged_into_id'] });
  // user_identity — поверхность upsert (INSERT+UPDATE), поэтому SELECT здесь НЕ сужается:
  // `INSERT … ON CONFLICT DO UPDATE` под FORCE RLS читает конфликтующую строку целиком. Сужение,
  // стоявшее тут до 18.08, ломало смену ФИО пациента с «permission denied for table».
  assert.equal(surface('app.update_current_patient_fio(text,text,text)', 'public.user_identity').operationColumns,
    undefined);
  assert.deepEqual(surface('app.patient_cancel_pending_reminder_occurrences(text)', 'public.reminder_rules'), {
    relation: 'public.reminder_rules',
    columns: ['integrator_rule_id', 'organization_id', 'platform_user_id'],
    operations: ['SELECT'],
    evidence: 'pg16-function-body-lexical-upper-bound',
  });
  assert.deepEqual(surface('app.read_current_patient_organization_entitlements()', 'public.saas_paid_period_policy'), {
    relation: 'public.saas_paid_period_policy',
    columns: ['key', 'post_paid_period_behavior', 'post_paid_period_tariff_id', 'is_active'],
    operations: ['SELECT'],
    evidence: 'pg16-function-body-lexical-upper-bound',
  });
  assert.deepEqual(surface('app.enqueue_media_transcode_job_for_staff(uuid)', 'public.media_files'), {
    relation: 'public.media_files', columns: ['id'], operations: ['SELECT'],
    evidence: 'pg16-function-body-lexical-upper-bound',
  });
  assert.deepEqual(declaration.portContext.functions['app.enqueue_media_transcode_job_for_staff(uuid)'].delegatesTo,
    ['app.enqueue_media_transcode_job_core(uuid)']);
  const serviceEnqueue = declaration.portContext.functions['app.enqueue_media_transcode_job_for_service(uuid)'];
  assert.deepEqual(serviceEnqueue.relationSurfaces, []);
  assert.deepEqual(serviceEnqueue.delegatesTo, ['app.enqueue_media_transcode_job_core(uuid)']);
});

// Поверхность с INSERT+UPDATE на одной таблице — это `INSERT … ON CONFLICT DO UPDATE`. Под FORCE RLS
// PostgreSQL читает конфликтующую строку, чтобы проверить USING-квалы UPDATE-политики, и требует
// SELECT по ВСЕМ колонкам поверхности. Урезанный SELECT падает как «permission denied for TABLE»
// (не «for column»), поэтому лексический разбор тела функции этот случай не видит: колонка на чтение
// в тексте функции не упомянута. Замер 18.08 на bersoncarebot_test: у app_seam_patient_self_actions_owner
// был SELECT на 3 из 5 колонок user_notification_topic_channels — тот же INSERT падал, а у
// app_seam_reminder_patient_owner с SELECT на всех 5 проходил.
test('upsert surfaces never narrow SELECT — ON CONFLICT DO UPDATE reads the conflicting row', () => {
  const offenders = [];
  for (const [signature, fn] of Object.entries(declaration.portContext.functions)) {
    for (const surface of fn.relationSurfaces ?? []) {
      const operations = surface.operations ?? [];
      if (!operations.includes('INSERT') || !operations.includes('UPDATE')) continue;
      if (!operations.includes('SELECT')) offenders.push(`${signature} → ${surface.relation}: no SELECT`);
      if (surface.operationColumns?.SELECT) {
        offenders.push(`${signature} → ${surface.relation}: SELECT narrowed to `
          + surface.operationColumns.SELECT.join(','));
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('current-patient surface gate catches missing operation, absent relation, and overbroad SELECT together', () => {
  const functions = [{
    name: 'app.fixture_current_patient_root',
    body: `
      insert into public.fixture_target (id) values (1) on conflict (id) do nothing;
      insert into public.fixture_write (id) values (1);
      insert into public.fixture_returning (id) values (1) returning *;
      delete from public.fixture_history where id = 1;
      select x.id from public.fixture_read x, public.fixture_comma c
      join public.fixture_joined j on j.id = x.id;
      select q.id from integrator.fixture_queue q;
      perform 1 from public.fixture_perform p where p.id = 1;
      return query select r.id from public.fixture_return_query r;
      with cte as (select c.id from public.fixture_cte c) select id from cte;
      update public.fixture_update_target t set value = s.value
        from public.fixture_update_source s where t.id = s.id;
      delete from public.fixture_delete_target t
        using public.fixture_delete_source s where t.id = s.id;
      if p_id is distinct from public.fixture_comparison_only() then return; end if;
    `,
  }];
  const declaredFunctions = {
    'app.fixture_current_patient_root()': {
      relationSurfaces: [
        { relation: 'public.fixture_target', operations: ['INSERT'] },
        { relation: 'public.fixture_history', operations: ['SELECT', 'DELETE'] },
        { relation: 'public.fixture_read', operations: ['SELECT'] },
        { relation: 'public.fixture_returning', operations: ['INSERT'] },
        { relation: 'public.fixture_write', operations: ['SELECT', 'INSERT'] },
        { relation: 'public.fixture_update_target', operations: ['SELECT', 'UPDATE'] },
        { relation: 'public.fixture_delete_target', operations: ['SELECT', 'DELETE'] },
      ],
    },
  };
  assert.deepEqual(compareFunctionSurfaces(functions, declaredFunctions), [
    'app.fixture_current_patient_root() -> integrator.fixture_queue: executable relation surface is absent; actual=SELECT',
    'app.fixture_current_patient_root() -> public.fixture_comma: executable relation surface is absent; actual=SELECT',
    'app.fixture_current_patient_root() -> public.fixture_cte: executable relation surface is absent; actual=SELECT',
    'app.fixture_current_patient_root() -> public.fixture_delete_source: executable relation surface is absent; actual=SELECT',
    'app.fixture_current_patient_root() -> public.fixture_joined: executable relation surface is absent; actual=SELECT',
    'app.fixture_current_patient_root() -> public.fixture_perform: executable relation surface is absent; actual=SELECT',
    'app.fixture_current_patient_root() -> public.fixture_return_query: executable relation surface is absent; actual=SELECT',
    'app.fixture_current_patient_root() -> public.fixture_returning: actual=INSERT,SELECT declared=INSERT',
    'app.fixture_current_patient_root() -> public.fixture_target: actual=INSERT,SELECT declared=INSERT',
    'app.fixture_current_patient_root() -> public.fixture_update_source: executable relation surface is absent; actual=SELECT',
    'app.fixture_current_patient_root() -> public.fixture_write: actual=INSERT declared=INSERT,SELECT',
  ]);
  assert.deepEqual(extractPublicRelationOperations(functions[0].body).get('public.fixture_history'),
    ['SELECT', 'DELETE']);
});

test('legacy census is restored without obsolete context and overlaid by the active B0-forward roots', () => {
  assert.equal(LEGACY_DEFINER_CENSUS_COUNT, 244);
  assert.deepEqual(BUSINESS_SEAM_STATS, {
    functions: 232,
    owners: 40,
    test: 232,
    dev: 230,
    triggers: 3,
    relationEdges: 486,
  });
  // Замороженная легаси-перепись и её данные обязаны сходиться друг с другом; число берётся из
  // самой переписи, а не из второй копии в тесте. Ключи объекта не повторяются по построению.
  assert.equal(Object.keys(BUSINESS_SEAM_FUNCTIONS).length, BUSINESS_SEAM_STATS.functions);
  for (const signature of OBSOLETE_CONTEXT_SIGNATURES) {
    assert.equal(declaration.portContext.functions[signature], undefined, signature);
  }
  for (const signature of [
    'app.install_port_context(uuid,app.port_context_claims)',
    'app.clear_port_context()',
    'app.begin_port_context(uuid,app.port_context_claims)',
    'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)',
    'app.require_attested_target_role(name,name[])',
    'app.require_platform_principal()',
    'app.current_actor_user_id()',
    'app_ext.resolve_variant_a_identity(uuid)',
  ]) assert.ok(declaration.portContext.functions[signature], signature);

  const testFunctions = functionsFor('bersoncarebot_test');
  const devFunctions = functionsFor('bcb_webapp_dev');
  // Счётчики DEFINER и общего числа заменены двумя сверками имён.
  //
  // Что ловит первая: функция шва тихо стала SECURITY INVOKER. Тогда её тело исполняется правами
  // вызывающего логина, а не владельца шва, и каждое обращение к закрытой таблице умирает 42501 —
  // ровно живой дефект 18.08 (L-7), описанный ниже в этом файле. Счётчик «396» показывал такую
  // подмену числом 395 и не называл ни функцию, ни базу; список называет её первой строкой diff-а.
  //
  // Что ловит вторая: функция объявлена только для одной базы. Разница между TEST и DEV — это
  // ровно `TEST_ONLY` и ничто больше; всё прочее означает, что DEV не получит двери, которую
  // получит TEST, или наоборот.
  assertNameCensus(
    'declaredNonDefinerFunctions',
    Object.entries(declaration.portContext.functions).filter(([, fn]) => fn.security !== 'DEFINER')
      .map(([signature]) => signature),
    'declared functions that are NOT SECURITY DEFINER',
  );
  assert.deepEqual(
    testFunctions.map(([signature]) => signature).filter((signature) => !TEST_ONLY.includes(signature)).sort(),
    devFunctions.map(([signature]) => signature).sort(),
    'TEST and DEV must declare the same functions apart from the exact TEST_ONLY fixtures',
  );
  assertDefinerOwnersAreDeclaredSeamRoles();
  assert.deepEqual(Object.entries(BUSINESS_SEAM_FUNCTIONS)
    .filter(([, fn]) => fn.databases.length === 1).map(([signature]) => signature).sort(), TEST_ONLY);
  const proconfigExceptions = Object.entries(BUSINESS_SEAM_FUNCTIONS)
    .filter(([, fn]) => fn.proconfig[0] !== 'search_path=pg_catalog')
    .map(([signature, fn]) => [signature, fn.proconfig[0]]);
  // Счёт функций с каноническим search_path удалён: он ровно дополнение к списку исключений ниже,
  // а тот перечислен ПОИМЁННО вместе со своим search_path — расхождение называет он.
  assert.deepEqual(proconfigExceptions, [
    ['app.accept_org_invite(text,uuid,text)', 'search_path=pg_catalog, app, public, pg_temp'],
    ['app.close_active_user_phone_history(uuid)', 'search_path=app, public, pg_catalog'],
    ['app.list_web_push_reminder_organization_ids(timestamp with time zone)', 'search_path=pg_catalog, public'],
    ['app.read_outbound_provider_incident_health()', 'search_path=pg_catalog, public'],
    ['app.resolve_saas_billing_invoice_for_webhook(text,text)', 'search_path=pg_catalog, app, public, pg_temp'],
    ['app.resolve_saas_billing_refund_for_webhook(text,text)', 'search_path=pg_catalog, app, public, pg_temp'],
  ]);
});

test('every application seam owner and function caller has the closed role shape', () => {
  const owners = new Set(Object.values(declaration.portContext.functions)
    .filter((fn) => fn.security === 'DEFINER' && fn.owner !== 'postgres').map((fn) => fn.owner));
  assertDefinerOwnersAreDeclaredSeamRoles();
  const loginNames = new Set(Object.values(declaration.envMapping).flatMap((records) => Object.keys(records)));
  for (const owner of owners) {
    const role = declaration.cluster.roles[owner];
    assert.ok(role, owner);
    assert.equal(role.login, false, owner);
    assert.equal(role.superuser, false, owner);
    assert.equal(role.bypassrls, false, owner);
    assert.equal(role.inherit, false, owner);
    assert.deepEqual(role.members, [], owner);
  }
  for (const [signature, fn] of Object.entries(BUSINESS_SEAM_FUNCTIONS)) {
    assert.equal(fn.execute.some((role) => loginNames.has(role) || role === 'PUBLIC'), false, signature);
    if (fn.invocation === 'trigger' || fn.invocation === 'internal') {
      assert.deepEqual(fn.execute, [], signature);
    }
    else assert.ok(fn.execute.length > 0, signature);
    assert.ok(fn.relationSurfaces.length > 0 || fn.delegatesTo.length > 0, signature);
    for (const surface of fn.relationSurfaces) {
      assert.ok(surface.columns.length > 0, `${signature}:${surface.relation}`);
      assert.ok(surface.operations.length > 0, `${signature}:${surface.relation}`);
    }
  }
});

test('every genuine pre-session root has app_pre_session as its only caller', () => {
  for (const functionName of GENUINE_PRE_SESSION_FUNCTIONS) {
    const matches = Object.entries(BUSINESS_SEAM_FUNCTIONS)
      .filter(([signature]) => signature.startsWith(`app.${functionName}(`));
    assert.equal(matches.length, 1, functionName);
    assert.deepEqual(matches[0][1].execute, ['app_pre_session'], matches[0][0]);
  }
});

test('dedicated bot relation carries its runtime resolver and non-runtime trigger as two seams', () => {
  for (const database of DATABASES) {
    const access = declaration.databases[database].tables['public.clinic_dedicated_bot_bindings'].access;
    assert.equal(access.kind, 'named-seams');
    // Третий шов на этой таблице — третья дверь к привязке выделенного бота. Счёт «2» назвал бы
    // только число; список называет саму дверь.
    assert.deepEqual(access.seams.map((seam) => seam.regprocedure), [
      'app.resolve_clinic_dedicated_bot_organization(text,text)',
      'app.sync_clinic_dedicated_bot_binding()',
    ], database);
    assert.deepEqual(access.seams[0], {
      regprocedure: 'app.resolve_clinic_dedicated_bot_organization(text,text)',
      owner: 'app_seam_dedicated_bot_owner',
      callers: ['app_integrator_resolver'],
      invocation: 'runtime',
      columns: ['channel', 'organization_id', 'credential_fingerprint', 'is_active'],
      operations: ['SELECT'],
      purpose: 'evidence/25+30 narrow seam owned by app_seam_dedicated_bot_owner: public.clinic_dedicated_bot_bindings',
    });
    assert.equal(access.seams[1].regprocedure, 'app.sync_clinic_dedicated_bot_binding()');
    assert.equal(access.seams[1].invocation, 'trigger');
    assert.equal(access.seams[1].caller, undefined);
  }
  const mutated = structuredClone(declaration);
  mutated.databases.bersoncarebot_test.tables['public.clinic_dedicated_bot_bindings'].access.seams.push(
    structuredClone(mutated.databases.bersoncarebot_test.tables['public.clinic_dedicated_bot_bindings'].access.seams[0]),
  );
  assert.ok(collectGaps(mutated, 'bersoncarebot_test').some((gap) => gap.reason.includes('duplicate seam')));
});

test('complete relation APIs leave no generation gap', () => {
  for (const database of DATABASES) {
    assert.deepEqual(collectGaps(declaration, database), [], database);
  }
  const missingShape = structuredClone(declaration);
  delete missingShape.portContext.functions['app.accept_org_invite(text,uuid,text)'].returnsSet;
  for (const database of DATABASES) {
    assert.ok(collectGaps(missingShape, database).some((gap) =>
      gap.site === 'portContext.functions.app.accept_org_invite(text,uuid,text)'
      && gap.reason === 'function lacks exact set-returning flag'), database);
  }
});

// Live defect 2026-08-18 (L-7): both organization-slug guards are CONSTRAINT TRIGGERs declared
// DEFERRABLE INITIALLY DEFERRED, so their bodies run at COMMIT — after the DB port has already
// executed RESET ROLE. Declared SECURITY INVOKER they therefore executed as the bare login role,
// which holds no USAGE on schema public, and every attempt by a clinic owner to change the public
// address of the clinic died with SQLSTATE 42501 and a 503 the screen could not explain.
test('a function that declares a relation surface can only reach it as SECURITY DEFINER', () => {
  const functions = declaration.portContext.functions;
  for (const signature of [
    'app.assert_organization_slug_rename_complete()',
    'app.assert_organization_slug_alias_complete()',
  ]) {
    const guard = functions[signature];
    assert.equal(guard.security, 'DEFINER', signature);
    assert.equal(guard.owner, 'app_seam_public_slug_owner', signature);
    assert.ok(guard.relationSurfaces.length > 0, signature);
    for (const surface of guard.relationSurfaces) {
      assert.deepEqual(surface.operations, ['SELECT'], `${signature} ${surface.relation}`);
    }
  }
  const renameSurfaces = Object.fromEntries(
    functions['app.assert_organization_slug_rename_complete()'].relationSurfaces
      .map((surface) => [surface.relation, [...surface.columns].sort()]),
  );
  assert.deepEqual(renameSurfaces, {
    'public.organization_slug_claims': ['kind', 'organization_id', 'slug'],
    'public.clinic_public_directory_entries': ['organization_id', 'slug'],
    'public.organization_slug_rename_events': ['next_slug', 'organization_id', 'previous_slug'],
  });

  const invoker = structuredClone(declaration);
  invoker.portContext.functions['app.assert_organization_slug_rename_complete()'].security = 'INVOKER';
  for (const database of DATABASES) {
    assert.ok(collectGaps(invoker, database).some((gap) =>
      gap.site === 'portContext.functions.app.assert_organization_slug_rename_complete().security'
      && gap.reason === 'a declared relation surface is reachable only through SECURITY DEFINER'), database);
  }
});

test('special body relation contracts are an exact closed set and arbitrary bypasses fail', () => {
  const expected = {
    'app_control.enforce_relation_birth_wall()': 'relation-birth-wall',
    'app.install_port_context(uuid,app.port_context_claims)': 'port-context',
    'app.clear_port_context()': 'port-context',
    'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)': 'port-context',
    'app.current_org_id()': 'port-context',
    'app.current_actor_user_id()': 'port-context',
    'app.current_patient_user_id()': 'port-context',
    'app.current_integrator_user_id()': 'port-context',
  };
  assert.deepEqual(Object.fromEntries(Object.entries(declaration.portContext.functions)
    .filter(([, fn]) => fn.bodyRelationSurfaceContract)
    .map(([signature, fn]) => [signature, fn.bodyRelationSurfaceContract])), expected);

  const mutated = structuredClone(declaration);
  mutated.portContext.functions['app.require_platform_principal()'].bodyRelationSurfaceContract = 'port-context';
  assert.ok(collectGaps(mutated, 'bcb_webapp_dev').some((gap) =>
    gap.site === 'portContext.functions.app.require_platform_principal().bodyRelationSurfaceContract'
    && gap.reason.includes('not in the exact special body relation contract allowlist')));
});

test('full-body overdeclaration corrections preserve only executable operations', () => {
  const functions = declaration.portContext.functions;
  const wrapperDelegates = {
    'app.email_auth_find_email_owner_conflict(uuid,text)':
      'app.find_platform_user_ids_by_any_confirmed_email(text)',
    'app.password_login_acquire(text,text,uuid,text)':
      'app.password_login_acquire_impl(text,text,uuid,text)',
    'app.password_login_complete(uuid,boolean)':
      'app.password_login_complete_impl(uuid,boolean)',
    'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)':
      'app.password_login_issue_altcha_challenge_impl(text,uuid,text,timestamp with time zone)',
    'app.password_login_read_altcha_secret()': 'app.password_login_read_altcha_secret_impl()',
  };
  for (const [signature, delegated] of Object.entries(wrapperDelegates)) {
    assert.deepEqual(functions[signature].relationSurfaces, [], signature);
    assert.deepEqual(functions[signature].delegatesTo, [delegated], signature);
  }

  const provisionOrganization = functions['app.provision_specialist_owner(uuid)'].relationSurfaces
    .find((surface) => surface.relation === 'public.be_organizations');
  assert.deepEqual(provisionOrganization.operations, ['INSERT']);
  const archive = functions['app.archive_operator_health_failures(text,integer,uuid)'];
  for (const relation of [
    'public.outgoing_delivery_queue',
    'public.integrator_push_outbox',
    'integrator.projection_outbox',
  ]) {
    assert.deepEqual(archive.relationSurfaces.find((surface) => surface.relation === relation).operations,
      ['SELECT', 'DELETE'], relation);
  }
  assert.deepEqual(functions['app.start_provisioned_organization_trial()'].relationSurfaces
    .find((surface) => surface.relation === 'public.saas_organization_trials').operations,
  ['SELECT', 'INSERT']);
});

test('targeted diary snapshot conflict declares only its two-key SELECT surface', () => {
  const signature = 'app.capture_current_patient_diary_day_snapshot(text,text,integer,integer,boolean,uuid,text,text)';
  const surface = declaration.portContext.functions[signature].relationSurfaces.find(
    (candidate) => candidate.relation === 'public.patient_diary_day_snapshots',
  );
  assert.ok(surface, signature);
  assert.deepEqual(surface.operations, ['SELECT', 'INSERT']);
  assert.deepEqual(surface.operationColumns, {
    SELECT: ['platform_user_id', 'local_date'],
  });

  for (const database of DATABASES) {
    const generated = generateFunctionCensusSql(declaration, database);
    assert.ok(generated.includes(
      `('${signature}', 'public.patient_diary_day_snapshots', `
      + "ARRAY['organization_id', 'platform_user_id', 'local_date', 'iana', 'warmup_slot_limit', "
      + "'warmup_done_count', 'warmup_all_done', 'plan_instance_id', 'plan_item_ids', 'plan_done_mask']::text[], "
      + "ARRAY['SELECT', 'INSERT']::text[])",
    ), database);
  }
});

test('per-DB function SQL is deterministic and contains the bilateral metadata check', () => {
  for (const database of DATABASES) {
    const first = generateFunctionCensusSql(declaration, database);
    // Эта сверка ОСТАЁТСЯ числом сознательно, но число больше не вписано руками: она ловит
    // рассинхрон СГЕНЕРИРОВАННОГО артефакта с декларацией — SQL объявляет «я проверил N тел», и
    // если генератор выпустил другое количество строк-контрактов, деплой сверяет не то, что думает.
    // Оракул — сама декларация, поэтому легальная новая функция двигает обе стороны разом и правки
    // теста не требует; расхождение остаётся ровно там, где оно и есть.
    const definerSignatures = functionsFor(database)
      .filter(([, fn]) => fn.security === 'DEFINER').map(([signature]) => signature);
    const surfaceVerifier = first.slice(
      first.indexOf('-- Function-body relation-operation verifier:'),
      first.indexOf('ALTER FUNCTION ', first.indexOf('-- Function-body relation-operation verifier:')),
    );
    assert.equal(generateFunctionCensusSql(declaration, database), first);
    assert.match(first, /function census catalog mismatch/);
    assert.match(first, /p\.proretset<>e\.returns_set/);
    assert.match(first, /CREATE TEMP TABLE bcb_function_catalog_gaps/);
    assert.match(first, /string_agg\(message,E'\\n' ORDER BY message\)/);
    assert.match(first, /n\.nspname IN \('public', 'app', 'integrator', 'app_ext', 'app_control', 'drizzle'\)/);
    assert.match(first, /am\.member = 'app_seam_dedicated_bot_owner'::regrole/);
    assert.match(first, /am\.roleid = 'app_seam_dedicated_bot_owner'::regrole/);
    assert.match(first, /REVOKE ALL ON FUNCTION app\.resolve_clinic_dedicated_bot_organization\(text,text\) FROM PUBLIC/);
    // Сам ПРЕДМЕТ сверки — поимённо: артефакт перечисляет тела, которые деплой пойдёт проверять на
    // живой базе, и этот список обязан быть ровно объявленным набором DEFINER-функций. Число
    // `functions=N` совпадает и тогда, когда одно тело подменено другим, — тогда деплой сверяет не
    // то, что декларация думает, и молчит об этом.
    const verifiedSignatures = [...surfaceVerifier
      .slice(surfaceVerifier.indexOf('INSERT INTO bcb_function_surface_functions(signature) VALUES'))
      .matchAll(/^ {2}\('([^']+)'\),?$/gmu)].map(([, signature]) => signature);
    assert.deepEqual([...verifiedSignatures].sort(), [...definerSignatures].sort(),
      `${database}: the generated body-surface verifier checks a different set of function bodies `
      + 'than the declaration declares SECURITY DEFINER');
    const verifiedFunctions = /BCB_FUNCTION_BODY_SURFACES_VERIFIED functions=(\d+)/u.exec(surfaceVerifier)?.[1];
    assert.equal(Number(verifiedFunctions), verifiedSignatures.length,
      `${database}: generated verifier declares functions=${verifiedFunctions} but seeds `
      + `${verifiedSignatures.length} function bodies into its own check`);
    assert.ok(surfaceVerifier.includes('special_contracts=8'));
    assert.match(surfaceVerifier, /CREATE TEMP TABLE bcb_function_surface_special_contracts/);
    assert.ok(surfaceVerifier.includes("('app_control.enforce_relation_birth_wall()', 'relation-birth-wall')"));
    assert.ok(surfaceVerifier.includes("('app.install_port_context(uuid,app.port_context_claims)', 'port-context')"));
    assert.ok(surfaceVerifier.includes("('public.audit_app_runtime_settings_change()')"));
    assert.ok(surfaceVerifier.includes("('app.password_login_acquire_impl(text,text,uuid,text)')"));
    assert.ok(surfaceVerifier.includes("('app.assert_organization_slug_alias_complete()')"));
    assert.equal(surfaceVerifier.includes("('public.sync_registered_app_runtime_setting()')"), false);
    assert.ok(surfaceVerifier.includes("('app.enqueue_media_transcode_job_for_staff(uuid)', 'public.media_files'"));
    assert.ok(surfaceVerifier.includes(
      "('app.read_current_patient_organization_entitlements()', 'public.saas_paid_period_policy'",
    ));
    assert.match(surfaceVerifier, /n\.nspname IN \('public', 'app', 'integrator', 'app_ext', 'app_control', 'drizzle'\)/);
    assert.match(first, /ON CONFLICT DO UPDATE requires undeclared UPDATE/);
    assert.match(first, /ON CONFLICT DO UPDATE requires undeclared SELECT for conflict\/update row/);
    assert.match(first, /targeted ON CONFLICT DO NOTHING requires undeclared SELECT for conflict row/);
    assert.match(first, /targetless ON CONFLICT DO NOTHING was classified as requiring SELECT/);
    assert.match(first, /indexed ON CONFLICT DO NOTHING was not classified as requiring SELECT/);
    assert.match(first, /constrained ON CONFLICT DO NOTHING was not classified as requiring SELECT/);
    assert.match(first, /UPDATE predicate\/RETURNING requires undeclared SELECT/);
    assert.match(first, /declared SELECT has no executable relation operation/);
    assert.match(first, /declared INSERT has no executable relation operation/);
    assert.match(first, /declared UPDATE has no executable relation operation/);
    assert.match(first, /declared DELETE has no executable relation operation/);
    assert.match(first, /CREATE TEMP TABLE bcb_function_surface_gaps/);
    assert.match(first, /function body relation surface absent/);
    assert.match(first, /string_agg\(message, E'\\n' ORDER BY message\)/);
    assert.match(first, /RAISE EXCEPTION 'function body surface gaps/);
    assert.doesNotMatch(first, /THEN RAISE EXCEPTION 'function body requires undeclared/);
    assert.match(first, /app\.record_operator_outbound_probe_run\(text,timestamp with time zone,text,jsonb\)/);
    assert.doesNotMatch(first, /install_signed_context|release_principal_context|reset_principal_context/);
    for (const signature of TEST_ONLY) {
      if (database === 'bersoncarebot_test') assert.ok(first.includes(`ALTER FUNCTION ${signature} OWNER TO`), signature);
      else assert.equal(first.includes(`ALTER FUNCTION ${signature} OWNER TO`), false, signature);
    }
  }
});

test('a TEST-only return-shape drift is rendered only into the TEST catalog universe', () => {
  const signature = 'app.read_saas_isolation_test_scenario_fixture_counts()';
  const mutated = structuredClone(declaration);
  mutated.portContext.functions[signature].returnsSet = false;
  const testSql = generateFunctionCensusSql(mutated, 'bersoncarebot_test');
  const devSql = generateFunctionCensusSql(mutated, 'bcb_webapp_dev');
  assert.ok(testSql.includes(`('${signature}', 'saas_telemetry_owner'::name, 'record', false`));
  assert.equal(devSql.includes(signature), false);
});
