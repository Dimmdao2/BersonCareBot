#!/usr/bin/env node
/**
 * DEV-owned `public.system_settings` selection policy for the owner-gated TEST -> DEV refresh.
 *
 * The refresh copies accepted TEST product data into DEV. Environment-owned rows must NOT ride
 * along: TEST provider delivery credentials, TEST OAuth redirect targets, TEST channel/test-account
 * allowlists and the TEST environment identity belong to TEST only. This module answers exactly one
 * question -- "which setting keys are environment-owned, i.e. DEV keeps its own row" -- and it
 * answers it from contracts that already exist, so no second hand-maintained secret list can drift:
 *
 *   1. `apps/webapp/src/modules/system-settings/registry.ts` (S5-0 registry, the only key registry)
 *      classifies every product key. `storage: 'restricted'` is the server-only class that carries
 *      every secret envelope, provider credential, OAuth redirect target and identity allowlist.
 *      `RESTRICTED_SYSTEM_SETTING_KEYS` is read straight off the registry -- not re-listed here.
 *   2. `deploy/postgres/test-settings-override.sql` is the TEST deploy's own environment overlay.
 *      Every key it deletes, inserts, updates or locks is by construction TEST environment policy
 *      (environment identity, maintenance lock, TEST-account/diagnostic keys). Those keys are read
 *      out of that file, not copied into a list here.
 *
 * A third rule cannot be resolved statically and is applied in SQL by the capture/restore pair:
 * any key present in the database but absent from the registry is not classified product state,
 * so DEV keeps its own row. The registry's full key list is exported here for that comparison.
 *
 * Key NAMES are repository-public identifiers and are safe to print. Values are never read here.
 *
 * Usage:
 *   node deploy/host/dev-owned-settings-policy.mjs --dev-owned-keys   # sorted, one per line
 *   node deploy/host/dev-owned-settings-policy.mjs --registry-keys    # sorted, one per line
 *   node deploy/host/dev-owned-settings-policy.mjs --summary          # counts only
 *   node deploy/host/dev-owned-settings-policy.mjs --self-test        # contract invariants
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const webappSrc = resolve(repoRoot, 'apps/webapp/src');
const registryPath = resolve(webappSrc, 'modules/system-settings/registry.ts');
const testEnvOverlayPath = resolve(repoRoot, 'deploy/postgres/test-settings-override.sql');

const SETTING_KEY_RE = /^[a-z][a-z0-9_]*(?::[a-z0-9_]+)*$/u;

function fail(message) {
  throw new Error(`dev-owned-settings-policy: ${message}`);
}

function assertCanonicalFile(path, label) {
  let stats;
  try {
    stats = statSync(path, { throwIfNoEntry: true });
  } catch {
    fail(`${label} is missing: ${path}`);
  }
  if (!stats.isFile() || realpathSync(path) !== path) fail(`${label} path guard failed: ${path}`);
}

/**
 * The registry is ordinary webapp source and uses the `@/` path alias. Resolve that alias in
 * process instead of shipping a second copy of the key classification into deploy/.
 */
let aliasHookInstalled = false;
function installWebappAliasHook() {
  if (aliasHookInstalled) return;
  if (typeof registerHooks !== 'function') {
    fail('node:module registerHooks is unavailable; Node >= 22.15 is required to read the registry');
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@/')) {
        return {
          url: pathToFileURL(resolve(webappSrc, `${specifier.slice(2)}.ts`)).href,
          shortCircuit: true,
        };
      }
      return nextResolve(specifier, context);
    },
  });
  aliasHookInstalled = true;
}

export async function loadSettingRegistry() {
  assertCanonicalFile(registryPath, 'system settings registry');
  installWebappAliasHook();
  const module = await import(pathToFileURL(registryPath).href);
  const all = module.ALLOWED_KEYS;
  const restricted = module.RESTRICTED_SYSTEM_SETTING_KEYS;
  if (!Array.isArray(all) || all.length === 0) fail('registry exported no ALLOWED_KEYS');
  if (!Array.isArray(restricted) || restricted.length === 0) {
    fail('registry exported no RESTRICTED_SYSTEM_SETTING_KEYS');
  }
  for (const key of all) {
    if (typeof key !== 'string' || !SETTING_KEY_RE.test(key)) fail(`registry key is unusable: ${key}`);
  }
  return { registryKeys: all, restrictedKeys: restricted };
}

function quotedKeys(chunk, label) {
  const found = [...chunk.matchAll(/'([^']*)'/gu)].map((match) => match[1]);
  for (const key of found) {
    if (!SETTING_KEY_RE.test(key)) fail(`${label} yielded a value that is not a setting key: ${key}`);
  }
  return found;
}

/**
 * Read the TEST deploy's own environment overlay and return every key it owns. Each data-mutation
 * shapes below must still be found: a silently-empty extraction would quietly hand TEST environment
 * policy to DEV, so an unmatched shape is fatal rather than "no keys of that kind".
 */
export function readTestEnvironmentOwnedKeys(sqlText = null) {
  let sql = sqlText;
  if (sql === null) {
    assertCanonicalFile(testEnvOverlayPath, 'TEST settings override overlay');
    sql = readFileSync(testEnvOverlayPath, 'utf8');
  }
  const keys = new Set();
  const shapes = [
    {
      label: 'DELETE ... WHERE key IN (...)',
      collect() {
        const found = [];
        for (const match of sql.matchAll(
          /DELETE\s+FROM\s+public\.system_settings\s+WHERE\s+key\s+IN\s*\(([^)]*)\)/giu,
        )) {
          found.push(...quotedKeys(match[1], 'DELETE key list'));
        }
        return found;
      },
    },
    {
      label: 'INSERT INTO public.system_settings ... VALUES',
      collect() {
        const found = [];
        for (const match of sql.matchAll(
          /INSERT\s+INTO\s+public\.system_settings\s*\([^)]*\)\s*VALUES([\s\S]*?)ON\s+CONFLICT/giu,
        )) {
          for (const row of match[1].matchAll(/\(\s*'([^']+)'\s*,\s*'(?:global|doctor|admin)'/gu)) {
            if (!SETTING_KEY_RE.test(row[1])) fail(`INSERT row yielded a non-key: ${row[1]}`);
            found.push(row[1]);
          }
        }
        return found;
      },
    },
    {
      label: 'UPDATE public.system_settings ... WHERE key = ...',
      collect() {
        const found = [];
        for (const match of sql.matchAll(
          /UPDATE\s+public\.system_settings\s+SET[\s\S]*?WHERE\s+key\s*=\s*'([^']+)'/giu,
        )) {
          if (!SETTING_KEY_RE.test(match[1])) fail(`UPDATE yielded a non-key: ${match[1]}`);
          found.push(match[1]);
        }
        return found;
      },
    },
  ];
  for (const shape of shapes) {
    const found = shape.collect();
    if (found.length === 0) {
      fail(
        `the TEST environment overlay no longer matches its "${shape.label}" shape; ` +
          'refusing to hand TEST environment policy to DEV on a silent extraction',
      );
    }
    for (const key of found) keys.add(key);
  }
  return [...keys].sort();
}

export async function devOwnedSettingsPolicy() {
  const { registryKeys, restrictedKeys } = await loadSettingRegistry();
  const testEnvironmentOwnedKeys = readTestEnvironmentOwnedKeys();
  const devOwnedKeys = [...new Set([...restrictedKeys, ...testEnvironmentOwnedKeys])].sort();
  return {
    registryKeys: [...registryKeys].sort(),
    restrictedKeys: [...restrictedKeys].sort(),
    testEnvironmentOwnedKeys,
    devOwnedKeys,
  };
}

async function selfTest() {
  const policy = await devOwnedSettingsPolicy();
  const problems = [];
  if (policy.devOwnedKeys.length < policy.restrictedKeys.length) {
    problems.push('DEV-owned set lost restricted keys');
  }
  for (const key of policy.restrictedKeys) {
    if (!policy.devOwnedKeys.includes(key)) problems.push(`restricted key not DEV-owned: ${key}`);
  }
  for (const key of policy.testEnvironmentOwnedKeys) {
    if (!policy.devOwnedKeys.includes(key)) problems.push(`TEST env key not DEV-owned: ${key}`);
  }
  // A DEV-owned key that the registry classifies as ordinary runtime product state is expected
  // only when the TEST environment overlay itself owns it; anything else is a derivation bug.
  for (const key of policy.devOwnedKeys) {
    const knownRestricted = policy.restrictedKeys.includes(key);
    const knownTestEnv = policy.testEnvironmentOwnedKeys.includes(key);
    if (!knownRestricted && !knownTestEnv) problems.push(`DEV-owned key has no source: ${key}`);
  }
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `dev-owned-settings-policy self-test: PASS (registry=${policy.registryKeys.length} ` +
      `restricted=${policy.restrictedKeys.length} testEnv=${policy.testEnvironmentOwnedKeys.length} ` +
      `devOwned=${policy.devOwnedKeys.length})\n`,
  );
}

const MODES = new Set(['--dev-owned-keys', '--registry-keys', '--summary', '--self-test']);

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url).pathname)) {
  const mode = process.argv[2] ?? '';
  if (process.argv.length !== 3 || !MODES.has(mode)) {
    process.stderr.write(
      'usage: dev-owned-settings-policy.mjs --dev-owned-keys|--registry-keys|--summary|--self-test\n',
    );
    process.exit(2);
  }
  if (mode === '--self-test') {
    await selfTest();
  } else {
    const policy = await devOwnedSettingsPolicy();
    if (mode === '--dev-owned-keys') process.stdout.write(`${policy.devOwnedKeys.join('\n')}\n`);
    else if (mode === '--registry-keys') process.stdout.write(`${policy.registryKeys.join('\n')}\n`);
    else {
      process.stdout.write(
        `registry=${policy.registryKeys.length} restricted=${policy.restrictedKeys.length} ` +
          `testEnv=${policy.testEnvironmentOwnedKeys.length} devOwned=${policy.devOwnedKeys.length}\n`,
      );
    }
  }
}
