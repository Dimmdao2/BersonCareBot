import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const wrapperPath = fileURLToPath(new URL('./dev-post-refresh-unlock.sh', import.meta.url));
const refreshPath = fileURLToPath(new URL('./refresh-dev-from-test.sh', import.meta.url));
const sqlPath = fileURLToPath(new URL('../postgres/dev-post-refresh-unlock.sql', import.meta.url));
const testOverridePath = fileURLToPath(
  new URL('../postgres/test-settings-override.sql', import.meta.url),
);

function extractCanonicalLockBody(source, qualifiedName) {
  const escapedName = qualifiedName.replaceAll('.', '\\.');
  const pattern = new RegExp(
    `CREATE OR REPLACE FUNCTION ${escapedName}\\(\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`,
    'u',
  );
  const match = pattern.exec(source);
  assert.ok(match, `canonical lock body not found: ${qualifiedName}`);
  return match[1];
}

function extractExpectedLockBody(source, variableName, quoteTag) {
  const pattern = new RegExp(
    `${variableName} constant text := \\$${quoteTag}\\$([\\s\\S]*?)\\$${quoteTag}\\$;`,
    'u',
  );
  const match = pattern.exec(source);
  assert.ok(match, `expected lock body not found: ${variableName}`);
  return match[1];
}

test('DEV unlock SQL guards the exact database before narrowly scoped DDL', () => {
  const source = readFileSync(sqlPath, 'utf8');
  const firstDrop = source.indexOf('DROP TRIGGER');

  assert.notEqual(firstDrop, -1);
  assert.ok(source.indexOf("current_database() <> 'bcb_webapp_dev'") < firstDrop);
  assert.deepEqual(
    [...source.matchAll(/^DROP TRIGGER IF EXISTS (.+);$/gmu)].map((match) => match[1]),
    [
      'system_settings_test_lock ON public.system_settings',
      'system_settings_test_lock ON integrator.system_settings',
    ],
  );
  assert.deepEqual(
    [...source.matchAll(/^DROP FUNCTION IF EXISTS (.+);$/gmu)].map((match) => match[1]),
    ['public.system_settings_test_lock_guard()', 'integrator.system_settings_test_lock_guard()'],
  );
  assert.doesNotMatch(
    source,
    /\bCASCADE\b|\bDROP\s+(?:TABLE|SCHEMA|DATABASE|ROLE)\b|\b(?:DELETE|UPDATE|INSERT|ALTER)\b/iu,
  );
  assert.doesNotMatch(source, /bcb_webapp_prod|bersoncarebot_test|\/opt\/env/iu);
  const canonicalOverride = readFileSync(testOverridePath, 'utf8');
  const publicBody = extractCanonicalLockBody(canonicalOverride, 'system_settings_test_lock_guard');
  const integratorBody = extractCanonicalLockBody(
    canonicalOverride,
    'integrator.system_settings_test_lock_guard',
  );
  const expectedPublicBody = extractExpectedLockBody(
    source,
    'expected_public_body',
    'expected_public_body',
  );
  const expectedIntegratorBody = extractExpectedLockBody(
    source,
    'expected_integrator_body',
    'expected_integrator_body',
  );
  assert.equal(expectedPublicBody, publicBody);
  assert.equal(expectedIntegratorBody, integratorBody);
  assert.notEqual(publicBody.replace('RETURN NEW;', 'RETURN OLD;'), expectedPublicBody);
  assert.notEqual(
    integratorBody.replace(
      'RETURN NEW;',
      '-- TEST ENV LOCK (integrator): retained marker\\n  RETURN OLD;',
    ),
    expectedIntegratorBody,
  );
  assert.match(source, /function_row\.prosrc = expected_public_body/u);
  assert.match(source, /function_row\.prosrc = expected_integrator_body/u);
  assert.match(source, /refused unexpected public lock function/u);
  assert.match(source, /refused unexpected integrator lock function/u);
  assert.match(source, /trigger_row\.tgfoid IS DISTINCT FROM public_guard_oid/u);
  assert.match(source, /trigger_row\.tgfoid IS DISTINCT FROM integrator_guard_oid/u);
  assert.match(source, /trigger_row\.tgisinternal/u);
  assert.match(source, /trigger_row\.tgtype <> 19/u);
  assert.match(source, /trigger_row\.tgenabled <> 'O'/u);
  assert.match(source, /trigger_row\.tgconstraint <> 0/u);
  assert.match(source, /octet_length\(trigger_row\.tgargs\) <> 0/u);
  assert.match(source, /trigger_row\.tgqual IS NOT NULL/u);
  assert.match(source, /trigger_row\.tgoldtable IS NOT NULL/u);
  assert.match(source, /trigger_row\.tgnewtable IS NOT NULL/u);
  assert.match(source, /DEV post-refresh unlock did not remove the exact TEST-only lock objects/u);
});

test('independent wrapper parses the canonical DEV env as data and sanitizes psql', () => {
  const source = readFileSync(wrapperPath, 'utf8');

  assert.match(source, /TARGET_DB="bcb_webapp_dev"/u);
  assert.match(source, /"\$NODE_BIN" "\$DEV_ENV_PARSER" "\$DEV_ENV"/u);
  assert.doesNotMatch(source, /\bsource\s+["']?\$DEV_ENV/u);
  assert.match(source, /actual_database=.*SELECT current_database/u);
  assert.ok(
    source.indexOf('exact DEV database guard failed') < source.indexOf('--file="$UNLOCK_SQL"'),
  );
  assert.match(source, /env -i/u);
  assert.match(source, /"\$PSQL_BIN" "\$DEV_DATABASE_URL"/u);
  assert.match(source, /PGPASSFILE=\/dev\/null/u);
  assert.match(source, /--single-transaction/u);
  assert.doesNotMatch(source, /sudo|\/opt\/env|bcb_webapp_prod|bersoncarebot_test/u);
  assert.doesNotMatch(source, /DROP\s+(?:DATABASE|TABLE|SCHEMA)|pg_dump|pg_restore/iu);
});

test('TEST to DEV refresh invokes unlock only after current-branch migrations', () => {
  const source = readFileSync(refreshPath, 'utf8');
  const migrateIndex = source.indexOf('bash "$DEV_MIGRATE" --execute');
  const unlockIndex = source.indexOf('bash "$DEV_POST_REFRESH_UNLOCK" --execute');
  const passIndex = source.indexOf(
    'PASS: DEV now mirrors TEST data plus current branch migrations',
  );

  assert.notEqual(migrateIndex, -1);
  assert.ok(unlockIndex > migrateIndex);
  assert.ok(passIndex > unlockIndex);
  assert.match(source, /DEV post-refresh unlock path guard failed/u);
  assert.doesNotMatch(source, /pnpm run migrate|DEV_RUNTIME_OVERLAY_REHYDRATE/u);
});
