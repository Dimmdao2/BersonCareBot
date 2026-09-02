import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  devOwnedSettingsPolicy,
  readTestEnvironmentOwnedKeys,
} from './dev-owned-settings-policy.mjs';

const policyPath = fileURLToPath(new URL('./dev-owned-settings-policy.mjs', import.meta.url));
const overlayPath = fileURLToPath(
  new URL('../postgres/test-settings-override.sql', import.meta.url),
);
const SETTING_KEY_RE = /^[a-z][a-z0-9_]*(?::[a-z0-9_]+)*$/u;

function runPolicy(...args) {
  return spawnSync(process.execPath, [policyPath, ...args], { encoding: 'utf8' });
}

test('every server-only registry key is DEV-owned, so no provider credential rides in from TEST', async () => {
  const policy = await devOwnedSettingsPolicy();
  assert.ok(policy.restrictedKeys.length > 0, 'registry exposed no restricted keys');
  for (const key of policy.restrictedKeys) {
    assert.ok(
      policy.devOwnedKeys.includes(key),
      `restricted key ${key} would be taken from TEST instead of kept from DEV`,
    );
  }
  // Spot-check the classes the refresh exists to protect. These are read off the registry, not
  // declared here: if the registry ever reclassifies one of them the assertion fails loudly.
  for (const key of [
    'smsc_api_key',
    'smtp_outbound',
    'web_push_vapid',
    'google_client_secret',
    'auth_altcha_hmac_secret',
    'admin_telegram_ids',
    'allowed_phones',
  ]) {
    assert.ok(policy.registryKeys.includes(key), `${key} vanished from the registry`);
    assert.ok(policy.devOwnedKeys.includes(key), `${key} is not protected as DEV-owned`);
  }
});

test('keys the TEST environment overlay owns stay with DEV even when the registry calls them runtime', async () => {
  const policy = await devOwnedSettingsPolicy();
  for (const key of [
    'app_base_url',
    'dev_mode',
    'test_account_identifiers',
    'integration_test_ids',
    'patient_app_maintenance_enabled',
    'specialist_signup_enabled',
    'yandex_oauth_redirect_uri',
  ]) {
    assert.ok(
      policy.testEnvironmentOwnedKeys.includes(key),
      `${key} is no longer recognised as TEST environment policy`,
    );
    assert.ok(policy.devOwnedKeys.includes(key), `${key} would be copied from TEST into DEV`);
  }
});

test('ordinary product settings are NOT DEV-owned, so accepted TEST product state does arrive', async () => {
  const policy = await devOwnedSettingsPolicy();
  for (const key of ['patient_label', 'material_ratings_enabled', 'org_custom_domain_hostname']) {
    assert.ok(policy.registryKeys.includes(key), `${key} vanished from the registry`);
    assert.ok(
      !policy.devOwnedKeys.includes(key),
      `${key} is product state and must come from the accepted TEST database`,
    );
  }
});

test('a silently unmatched overlay shape is fatal, never an empty key set', () => {
  const overlay = readFileSync(overlayPath, 'utf8');
  const mutilations = [
    {
      label: 'DELETE ... WHERE key IN (...)',
      sql: overlay.replace(/DELETE\s+FROM\s+public\.system_settings\s+WHERE\s+key\s+IN\s*\([^)]*\)/giu, 'SELECT 1'),
    },
    {
      label: 'INSERT INTO public.system_settings ... VALUES',
      sql: overlay.replaceAll('INSERT INTO public.system_settings', 'INSERT INTO other_table'),
    },
    {
      label: 'UPDATE public.system_settings ... WHERE key = ...',
      sql: overlay.replaceAll('UPDATE public.system_settings SET', 'UPDATE other_table SET'),
    },
  ];
  for (const mutilation of mutilations) {
    assert.throws(
      () => readTestEnvironmentOwnedKeys(mutilation.sql),
      new RegExp(`no longer matches its "${mutilation.label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}" shape`),
      `removing the ${mutilation.label} shape produced a silent result instead of a refusal`,
    );
  }
  // The unmutilated overlay still resolves, so the assertions above tested the guard and not a
  // permanently broken parser.
  assert.ok(readTestEnvironmentOwnedKeys(overlay).length > 0);
});

test('a value that is not a setting key is rejected instead of becoming a key', () => {
  assert.throws(
    () =>
      readTestEnvironmentOwnedKeys(
        `DELETE FROM public.system_settings WHERE key IN ('https://test.bersoncare.ru');
         INSERT INTO public.system_settings (key) VALUES ('app_base_url', 'admin') ON CONFLICT x;
         UPDATE public.system_settings SET a = 1 WHERE key = 'dev_mode';
         locked_keys TEXT[] := ARRAY['patient_app_maintenance_enabled'];`,
      ),
    /not a setting key/u,
  );
});

test('the CLI emits sorted, unique, value-free key names and nothing else', () => {
  const devOwned = runPolicy('--dev-owned-keys');
  assert.equal(devOwned.status, 0, devOwned.stderr);
  const keys = devOwned.stdout.trim().split('\n');
  assert.ok(keys.length > 10);
  assert.deepEqual(keys, [...new Set(keys)], 'CLI emitted a duplicate key');
  assert.deepEqual(keys, [...keys].sort(), 'CLI output is not sorted');
  for (const key of keys) assert.match(key, SETTING_KEY_RE);

  const registry = runPolicy('--registry-keys');
  assert.equal(registry.status, 0, registry.stderr);
  const registryKeys = registry.stdout.trim().split('\n');
  for (const key of registryKeys) assert.match(key, SETTING_KEY_RE);
  assert.ok(registryKeys.length > keys.length, 'registry must classify more keys than DEV owns');
});

test('the CLI refuses an unknown or missing mode instead of defaulting to one', () => {
  for (const args of [[], ['--all-keys'], ['--dev-owned-keys', '--registry-keys']]) {
    const result = runPolicy(...args);
    assert.equal(result.status, 2, `args ${JSON.stringify(args)} did not refuse`);
    assert.match(result.stderr, /usage:/u);
    assert.equal(result.stdout, '');
  }
});

test('--self-test passes on the committed registry and overlay', () => {
  const result = runPolicy('--self-test');
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /self-test: PASS/u);
});
