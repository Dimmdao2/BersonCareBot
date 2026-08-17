#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  console.log('check-d1-664-with-check-reverify: grant metadata OK');
} catch (error) {
  console.error(
    `check-d1-664-with-check-reverify: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
