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
import test from 'node:test';

import { declaration } from './declaration.ts';
import { generatePrivilegesSql } from './generate.mjs';
import { assertPatientCallsiteDoors, relationsWithPatientDoor } from './access-census.mjs';
import { describeTenantPredicateViolation, tenantPredicateViolations } from './tenant-wall.mjs';

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
