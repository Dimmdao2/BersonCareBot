/**
 * Живое доказательство платформенного чтения семьи ШАБЛОНОВ КОМПЛЕКСОВ на названной базе DEV.
 *
 * Зачем этот файл появился 12.09.2026: SQL в `pgLfkTemplates.ts` (`:609`, `:695`) строил
 * платформенную ветку с S0а, а политики платформенного чтения на `lfk_complex_templates` и
 * `lfk_complex_template_exercises` не было — у этих двух отношений специалисту отвечала только
 * `rev10_saas_org_dormant_p0_8_*` («своя организация»). Итог: платформенный шаблон комплекса не
 * отдавался RLS ни странице, ни API даже с включённым тарифом; код ветку строил, база строку не
 * давала. Список S0а называл ровно семью `lfk_exercise*`, поэтому дыра между кодом и правами не
 * ловилась ни одной галочкой плана. Найдено независимым аудитом (вопрос §7 п.10а плана).
 *
 * Названные молчаливые отказы, которые сторожит этот файл:
 * - специалист теряет свои шаблоны ИЛИ платформенный слой шаблонов;
 * - специалист видит шаблон чужой клиники;
 * - специалист создаёт, меняет или удаляет платформенный шаблон либо его элемент;
 * - строка с `owner_kind='platform'` и НЕПУСТОЙ организацией становится платформенно видимой;
 * - обычная организационная запись врача ломается вместе с расширением чтения.
 *
 * Oracle — план владельца, а не `declaration.ts`. Пока reconcile на DEV заблокирован чужим дрейфом,
 * две объявленные SELECT-политики создаются по точным именам ВНУТРИ каждой транзакции и откатываются
 * вместе с фикстурами. `S0_COMPLEX_POLICY_FAULT` — инъекция ТОЛЬКО для аудита; в обычном прогоне
 * переменная не ставится.
 *
 * ДВА РАЗНЫХ ORACLE, и это не одно и то же (замечено независимым аудитом 12.09, здесь исправлено).
 * Самоустановка проверяет ФОРМУ предиката: пускает ли такая политика ровно то, что должна. Она НЕ может
 * заметить, что на живой базе политик вообще нет, — аудитор снёс на DEV обе (страница показала 0
 * платформенных комплексов) и отдельно дочернюю (карточка открылась с ПУСТЫМ составом), а файл остался
 * 7/7 зелёным: тест сравнивал прогон сам с собой. Поэтому ниже добавлен отдельный случай
 * «объявленное действительно стоит на базе» — общий для всех таких доказательств
 * `declaredPolicyConformance.mjs` (там же, почему сверка идёт через пробную политику, а не сравнением
 * текстов). Этот случай намеренно НЕ реагирует на `S0_COMPLEX_POLICY_FAULT` —
 * инъекции портят предикат внутри транзакции, а он смотрит на развёрнутое состояние базы.
 *
 * Запуск:
 *   RUN_PLATFORM_COMPLEX_TEMPLATES_READ_DB=1 node --test \
 *     deploy/postgres/privileges/platform-complex-templates-read.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';

import { assertDeclaredPoliciesDeployed } from './declaredPolicyConformance.mjs';

const ENABLED = process.env.RUN_PLATFORM_COMPLEX_TEMPLATES_READ_DB === '1';
const DATABASE = process.env.PLATFORM_COMPLEX_TEMPLATES_READ_PROOF_DB ?? 'bcb_webapp_dev';
const FAULT = process.env.S0_COMPLEX_POLICY_FAULT ?? 'none';
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ALLOWED_FAULTS = new Set(['none', 'using_true', 'for_all', 'omit_org_null', 'omit_current_user']);

if (DATABASE !== 'bcb_webapp_dev') {
  throw new Error(`платформенное доказательство отказывается от базы '${DATABASE}' — только DEV`);
}
if (!ALLOWED_FAULTS.has(FAULT)) throw new Error(`неизвестная инъекция '${FAULT}'`);

function psql(sql, { expectFailure = false } = {}) {
  const result = spawnSync(
    'sudo',
    [
      '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-f', '-',
    ],
    {
      input: `\\set VERBOSITY verbose\n${sql}\n`,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30_000,
    },
  );
  if (result.error) throw result.error;
  const outcome = {
    failed: result.status !== 0,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
  };
  if (expectFailure !== null && outcome.failed !== expectFailure) {
    throw new Error(`неожиданный исход psql (${result.status}):\n${outcome.stderr}\n${outcome.stdout}`);
  }
  return outcome;
}

function rows(output) {
  return output.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => line.split('|'));
}

function markers(output) {
  return new Map(rows(output)
    .filter(([label]) => label.startsWith('PROOF_'))
    .map(([label, ...values]) => [label, values.join('|')]));
}

function sqlState(outcome) {
  return /SQL state:\s*([0-9A-Z]{5})/u.exec(outcome.stderr)?.[1]
    ?? /ERROR:\s*([0-9A-Z]{5}):/u.exec(outcome.stderr)?.[1]
    ?? null;
}

function checkedIdentifier(value, label) {
  assert.match(value, IDENTIFIER, `${label}: ожидается безопасный идентификатор PostgreSQL`);
  return value;
}

function checkedUuid(value, label) {
  assert.match(value, UUID, `${label}: ожидается UUID`);
  return value;
}

function runtimeContext() {
  const output = psql(`
SELECT m.organization_id::text || '|' || refs.opaque_ref::text || '|'
       || staff.capability_id::text || '|' || staff.session_login || '|'
       || staff.port::text || '|'
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex') || '|'
       || platform_exercise.id::text || '|' || own_exercise.id::text
  FROM public.be_organization_members m
  JOIN app_ext.variant_a_identity_refs refs
    ON refs.physical_user_id = m.platform_user_id AND refs.ref_kind = 'actor'
  CROSS JOIN LATERAL (
    SELECT capability_id, session_login, port
      FROM app_ext.port_context_capabilities
     WHERE context_class = 'staff' AND target_role = 'app_staff'
       AND purpose = 'relation' AND function_identity IS NULL
     ORDER BY session_login LIMIT 1
  ) staff
  CROSS JOIN LATERAL (
    SELECT id FROM public.lfk_exercises
     WHERE catalog_scope = 'catalog' AND owner_kind = 'platform' AND organization_id IS NULL
     ORDER BY id LIMIT 1
  ) platform_exercise
  CROSS JOIN LATERAL (
    SELECT id FROM public.lfk_exercises
     WHERE catalog_scope = 'catalog' AND owner_kind = 'organization'
       AND organization_id = m.organization_id
     ORDER BY id LIMIT 1
  ) own_exercise
 WHERE m.status = 'active'
 ORDER BY m.organization_id
 LIMIT 1;`).stdout;
  const [[organizationId, actorRef, capabilityId, staffLogin, port, argsHash,
    platformExerciseId, ownExerciseId] = []] = rows(output);
  // Триггер `app.enforce_lfk_child_owner` требует, чтобы элемент ПЛАТФОРМЕННОГО шаблона ссылался на
  // платформенное упражнение, а элемент организационного — на своё ИЛИ платформенное. Поэтому фикстуре
  // нужны оба упражнения: иначе «красный» придёт от владения детей, а не от прав чтения.
  assert.ok(platformExerciseId, `${DATABASE}: нет платформенного упражнения для фикстуры`);
  assert.ok(ownExerciseId, `${DATABASE}: нет организационного упражнения для фикстуры`);
  assert.match(argsHash, /^[0-9a-f]{64}$/u, 'хеш типизированных аргументов — SHA-256 hex');
  return {
    organizationId: checkedUuid(organizationId, 'организация'),
    actorRef: checkedUuid(actorRef, 'actor ref'),
    capabilityId: checkedUuid(capabilityId, 'capability'),
    staffLogin: checkedIdentifier(staffLogin, 'логин специалиста'),
    port: checkedIdentifier(port, 'порт'),
    argsHash,
    platformExerciseId: checkedUuid(platformExerciseId, 'платформенное упражнение'),
    ownExerciseId: checkedUuid(ownExerciseId, 'своё упражнение'),
  };
}

const ids = {
  foreignOrganization: randomUUID(),
  temporaryCapability: randomUUID(),
  platformTemplate: randomUUID(),
  platformTemplateForInsert: randomUUID(),
  ownTemplate: randomUUID(),
  foreignTemplate: randomUUID(),
  invalidWrite: randomUUID(),
  corruptPlatformTemplate: randomUUID(),
};

const policyNames = [
  ['lfk_complex_template_exercises', 'rev10_platform_lfk_read_95'],
  ['lfk_complex_templates', 'rev10_platform_lfk_read_96'],
];

/** Предикат повторяет объявленный в `declaration.ts` дословно; инъекции портят только родителя. */
function platformPredicate(table) {
  if (table !== 'lfk_complex_templates') {
    return `(current_user = 'app_staff'::name AND (SELECT app.current_org_id()) IS NOT NULL`
      + ` AND owner_kind = 'platform' AND organization_id IS NULL)`;
  }
  if (FAULT === 'using_true') return 'true';
  return `(${FAULT === 'omit_current_user' ? '' : "current_user = 'app_staff'::name AND "}`
    + `(SELECT app.current_org_id()) IS NOT NULL AND owner_kind = 'platform'`
    + `${FAULT === 'omit_org_null' ? '' : ' AND organization_id IS NULL'})`;
}

function installPoliciesSql() {
  return policyNames.map(([table, name]) => {
    const command = table === 'lfk_complex_templates' && FAULT === 'for_all' ? 'ALL' : 'SELECT';
    return `DROP POLICY IF EXISTS ${name} ON public.${table};\n`
      + `CREATE POLICY ${name} ON public.${table} AS PERMISSIVE FOR ${command} TO app_staff`
      + ` USING (${platformPredicate(table)});`;
  }).join('\n');
}

function fixtureSql(context) {
  return `
INSERT INTO public.be_organizations (id, title)
VALUES ('${ids.foreignOrganization}'::uuid, 'S0 rollback-only foreign clinic');
INSERT INTO public.lfk_complex_templates (id, owner_kind, organization_id, title, status)
VALUES
  ('${ids.platformTemplate}'::uuid, 'platform', NULL, 'S0 platform complex', 'published'),
  ('${ids.platformTemplateForInsert}'::uuid, 'platform', NULL, 'S0 platform insert parent', 'published'),
  ('${ids.ownTemplate}'::uuid, 'organization', '${context.organizationId}'::uuid, 'S0 own complex', 'published'),
  ('${ids.foreignTemplate}'::uuid, 'organization', '${ids.foreignOrganization}'::uuid, 'S0 foreign complex', 'published');
INSERT INTO public.lfk_complex_template_exercises
  (owner_kind, organization_id, template_id, exercise_id, sort_order)
VALUES
  ('platform', NULL, '${ids.platformTemplate}'::uuid, '${context.platformExerciseId}'::uuid, 0),
  ('organization', '${context.organizationId}'::uuid, '${ids.ownTemplate}'::uuid,
   '${context.ownExerciseId}'::uuid, 0),
  ('organization', '${ids.foreignOrganization}'::uuid, '${ids.foreignTemplate}'::uuid,
   '${context.platformExerciseId}'::uuid, 0);`;
}

function installStaffContext(context) {
  return `
SET LOCAL SESSION AUTHORIZATION ${context.staffLogin};
SELECT app.begin_port_context(
  '${context.capabilityId}'::uuid,
  ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
      NULL::regprocedure, decode('${context.argsHash}', 'hex'), '${context.actorRef}'::uuid,
      NULL::uuid, '${context.organizationId}'::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims
);`;
}

let context;
let initialPolicyCount;
function preparedContext() {
  context ??= runtimeContext();
  initialPolicyCount ??= Number.parseInt(psql(`
SELECT count(*) FROM pg_policy
 WHERE polname IN ('rev10_platform_lfk_read_95', 'rev10_platform_lfk_read_96');`).stdout, 10);
  return context;
}

test('объявленные политики действительно развёрнуты на базе, а не только внутри теста',
  { skip: !ENABLED }, () => {
    // Сторожит ровно то, чего не видит самоустановка ниже: reconcile из feat уже сносил эти две
    // политики, и страница теряла платформенный комплекс, пока файл оставался зелёным.
    assertDeclaredPoliciesDeployed(psql, policyNames);
  });

test('CHECK владения отбивает обе неверные пары на шаблоне и на его элементе',
  { skip: !ENABLED }, () => {
    const ctx = preparedContext();
    const attempts = [
      ['шаблон platform/непустая организация', `INSERT INTO public.lfk_complex_templates
        (id, owner_kind, organization_id, title)
        VALUES ('${ids.invalidWrite}', 'platform', '${ctx.organizationId}', 'forbidden')`],
      ['шаблон organization/пустая организация', `INSERT INTO public.lfk_complex_templates
        (id, owner_kind, organization_id, title)
        VALUES ('${ids.invalidWrite}', 'organization', NULL, 'forbidden')`],
    ];
    for (const [label, statement] of attempts) {
      const result = psql(`BEGIN;\n${statement};`, { expectFailure: true });
      assert.equal(sqlState(result), '23514', `${label}: ожидался CHECK 23514, получено: ${result.stderr}`);
    }
  });

test('элемент шаблона не может разойтись с владельцем родителя', { skip: !ENABLED }, () => {
  const ctx = preparedContext();
  const result = psql(`
BEGIN;
${fixtureSql(ctx)}
INSERT INTO public.lfk_complex_template_exercises
  (owner_kind, organization_id, template_id, exercise_id, sort_order)
VALUES ('organization', '${ctx.organizationId}'::uuid, '${ids.platformTemplateForInsert}'::uuid,
        '${ctx.platformExerciseId}'::uuid, 1);`, { expectFailure: true });
  assert.ok(
    /owner/iu.test(result.stderr) || sqlState(result) !== null,
    `ожидался отказ триггера владения, получено: ${result.stderr}`,
  );
});

test('специалист читает свои и платформенные шаблоны, но не чужие', { skip: !ENABLED }, () => {
  const ctx = preparedContext();
  const result = psql(`
BEGIN;
${fixtureSql(ctx)}
${installPoliciesSql()}
${installStaffContext(ctx)}
SELECT 'PROOF_ROLE|' || current_user || '@' || current_database();
SELECT 'PROOF_TEMPLATES|' || count(*) FILTER (WHERE id = '${ids.ownTemplate}') || '|'
       || count(*) FILTER (WHERE id = '${ids.platformTemplate}') || '|'
       || count(*) FILTER (WHERE id = '${ids.foreignTemplate}') FROM public.lfk_complex_templates;
SELECT 'PROOF_TEMPLATE_ITEMS|' || count(*) FILTER (WHERE template_id = '${ids.ownTemplate}') || '|'
       || count(*) FILTER (WHERE template_id = '${ids.platformTemplate}') || '|'
       || count(*) FILTER (WHERE template_id = '${ids.foreignTemplate}')
  FROM public.lfk_complex_template_exercises;
ROLLBACK;`);
  const seen = markers(result.stdout);
  assert.equal(seen.get('PROOF_ROLE'), 'app_staff@bcb_webapp_dev');
  for (const label of ['PROOF_TEMPLATES', 'PROOF_TEMPLATE_ITEMS']) {
    assert.equal(seen.get(label), '1|1|0', `${label}: ожидалось своё|платформенное|чужое`);
  }
});

function assertNoPlatformWrite(label, statement) {
  const ctx = preparedContext();
  const result = psql(`
BEGIN;
${fixtureSql(ctx)}
${installPoliciesSql()}
${installStaffContext(ctx)}
${statement};
ROLLBACK;`, { expectFailure: null });
  if (result.failed) {
    assert.equal(sqlState(result), '42501', `${label}: ожидался закрытый отказ 42501, получено: ${result.stderr}`);
  } else {
    assert.equal(markers(result.stdout).get('PROOF_WRITE'), '0', `${label}: платформенная строка изменена`);
  }
}

test('специалист не создаёт, не меняет и не удаляет платформенные шаблоны и их элементы',
  { skip: !ENABLED }, () => {
    const ctx = preparedContext();
    const operations = [
      ['insert шаблона', `INSERT INTO public.lfk_complex_templates
        (id, owner_kind, organization_id, title)
        VALUES ('${ids.invalidWrite}', 'platform', NULL, 'forbidden')`],
      ['update шаблона', `WITH changed AS (UPDATE public.lfk_complex_templates SET title = 'forbidden'
        WHERE id = '${ids.platformTemplate}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['delete шаблона', `WITH changed AS (DELETE FROM public.lfk_complex_templates
        WHERE id = '${ids.platformTemplate}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['insert элемента', `INSERT INTO public.lfk_complex_template_exercises
        (owner_kind, organization_id, template_id, exercise_id, sort_order)
        VALUES ('platform', NULL, '${ids.platformTemplateForInsert}', '${ctx.platformExerciseId}', 1)`],
      ['update элемента', `WITH changed AS (UPDATE public.lfk_complex_template_exercises
        SET sort_order = sort_order + 1 WHERE template_id = '${ids.platformTemplate}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
      ['delete элемента', `WITH changed AS (DELETE FROM public.lfk_complex_template_exercises
        WHERE template_id = '${ids.platformTemplate}' RETURNING 1)
        SELECT 'PROOF_WRITE|' || count(*) FROM changed;`],
    ];
    for (const [label, statement] of operations) assertNoPlatformWrite(label, statement);
  });

test('обычная организационная запись врача проходит той же дверью, что и до расширения чтения',
  { skip: !ENABLED }, () => {
    const ctx = preparedContext();
    // Колонки перечислены ровно те, что перечисляет приложение (`pgLfkTemplates.ts`), и ровно те, на
    // которые у `app_staff` есть колоночный `INSERT`: `id` и `status` специалисту не даны — их ставит
    // база своими значениями по умолчанию. Пара (template_id, exercise_id) уникальна, поэтому элемент
    // берёт ДРУГОЕ упражнение, а не то, что уже лежит в фикстуре.
    const attempts = [
      ['шаблон', `INSERT INTO public.lfk_complex_templates
        (owner_kind, organization_id, title)
        VALUES (DEFAULT, '${ctx.organizationId}', 'allowed own complex')`],
      ['элемент шаблона', `INSERT INTO public.lfk_complex_template_exercises
        (owner_kind, organization_id, template_id, exercise_id, sort_order)
        VALUES (DEFAULT, '${ctx.organizationId}', '${ids.ownTemplate}', '${ctx.platformExerciseId}', 7)`],
    ];
    const failures = [];
    for (const [label, statement] of attempts) {
      const result = psql(`
BEGIN;
${fixtureSql(ctx)}
${installPoliciesSql()}
${installStaffContext(ctx)}
${statement};
ROLLBACK;`, { expectFailure: null });
      if (result.failed) failures.push(`${label}:${sqlState(result) ?? 'unknown'}`);
    }
    assert.deepEqual(failures, [], `обычная организационная запись отбита: ${failures.join(', ')}`);
  });

test('organization_id IS NULL остаётся частью границы платформенного чтения',
  { skip: !ENABLED }, () => {
    const ctx = preparedContext();
    const result = psql(`
BEGIN;
ALTER TABLE public.lfk_complex_templates DROP CONSTRAINT lfk_complex_templates_owner_check;
INSERT INTO public.be_organizations (id, title)
VALUES ('${ids.foreignOrganization}', 'S0 rollback-only corrupt-row clinic');
INSERT INTO public.lfk_complex_templates (id, owner_kind, organization_id, title)
VALUES ('${ids.corruptPlatformTemplate}', 'platform', '${ids.foreignOrganization}', 'corrupt rollback row');
${installPoliciesSql()}
${installStaffContext(ctx)}
SELECT 'PROOF_CORRUPT_PLATFORM|' || count(*) FROM public.lfk_complex_templates
 WHERE id = '${ids.corruptPlatformTemplate}';
ROLLBACK;`);
    assert.equal(markers(result.stdout).get('PROOF_CORRUPT_PLATFORM'), '0',
      'строка с непустой организацией не должна становиться платформенно видимой');
  });

test('current_user сужает платформенное чтение до рантайм-роли app_staff', { skip: !ENABLED }, () => {
  const ctx = preparedContext();
  const temporaryRole = 'audit_s0_complex_current_user';
  const result = psql(`
BEGIN;
CREATE ROLE ${temporaryRole};
GRANT app_staff TO ${temporaryRole} WITH INHERIT TRUE;
GRANT SELECT ON public.lfk_complex_templates TO ${temporaryRole};
GRANT EXECUTE ON FUNCTION app.begin_port_context(uuid, app.port_context_claims),
  app.clear_port_context(), app.install_port_context(uuid, app.port_context_claims),
  app.current_org_id() TO ${temporaryRole};
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
VALUES ('${ids.temporaryCapability}', '${ctx.port}'::app.port_name, '${temporaryRole}'::name,
        'app_staff'::name, 'staff'::app.port_context_class, 'relation', NULL::regprocedure);
INSERT INTO public.lfk_complex_templates (id, owner_kind, organization_id, title)
VALUES ('${ids.platformTemplate}', 'platform', NULL, 'S0 current-user rollback row');
${installPoliciesSql()}
DROP POLICY rev10_context_gate_96 ON public.lfk_complex_templates;
SET LOCAL SESSION AUTHORIZATION ${temporaryRole};
SELECT app.begin_port_context(
  '${ids.temporaryCapability}'::uuid,
  ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
      NULL::regprocedure, decode('${ctx.argsHash}', 'hex'), '${ctx.actorRef}'::uuid,
      NULL::uuid, '${ctx.organizationId}'::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims
);
RESET ROLE;
SELECT 'PROOF_MEMBER_ROLE|' || current_user || '|'
       || count(*) FROM public.lfk_complex_templates WHERE id = '${ids.platformTemplate}';
RESET SESSION AUTHORIZATION;
ROLLBACK;`);
  assert.equal(markers(result.stdout).get('PROOF_MEMBER_ROLE'), `${temporaryRole}|0`,
    'член роли app_staff вне SET ROLE app_staff не должен читать платформенные строки');
});

after(() => {
  if (!ENABLED) return;
  const result = psql(`
SELECT 'PROOF_RESIDUE|' || (
  (SELECT count(*) FROM public.be_organizations WHERE id = '${ids.foreignOrganization}')
  + (SELECT count(*) FROM public.lfk_complex_templates WHERE id IN (
      '${ids.platformTemplate}', '${ids.platformTemplateForInsert}', '${ids.ownTemplate}',
      '${ids.foreignTemplate}', '${ids.invalidWrite}', '${ids.corruptPlatformTemplate}'))
  + (SELECT count(*) FROM public.lfk_complex_template_exercises WHERE template_id IN (
      '${ids.platformTemplate}', '${ids.platformTemplateForInsert}', '${ids.ownTemplate}',
      '${ids.foreignTemplate}'))
  + (SELECT count(*) FROM pg_roles WHERE rolname = 'audit_s0_complex_current_user')
);
SELECT 'PROOF_POLICY_RESTORE|' || count(*) FROM pg_policy
 WHERE polname IN ('rev10_platform_lfk_read_95', 'rev10_platform_lfk_read_96');
SELECT 'PROOF_CONSTRAINT_RESTORE|' || count(*) FROM pg_constraint
 WHERE conname = 'lfk_complex_templates_owner_check';
SELECT 'PROOF_CONTEXT_POLICY_RESTORE|' || count(*) FROM pg_policy
 WHERE polname = 'rev10_context_gate_96'
   AND polrelid = 'public.lfk_complex_templates'::regclass;`);
  const seen = markers(result.stdout);
  assert.equal(seen.get('PROOF_RESIDUE'), '0', 'откатные фикстуры оставили следы');
  assert.equal(seen.get('PROOF_POLICY_RESTORE'), String(initialPolicyCount),
    'политики платформенного чтения не вернулись в исходное состояние');
  assert.equal(seen.get('PROOF_CONSTRAINT_RESTORE'), '1', 'CHECK владения не восстановлен');
  assert.equal(seen.get('PROOF_CONTEXT_POLICY_RESTORE'), '1',
    'политика контекстного гейта шаблонов не восстановлена');
});
