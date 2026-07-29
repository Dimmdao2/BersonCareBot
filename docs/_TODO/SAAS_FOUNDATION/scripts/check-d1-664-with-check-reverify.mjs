#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const scratchSmokeScripts = [
  'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c1-patient-value-guards.mjs',
  'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c2-patient-value-guards.mjs',
  'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-composed-rls-grants-value-guards.mjs',
];

function fail(message) {
  throw new Error(message);
}

function columnGrantOrThrow(grants, qualifiedName, privilege) {
  const found = grants.find(
    (grant) => grant.qualifiedName === qualifiedName && grant.privilege === privilege,
  );
  if (!found) fail(`Expected ${privilege} column grant for ${qualifiedName}`);
  return found;
}

function tableGrantOrThrow(tables, qualifiedName) {
  const found = tables.find((table) => table.qualifiedName === qualifiedName);
  if (!found) fail(`Expected app_patient table grant metadata for ${qualifiedName}`);
  return found;
}

function assertExactColumns(label, actual, expected) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (
    actualSorted.length !== expectedSorted.length ||
    actualSorted.some((value, index) => value !== expectedSorted[index])
  ) {
    fail(
      `${label} columns mismatch. actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
    );
  }
}

function sanitizedChildEnv() {
  const env = { ...process.env };
  for (const key of [
    'DATABASE_URL',
    'PGDATABASE',
    'PGHOST',
    'PGPASSWORD',
    'PGPASSFILE',
    'PGPORT',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGUSER',
  ]) {
    delete env[key];
  }
  return env;
}

function runNodeScript(relativePath) {
  const result = spawnSync('node', [relativePath], {
    cwd: repoRoot,
    env: sanitizedChildEnv(),
    stdio: 'inherit',
  });
  if (result.error) fail(`${relativePath} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${relativePath} failed with ${result.status ?? 'unknown status'}`);
}

async function loadGrantMetadata() {
  const modulePath = path.join(__dirname, 'p0-5b-grants-sql.mjs');
  const { getAppPatientGrantTables, appPatientColumnGrants } = await import(modulePath);
  return {
    appPatientGrantTables: getAppPatientGrantTables(),
    appPatientColumnGrants,
  };
}

async function assertGrantMetadata(metadata) {
  const treatmentEvents = tableGrantOrThrow(
    metadata.appPatientGrantTables,
    'public.treatment_program_events',
  );
  if (treatmentEvents.privileges !== 'SELECT') {
    fail(`public.treatment_program_events table grant is ${treatmentEvents.privileges}`);
  }
  assertExactColumns(
    'public.treatment_program_events INSERT',
    columnGrantOrThrow(metadata.appPatientColumnGrants, 'public.treatment_program_events', 'INSERT')
      .columns,
    [
      'organization_id',
      'instance_id',
      'event_type',
      'target_type',
      'target_id',
      'payload',
      'reason',
    ],
  );

  const channelPreferences = tableGrantOrThrow(
    metadata.appPatientGrantTables,
    'public.user_channel_preferences',
  );
  if (channelPreferences.privileges !== 'SELECT') {
    fail(`public.user_channel_preferences table grant is ${channelPreferences.privileges}`);
  }
  assertExactColumns(
    'public.user_channel_preferences INSERT',
    columnGrantOrThrow(metadata.appPatientColumnGrants, 'public.user_channel_preferences', 'INSERT')
      .columns,
    [
      'user_id',
      'platform_user_id',
      'channel_code',
      'is_enabled_for_messages',
      'is_enabled_for_notifications',
      'is_preferred_for_auth',
      'updated_at',
    ],
  );
  assertExactColumns(
    'public.user_channel_preferences UPDATE',
    columnGrantOrThrow(metadata.appPatientColumnGrants, 'public.user_channel_preferences', 'UPDATE')
      .columns,
    [
      'platform_user_id',
      'is_enabled_for_messages',
      'is_enabled_for_notifications',
      'is_preferred_for_auth',
      'updated_at',
    ],
  );
}

try {
  await assertGrantMetadata(await loadGrantMetadata());
  if (process.argv.includes('--run-scratch-smokes')) {
    for (const script of scratchSmokeScripts) runNodeScript(script);
  }
  console.log('check-d1-664-with-check-reverify: grant metadata OK');
} catch (error) {
  console.error(
    `check-d1-664-with-check-reverify: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
