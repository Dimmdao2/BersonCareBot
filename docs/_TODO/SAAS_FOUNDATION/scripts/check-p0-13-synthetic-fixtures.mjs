#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertScratchDatabaseName,
  getP013SyntheticFixtureRows,
  p013SyntheticFixture,
  renderP013SyntheticFixtureManifestTsv,
  renderP013SyntheticFixtureScratchSql,
  requiredFixtureFamilies,
  syntheticIntegratorUserIds,
  syntheticFixtureIds,
} from './p0-13-synthetic-fixtures.mjs';

const repoRoot = process.cwd();
const manifestPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-13-synthetic-fixtures.tsv';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function parseTsv(path, text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split('\t');
  return lines.map((line, index) => {
    const fields = line.split('\t');

    if (fields.length !== headers.length) {
      throw new Error(
        `${path}:${index + 2} expected ${headers.length} fields, got ${fields.length}`,
      );
    }

    return Object.fromEntries(headers.map((header, fieldIndex) => [header, fields[fieldIndex]]));
  });
}

function assertSetContainsAll(label, actualValues, expectedValues) {
  const actual = new Set(actualValues);
  const missing = expectedValues.filter((value) => !actual.has(value));
  if (missing.length > 0) throw new Error(`${label} missing: ${missing.join(', ')}`);
}

function assertUuid(label, value, { nullable = false } = {}) {
  if (nullable && value === '') return;
  if (!uuidPattern.test(value))
    throw new Error(`${label} is not a deterministic RFC4122 v4 UUID: ${value}`);
}

function assertNoRealIdentifiers(rows) {
  const joined = JSON.stringify(rows);
  for (const forbidden of [
    '@',
    '+7',
    'telegram',
    'rubitime',
    'smsc',
    'max_id',
    'phone_normalized',
  ]) {
    if (joined.toLowerCase().includes(forbidden)) {
      throw new Error(`fixture must not contain real/external identifier marker: ${forbidden}`);
    }
  }
}

function assertSafetyGuards(sql) {
  for (const token of [
    "current_database() LIKE 'bcb_saas_%'",
    "current_database() ~ '(^|[_-])scratch([_-]|$)'",
    'bcb_webapp_(dev|prod|test)',
    'P0.13.1 synthetic fixture refuses dev/prod/test application databases',
  ]) {
    if (!sql.includes(token)) throw new Error(`scratch SQL missing safety token: ${token}`);
  }

  for (const unsafeName of ['bcb_webapp_dev', 'bcb_webapp_prod', 'bcb_webapp_test', 'postgres']) {
    try {
      assertScratchDatabaseName(unsafeName);
    } catch {
      continue;
    }
    throw new Error(`assertScratchDatabaseName unexpectedly allowed ${unsafeName}`);
  }

  for (const safeName of ['bcb_saas_p0_13_1_scratch', 'local_scratch_fixture']) {
    assertScratchDatabaseName(safeName);
  }
}

function assertScratchSqlCreatesRepresentativeRows(sql) {
  for (const table of [
    'public.platform_users',
    'public.be_organizations',
    'public.be_organization_members',
    'public.org_enrollments',
    'public.be_package_items',
    'public.be_patient_package_items',
    'public.notification_delivery_attempts',
    'public.system_settings',
    'integrator.users',
    'integrator.content_access_grants',
    'public.reminder_rules',
    'integrator.user_reminder_occurrences',
    'integrator.user_reminder_delivery_logs',
  ]) {
    if (!sql.includes(`INSERT INTO ${table}`))
      throw new Error(`scratch SQL does not seed ${table}`);
  }

  if (sql.includes("''::uuid"))
    throw new Error('scratch SQL must render missing UUID values as NULL, not empty strings');
  if (sql.includes('DROP TABLE IF EXISTS') || sql.includes('CREATE TABLE public.')) {
    throw new Error('fixture seed SQL must not drop or replace real target tables');
  }
  if (!sql.includes("('p0_13_fixture_global', 'admin', NULL")) {
    throw new Error('scratch SQL must seed bootstrap global setting with NULL organization_id');
  }
}

function runChecks(overrides = {}) {
  const rows = overrides.rows ?? getP013SyntheticFixtureRows();
  const manifest = overrides.manifest ?? read(manifestPath);
  const sql = overrides.sql ?? renderP013SyntheticFixtureScratchSql({ rows });
  const parsedManifest = parseTsv(manifestPath, manifest);

  if (p013SyntheticFixture.version !== 'p0.13.1') throw new Error('unexpected fixture version');
  if (
    new Set(Object.values(syntheticFixtureIds)).size !== Object.values(syntheticFixtureIds).length
  ) {
    throw new Error('synthetic fixture IDs must be unique');
  }
  if (
    new Set(Object.values(syntheticIntegratorUserIds)).size !==
    Object.values(syntheticIntegratorUserIds).length
  ) {
    throw new Error('synthetic integrator user IDs must be unique');
  }

  for (const [key, value] of Object.entries(syntheticFixtureIds)) {
    assertUuid(`syntheticFixtureIds.${key}`, value);
  }

  if (manifest !== renderP013SyntheticFixtureManifestTsv({ rows })) {
    throw new Error(`${manifestPath} is out of sync with p0-13-synthetic-fixtures.mjs`);
  }

  if (parsedManifest.length !== rows.length)
    throw new Error('manifest row count does not match fixture rows');

  const fixtureIds = rows.map((row) => row.fixtureId);
  if (new Set(fixtureIds).size !== fixtureIds.length)
    throw new Error('fixture rows contain duplicate fixture_id');

  assertSetContainsAll(
    'fixture family coverage',
    rows.map((row) => row.family),
    requiredFixtureFamilies,
  );
  assertSetContainsAll(
    'fixture organization coverage',
    rows.map((row) => row.organizationKey),
    ['org_a', 'org_b'],
  );
  assertSetContainsAll(
    'fixture patient coverage',
    rows.map((row) => row.patientKey),
    ['patient_a1', 'patient_a2', 'patient_b1'],
  );
  assertSetContainsAll(
    'fixture table coverage',
    rows.map((row) => row.table),
    [
      'public.be_organization_members',
      'public.org_enrollments',
      'public.be_package_items',
      'public.be_patient_package_items',
      'public.notification_delivery_attempts',
      'public.system_settings',
      'integrator.content_access_grants',
      'integrator.user_reminder_delivery_logs',
    ],
  );

  const sameOrgPatientRows = rows.filter(
    (row) => row.organizationKey === 'org_a' && row.patientKey.startsWith('patient_a'),
  );
  assertSetContainsAll(
    'same-org patient wall rows',
    sameOrgPatientRows.map((row) => row.patientKey),
    ['patient_a1', 'patient_a2'],
  );

  for (const row of rows) {
    if (row.organizationId) assertUuid(`${row.fixtureId}.organizationId`, row.organizationId);
    if (row.patientUserId) assertUuid(`${row.fixtureId}.patientUserId`, row.patientUserId);
    if (row.principalUserId) assertUuid(`${row.fixtureId}.principalUserId`, row.principalUserId);
    if (!row.expectedScope || !row.notes) throw new Error(`${row.fixtureId} lacks scope note`);
  }

  assertNoRealIdentifiers(rows);
  assertSafetyGuards(sql);
  assertScratchSqlCreatesRepresentativeRows(sql);
}

if (process.argv.includes('--self-test')) {
  const rows = getP013SyntheticFixtureRows().map((row) =>
    row.family === 'integrator_scoped' ? { ...row, family: 'direct_org' } : row,
  );

  try {
    runChecks({
      rows,
      manifest: renderP013SyntheticFixtureManifestTsv({ rows }),
      sql: renderP013SyntheticFixtureScratchSql({ rows }),
    });
  } catch {
    console.log('check-p0-13-synthetic-fixtures self-test: OK');
    process.exit(0);
  }

  throw new Error('self-test did not detect missing integrator_scoped family coverage');
}

try {
  runChecks();
  console.log('check-p0-13-synthetic-fixtures: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-13-synthetic-fixtures: ${message}`);
  process.exit(1);
}
