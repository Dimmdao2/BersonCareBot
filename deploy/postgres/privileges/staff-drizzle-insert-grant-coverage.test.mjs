/**
 * Closing-audit wall for the staff money write paths (owner checklist
 * `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K — MONEY-04, MONEY-11).
 *
 * The failure this catches, in one line: a staff Drizzle INSERT names a column the declaration does
 * not grant `app_staff`, so the write dies with `42501 permission denied for table …` on the first
 * live sale — after the migration, the reconcile and the deploy have all gone green.
 *
 * It is dear and silent. Dear: no cash row reaches the canonical ledger, so «Наличные» and the
 * payment timeline stay empty while the doctor is told the sale failed. Silent: nothing before the
 * live call disagrees — `check:db-privileges-generated` compares the artifact to the declaration
 * (both self-consistent), the owner-aware preflight validates DDL under the object owner, and the
 * reconcile grants exactly what the declaration says.
 *
 * Drizzle names EVERY insertable column of the table, passing `default` for the ones the caller did
 * not supply, and PostgreSQL checks INSERT privilege on every NAMED column whatever the value is.
 * So the list below is taken from Drizzle's own query builder rather than restated by hand: if
 * Drizzle ever stops naming unsupplied columns, this check follows that reality instead of freezing
 * an assumption about it.
 *
 * `relation-access.test.mjs` already pins `public.be_patient_packages` this way (as an exact match
 * against the schema columns). `public.patient_payment` — the one cash door MONEY-04 tells the
 * membership sale to reuse — was in no such contract, which is how its grant drifted away from the
 * statement it has to admit.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { REV10_CLINICAL_ACCESS } from './relation-access.ts';

const WEBAPP_ROOT = fileURLToPath(new URL('../../../apps/webapp/', import.meta.url));

/** The relations a staff request writes through Drizzle on the membership sale path. */
const STAFF_INSERT_PATHS = [
  {
    relation: 'public.patient_payment',
    schemaExport: 'patientPayment',
    schemaModule: './db/schema/patientPayments.ts',
    door: 'pgPatientPayments.addCashPayment',
  },
  {
    relation: 'public.be_patient_packages',
    schemaExport: 'bePatientPackages',
    schemaModule: './db/schema/bookingMemberships.ts',
    door: 'pgMemberships.createManualPatientPackage / offerCatalogPackageToPatient',
  },
  {
    // PAY-APPT-01/18: the appointment now carries its own price and prepayment snapshot, so the
    // staff INSERT names eight more columns than before. One of them — `prepayment_paid_minor` —
    // is factual money the staff request never supplies; Drizzle still NAMES it, so the grant has
    // to admit it or every manual booking dies with 42501 at the first save.
    relation: 'public.be_appointments',
    schemaExport: 'beAppointments',
    schemaModule: './db/schema/bookingEngine.ts',
    door: 'pgBookingEngine.insertAppointmentInTransaction',
  },
  // S0б магазина упражнений (`EXERCISE_STORE_PLAN.md` §5): у четырёх отношений каталога появилась
  // колонка владения `owner_kind` с DEFAULT. Ни один порт её не передаёт, но Drizzle всё равно
  // НАЗЫВАЕТ её в каждом INSERT — и без гранта создание клинического теста и рекомендации умирало
  // живым HTTP 500 (`42501`), хотя миграция, регенерация и дрейф-гейт были зелёными. Этот список —
  // то место, где такой класс обязан краснеть ДО живого прогона.
  {
    relation: 'public.tests',
    schemaExport: 'clinicalTests',
    schemaModule: './db/schema/clinicalTests.ts',
    door: 'pgClinicalTests.create',
  },
  {
    relation: 'public.clinical_test_regions',
    schemaExport: 'clinicalTestRegions',
    schemaModule: './db/schema/clinicalTests.ts',
    door: 'pgClinicalTests.create / update (регионы переписываются заново)',
  },
  {
    relation: 'public.recommendations',
    schemaExport: 'recommendations',
    schemaModule: './db/schema/recommendations.ts',
    door: 'pgRecommendations.create',
  },
  {
    relation: 'public.recommendation_regions',
    schemaExport: 'recommendationRegions',
    schemaModule: './db/schema/recommendations.ts',
    door: 'pgRecommendations.create / update (регионы переписываются заново)',
  },
];

/**
 * The columns the emitted INSERT really names. Built by Drizzle itself with no supplied values, so
 * the result is the full set any production `.values({…})` on this table can name.
 */
function drizzleInsertColumns(schemaExport, schemaModule) {
  const expression = [
    "import { drizzle } from 'drizzle-orm/pg-proxy'",
    `import { ${schemaExport} } from '${schemaModule}'`,
    'const db = drizzle(async () => ({ rows: [] }))',
    `const { sql: text } = db.insert(${schemaExport}).values({}).toSQL()`,
    'const named = text.slice(text.indexOf("(") + 1, text.indexOf(") values"))',
    'process.stdout.write(JSON.stringify(named.split(",").map((c) => c.trim().replaceAll(String.fromCharCode(34), "")).sort()))',
  ].join(';');
  return JSON.parse(execFileSync('node_modules/.bin/tsx', ['-e', expression], {
    cwd: WEBAPP_ROOT,
    encoding: 'utf8',
  }));
}

function staffInsertGrantColumns(relation) {
  const access = REV10_CLINICAL_ACCESS[relation];
  assert.ok(access, `missing relation access: ${relation}`);
  assert.equal(access.kind, 'direct', relation);
  const matches = access.grants.filter(
    (grant) => grant.role === 'app_staff' && grant.operations.includes('INSERT'),
  );
  assert.ok(matches.length >= 1, `${relation} app_staff INSERT`);
  // Права складываются, а не выбираются: у `public.tests` в декларации две записи INSERT для
  // `app_staff`, и реальное право роли — их объединение. Раньше здесь стояло «ровно одна», из-за
  // чего отношение с дублем нельзя было внести в этот список вообще.
  for (const grant of matches) {
    assert.notEqual(grant.columns, 'table', `${relation} app_staff INSERT must be column-scoped`);
  }
  return matches.flatMap((grant) => grant.columns);
}

test('every column a staff Drizzle INSERT names is granted to app_staff', () => {
  for (const path of STAFF_INSERT_PATHS) {
    const named = drizzleInsertColumns(path.schemaExport, path.schemaModule);
    const granted = new Set(staffInsertGrantColumns(path.relation));
    const refused = named.filter((column) => !granted.has(column));
    assert.deepEqual(
      refused,
      [],
      `${path.door} names ${path.relation} column(s) app_staff may not insert: ${refused.join(', ')}`,
    );
  }
});
