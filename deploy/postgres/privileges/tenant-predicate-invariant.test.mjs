/**
 * A1–A3 системного аудита 27.08 (`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`).
 *
 * Что ловит этот файл, одной строкой на проверку:
 *  — org-scoped отношение отдаёт арендной роли разрешающую политику БЕЗ сравнения организации:
 *    сотрудник клиники A читает строки клиники B (ровно то, что случилось с
 *    `public.content_access_grants_webapp`);
 *  — пациентский путь упирается в отношение, к которому пациентской двери нет: `42501` и SSR 500
 *    вместо ответа «можно/нельзя показать материал»;
 *  — пациенту выдана таблица целиком: он читает `token_hash` и метаданные чужих грантов.
 *
 * Оракул — не текущая реализация, а декларация: `WALL_TEMPLATES` (`types.ts`) говорит, что у стены
 * `clinic+patient` ветка персонала идёт по организации, а ветка пациента — по своей строке. Гейт
 * проверяет ровно это обещание, а не то, как оно сегодня записано.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { declaration } from './declaration.ts';
import { generatePrivilegesSql } from './generate.mjs';
import { assertPatientCallsiteDoors, relationsWithPatientDoor } from './access-census.mjs';
import { describeTenantPredicateViolation, tenantPredicateViolations } from './tenant-wall.mjs';

const WEBAPP_ROOT = fileURLToPath(new URL('../../../apps/webapp/', import.meta.url));
const DATABASES = Object.keys(declaration.databases);
const GRANTS = 'public.content_access_grants_webapp';

/** Глубокая копия одной таблицы одной базы с подменой — чтобы инъекция не текла между тестами. */
function withTable(database, relation, mutate) {
  const declared = declaration.databases[database];
  const table = declared.tables[relation];
  return {
    ...declaration,
    databases: {
      ...declaration.databases,
      [database]: { ...declared, tables: { ...declared.tables, [relation]: mutate(table) } },
    },
  };
}

test('every organization-scoped relation carries the tenant predicate in all permissive tenant policies', () => {
  for (const database of DATABASES) {
    const violations = tenantPredicateViolations(declaration, database);
    assert.deepEqual(violations.map(describeTenantPredicateViolation), [], database);
  }
});

test('the generator refuses to emit an artifact once the tenant predicate is removed', () => {
  for (const database of DATABASES) {
    // Инъекция: та самая политика, какой она была до 27.08 — только имя роли, без организации.
    const injured = withTable(database, GRANTS, (table) => ({
      ...table,
      policies: table.policies.map((policy) => (policy.name?.startsWith('rev10_direct_business')
        ? { ...policy, using: "(current_user = 'app_staff'::name)", withCheck: "(current_user = 'app_staff'::name)" }
        : policy)),
    }));

    assert.ok(
      tenantPredicateViolations(injured, database).length > 0,
      `${database}: снятый организационный предикат обязан быть найден`,
    );
    assert.throws(
      () => generatePrivilegesSql(injured, database),
      /стена арендатора не доехала до политики/u,
      `${database}: генератор обязан отказаться отдавать артефакт с дырой в стене`,
    );
  }
});

test('the patient branch of an organization-scoped relation stays on its own row', () => {
  for (const database of DATABASES) {
    // Инъекция: пациентская ветка без собственного ключа и без организации — «свои» строки любого.
    const injured = withTable(database, GRANTS, (table) => ({
      ...table,
      policies: table.policies.map((policy) => (policy.name?.startsWith('rev10_direct_business')
        ? {
            ...policy,
            using: "(CASE WHEN current_user = 'app_staff'::name THEN organization_id = (SELECT app.current_org_id())"
              + " WHEN current_user = 'app_patient'::name THEN revoked_at IS NULL ELSE false END)",
          }
        : policy)),
    }));

    const violations = tenantPredicateViolations(injured, database);
    assert.equal(violations.length, 1, database);
    assert.equal(violations[0].role, 'app_patient');
  }
});

test('the patient entitlement door is narrow: own active grant, and only the fields the answer needs', () => {
  for (const database of DATABASES) {
    const access = declaration.databases[database].tables[GRANTS].access;
    const patient = access.grants.filter((grant) => grant.role === 'app_patient');

    assert.deepEqual(patient.map((grant) => grant.operations).flat(), ['SELECT'],
      `${database}: пациент только читает выданный ему доступ`);
    assert.notEqual(patient[0].columns, 'table',
      `${database}: table-wide грант пациенту не выдаётся`);
    assert.deepEqual([...patient[0].columns].sort(),
      ['content_id', 'expires_at', 'meta_json', 'platform_user_id', 'purpose', 'revoked_at']);
    for (const secret of ['token_hash', 'integrator_grant_id']) {
      assert.ok(!patient[0].columns.includes(secret), `${database}: ${secret} пациенту не отдаётся`);
    }

    const policy = declaration.databases[database].tables[GRANTS].policies
      .find((candidate) => candidate.name?.startsWith('rev10_direct_business'));
    assert.ok(policy.to.includes('app_patient'), `${database}: пациентская ветка политики объявлена`);
    for (const qualifier of ['using', 'withCheck']) {
      assert.match(policy[qualifier], /platform_user_id = app\.current_patient_user_id\(\)/u);
      assert.match(policy[qualifier], /revoked_at IS NULL AND expires_at > now\(\)/u);
    }
  }
});

test('a patient-only callsite may not reach a relation without a patient door', () => {
  for (const database of DATABASES) {
    assert.doesNotThrow(() => assertPatientCallsiteDoors(declaration, database), database);

    // Инъекция: снять пациентскую дверь — состояние ровно до исправления A2.
    const injured = withTable(database, GRANTS, (table) => ({
      ...table,
      grants: Object.fromEntries(Object.entries(table.grants).filter(([role]) => role !== 'app_patient')),
      access: { ...table.access, grants: table.access.grants.filter((grant) => grant.role !== 'app_patient') },
    }));

    assert.ok(relationsWithPatientDoor(declaration, database).has(GRANTS), database);
    assert.ok(!relationsWithPatientDoor(injured, database).has(GRANTS), database);
    assert.throws(
      () => assertPatientCallsiteDoors(injured, database),
      /patient-only callsite reaches a relation with no app_patient door public\.content_access_grants_webapp/u,
      database,
    );
  }
});

/**
 * A1 держится на флаге `org: true`: инвариант выше просто ПРОПУСКАЕТ таблицу, у которой флага нет.
 * Независимый аудит S0б показал, чем это кончается: `org: true` у `public.tests` можно было снять
 * обратно, и ни один гейт не краснел — стена переставала сторожить каталог клинических тестов
 * молча. Флаг объявлен как «измеренный переписью факт наличия колонки», поэтому здесь он и
 * сверяется с переписью: колонки берутся у самой drizzle-схемы, а не переписываются руками.
 *
 * СПИСКА ИСКЛЮЧЕНИЙ ЗДЕСЬ НЕТ И БЫТЬ НЕ ДОЛЖНО (решение владельца 12.09.2026, дословно: «список
 * исключений просто убрать, у нас не должно быть никаких исключений… надо просто их правильно
 * оформить, и проверки, и схему»). До 12.09 здесь стояла «заморозка» на 30 таблиц, и она читалась
 * как разрешение: таблица в списке несла `organization_id`, не была объявлена `org: true`, и
 * инвариант арендной стены её не проверял вовсе. Все 30 разобраны по факту и объявлены
 * (`docs/_TODO/TENANT_WALL_DEBT_2026-09-12.md`, пункт А), поэтому `gaps` обязан быть пуст САМ ПО
 * СЕБЕ, без вычитания какого бы то ни было базового множества.
 *
 * Вторая половина того же решения (пункт Б) — перепись не видит того, чего нет в drizzle-схеме:
 * шесть таблиц жили в кластере мимо неё и потому не проверялись ничем. Они заведены в схему и
 * экспортированы из `db/schema/index.ts`; проверка ниже сверяет, что перепись знает КАЖДУЮ живую
 * таблицу кластера, иначе «ноль расхождений» опять означал бы «ноль там, куда мы смотрим».
 */

/** Имя таблицы → её колонки, снятые с самой drizzle-схемы одним вызовом. */
function drizzleTableColumns() {
  const expression = [
    "import * as schema from './db/schema/index.ts'",
    "import { getTableConfig } from 'drizzle-orm/pg-core'",
    'const out = {}',
    `for (const value of Object.values(schema)) {
      try {
        const config = getTableConfig(value);
        if (config?.name) out[config.name] = config.columns.map((column) => column.name);
      } catch { /* не таблица — пропускаем */ }
    }`,
    'process.stdout.write(JSON.stringify(out))',
  ].join(';');
  return JSON.parse(execFileSync('node_modules/.bin/tsx', ['-e', expression], {
    cwd: WEBAPP_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }));
}

function orgFlagCensusGaps(declared, columnsByTable) {
  const gaps = [];
  for (const [relation, table] of Object.entries(declared.tables)) {
    if (!relation.startsWith('public.') || table.disposition !== 'ACTIVE') continue;
    const columns = columnsByTable[relation.slice('public.'.length)];
    if (!columns) continue;
    if (columns.includes('organization_id') && table.org !== true) gaps.push(relation);
  }
  return gaps.sort();
}

/**
 * Живая таблица, объявленная в декларации, но НЕ экспортированная drizzle-схемой: перепись
 * колонок её не видит, `orgFlagCensusGaps` молча пропускает (`if (!columns) continue`), и «ноль
 * расхождений» выше означает «ноль там, куда мы смотрим». Ровно так шесть таблиц
 * (`broadcast_drafts`, `system_settings_audit`, `patient_comorbidity`, `clinic_dedicated_bot_bindings`,
 * `booking_calendar_map`, `email_otp_locks`) прожили вне арендной проверки: одна имела файл схемы,
 * но не экспортировалась из `db/schema/index.ts`, пяти не было вовсе.
 */
function relationsInvisibleToCensus(declared, columnsByTable) {
  const invisible = [];
  for (const [relation, table] of Object.entries(declared.tables)) {
    if (!relation.startsWith('public.') || table.disposition !== 'ACTIVE') continue;
    if (!columnsByTable[relation.slice('public.'.length)]) invisible.push(relation);
  }
  return invisible.sort();
}

test('org-флаг стены сверяется с переписью колонок, а не с доброй волей автора', () => {
  const columnsByTable = drizzleTableColumns();
  assert.ok(
    Object.keys(columnsByTable).length > 100,
    'перепись колонок пуста — дальше проверять нечего',
  );

  for (const database of DATABASES) {
    // Сначала — ВИДИТ ли перепись каждую живую таблицу. Иначе пустой `gaps` ниже ничего не значит.
    const invisible = relationsInvisibleToCensus(declaration.databases[database], columnsByTable);
    assert.deepEqual(
      invisible,
      [],
      `${database}: таблица объявлена живой, но drizzle-схема её не экспортирует — перепись её не`
        + ` видит, и арендную стену на ней не проверяет никто: ${invisible.join(', ')}`,
    );

    const gaps = orgFlagCensusGaps(declaration.databases[database], columnsByTable);
    assert.deepEqual(
      gaps,
      [],
      `${database}: таблица несёт organization_id, но не объявлена org: true — инвариант арендной`
        + ` стены её пропускает: ${gaps.join(', ')}`,
    );
  }

  // Прежний храповик держал список исключений; списка больше нет, но СВОЙСТВО, которое он
  // сторожил, осталось: снятый с каталога `org: true` не должен пройти молча. Теперь оно
  // проверяется прямо на декларации, а не через отсутствие имени в множестве-заглушке.
  const catalogRelations = [
    'public.tests',
    'public.recommendations',
    'public.clinical_test_regions',
    'public.recommendation_regions',
    'public.lfk_exercises',
  ];
  for (const database of DATABASES) {
    for (const relation of catalogRelations) {
      assert.equal(
        declaration.databases[database].tables[relation]?.org,
        true,
        `${database}: ${relation} обязана нести org: true — иначе стена перестаёт сторожить каталог`,
      );
    }
  }
});
