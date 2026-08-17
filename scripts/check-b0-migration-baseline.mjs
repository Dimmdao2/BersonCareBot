#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, relative as relativePath, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const webappMigrations = resolve(root, 'apps/webapp/db/drizzle-migrations');
const integratorRoot = resolve(root, 'apps/integrator/src');

function files(directory, suffix) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort();
}

function relative(path) {
  return path.slice(root.length + 1);
}

const webappSql = files(webappMigrations, '.sql').map(relative).sort();
const integratorSql = files(integratorRoot, '.sql')
  .filter((path) => path.includes('/db/migrations/'))
  .map(relative)
  .sort();
const webappBaseline = 'apps/webapp/db/drizzle-migrations/0000_b0_baseline.sql';
const integratorBaseline =
  'apps/integrator/src/infra/db/migrations/core/20260816_0000_b0_baseline.sql';
if (webappSql[0] !== webappBaseline || integratorSql[0] !== integratorBaseline) {
  throw new Error('the active migration roots must start at the canonical B0 baselines');
}
const invalidIntegratorForward = integratorSql.slice(1).filter((path) => {
  const name = path.split('/').at(-1) ?? '';
  return !/^20\d{6}_\d{4}_[a-z0-9_]+\.sql$/.test(name) || name <= '20260816_0000_b0_baseline.sql';
});
if (invalidIntegratorForward.length > 0) {
  throw new Error(
    `integrator migrations before/at B0 or with invalid names are forbidden: ${invalidIntegratorForward.join(',')}`,
  );
}

const legacySql = files(resolve(root, 'apps/webapp'), '.sql')
  .map(relative)
  .filter((path) => path.startsWith('apps/webapp/migrations/'));
if (legacySql.length > 0) {
  throw new Error(`legacy webapp migration SQL is forbidden: ${legacySql.join(',')}`);
}

const journal = JSON.parse(readFileSync(resolve(webappMigrations, 'meta/_journal.json'), 'utf8'));
const entries = journal.entries ?? [];
if (journal.version !== '7' || journal.dialect !== 'postgresql') {
  throw new Error('Drizzle journal header must remain canonical');
}
if (
  entries[0]?.idx !== 0 ||
  entries[0]?.when !== 1800000000000 ||
  entries[0]?.tag !== '0000_b0_baseline'
) {
  throw new Error('Drizzle journal must start at the canonical B0 marker');
}
for (const [index, entry] of entries.entries()) {
  if (
    entry.idx !== index ||
    !Number.isSafeInteger(entry.when) ||
    (index > 0 && entry.when <= entries[index - 1].when) ||
    !/^[0-9]{4}_[a-z0-9_]+$/.test(entry.tag)
  ) {
    throw new Error(`invalid post-B0 Drizzle journal entry at index=${index}`);
  }
}
const journalSql = entries.map(
  (entry) => `apps/webapp/db/drizzle-migrations/${entry.tag}.sql`,
);
if (JSON.stringify(webappSql) !== JSON.stringify(journalSql)) {
  throw new Error(
    `webapp migration SQL must match the B0-forward journal; files=${webappSql.join(',')}`,
  );
}

const journalIndexes = new Set(entries.map((entry) => entry.idx));
const invalidSnapshots = files(resolve(webappMigrations, 'meta'), '_snapshot.json')
  .map(relative)
  .filter((path) => {
    const match = path.match(/\/([0-9]{4})_snapshot\.json$/);
    return !match || !journalIndexes.has(Number(match[1]));
  });
if (invalidSnapshots.length > 0) {
  throw new Error(`pre-B0 or orphan Drizzle snapshots are forbidden: ${invalidSnapshots.join(',')}`);
}

// The maintained migration surface is B0 + forwards only. Inventory is repository-wide on purpose:
// an alternate DB executor is callable just as easily from tools/, a fourth workspace or CI as it is
// from scripts/. Archives are historical evidence and are the only non-routable exception.
const ignoredDirectoryNames = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);
const ignoredPathPrefixes = ['docs/archive/', '.cursor/plans/archive/'];
const callableExtension = /\.(?:sh|bash|mjs|mts|cjs|js|ts|tsx|sql|ya?ml)$/i;
const callableBasename = /^(?:Dockerfile(?:\..*)?|Makefile|Taskfile(?:\..*)?)$/i;

function repositoryFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    const rel = relativePath(root, absolute).replaceAll('\\', '/');
    if (ignoredPathPrefixes.some((prefix) => rel === prefix.slice(0, -1) || rel.startsWith(prefix))) {
      continue;
    }
    if (entry.isDirectory()) result.push(...repositoryFiles(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

const repositoryInventory = repositoryFiles(root);
const executableFiles = repositoryInventory.filter((path) => {
  const rel = relative(path);
  const mode = statSync(path).mode;
  return (
    callableExtension.test(path) ||
    callableBasename.test(basename(path)) ||
    basename(path) === 'package.json' ||
    (mode & 0o111) !== 0 ||
    /^\.github\/(?:workflows|actions)\//.test(rel)
  );
});
const forbiddenName =
  /(?:stage13|zero-state|prod-to-target|pre-migration-target-bridge|offline-legacy|a0-greenfield|disposable|(?:^|[-_:])a0(?:[-_.:]|$))/i;

// These are named DEV/TEST deployment ports. They may replay a reviewed declaration/overlay into
// an already-existing named database, but the allowlist never permits CREATE/DROP DATABASE,
// PostgreSQL server/container startup, scratch targets or historical migration executors.
const namedEnvironmentReplayPorts = new Set([
  'deploy/host/deploy-test.sh',
  'deploy/host/provision-c4-operational-runtime.sh',
  'deploy/host/provision-dev-saas-diagnostics.sh',
  'deploy/host/retire-media-db-login.sh',
  'deploy/host/run-u5a-patient-organization-test-lifecycle.sh',
  'deploy/postgres/privileges/migrate-local.mjs',
]);

function uncommentedShell(source) {
  return source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
    .replaceAll(/\\\r?\n/g, ' ');
}

function executableViolation(rel, source) {
  const extension = rel.split('.').at(-1)?.toLowerCase() ?? '';
  const isShellLike =
    ['sh', 'bash', 'yml', 'yaml'].includes(extension) ||
    callableBasename.test(basename(rel));
  const isJavaScriptLike = ['mjs', 'mts', 'cjs', 'js', 'ts', 'tsx'].includes(extension);
  const isSql = extension === 'sql';
  const shell = isShellLike ? uncommentedShell(source) : '';

  const databaseUtilityInShell =
    /(?:^|[;&|]\s*|\brun:\s*|\bcommand\s+|\bexec\s+|\bsudo(?:\s+-\S+)*\s+)(?:initdb|createdb|dropdb|pg_ctl)\b/im.test(
      shell,
    );
  const databaseUtilityInChildProcess = isJavaScriptLike &&
    /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"`](?:initdb|createdb|dropdb|pg_ctl)['"`]/i.test(
      source,
    );
  const databaseUtilityInShellChild = isJavaScriptLike &&
    /\b(?:exec|execSync)\s*\(\s*['"`][\s\S]{0,300}?\b(?:initdb|createdb|dropdb|pg_ctl)\b/i.test(
      source,
    );
  if (databaseUtilityInShell || databaseUtilityInChildProcess || databaseUtilityInShellChild) {
    return 'database create/drop/server utility';
  }

  if (isSql && /\b(?:create|drop)\s+database\b/i.test(source)) {
    return 'CREATE/DROP DATABASE SQL';
  }

  const postgresContainer =
    /(?:\bimage\s*:\s*|\bdocker\s+(?:run|create)\b[^\n]*?)['"]?(?:postgres|postgresql)(?::[A-Za-z0-9._-]+)?(?=[\s'"\\]|$)/i;
  if ((isShellLike && postgresContainer.test(shell)) || (isJavaScriptLike && postgresContainer.test(source))) {
    return 'PostgreSQL container/server';
  }

  const shellReplay = isShellLike &&
    /(?:^|[;&|(\s])(?:sudo(?:\s+-\S+)*\s+)?psql\b[^\n]*(?:\s(?:-f|--file(?:=|\s))\s*|<\s*(?![<>&])|<<\s*['"]?SQL\b)/im.test(shell);
  const childReplay = isJavaScriptLike &&
    /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"`]psql['"`][\s\S]{0,800}?(?:['"`](?:-f|--file)['"`]|['"`]\\\\i(?:\s|['"`]))/i.test(
      source,
    );
  const shellChildReplay = isJavaScriptLike &&
    /\b(?:exec|execSync)\s*\(\s*['"`][\s\S]{0,800}?\bpsql\b[\s\S]{0,500}?(?:\s(?:-f|--file(?:=|\s))\s*|<\s*(?![<&])|\\\\i\s)/i.test(
      source,
    );
  const sqlIncludeReplay = isSql && /^\s*\\i\s+\S+/im.test(source);
  if (
    (shellReplay || childReplay || shellChildReplay || sqlIncludeReplay) &&
    !namedEnvironmentReplayPorts.has(rel)
  ) {
    return 'psql file/stdin replay outside a named-environment port';
  }
  return null;
}

const gateFiles = new Set([
  'scripts/check-b0-migration-baseline.mjs',
  'scripts/check-b0-migration-baseline.audit.test.mjs',
]);
const alternateExecutors = executableFiles.flatMap((path) => {
  const rel = relative(path);
  if (gateFiles.has(rel)) return [];
  if (forbiddenName.test(rel)) return [`${rel} (forbidden executor name)`];
  const source = readFileSync(path, 'utf8');
  const violation = executableViolation(rel, source);
  return violation ? [`${rel} (${violation})`] : [];
});
if (alternateExecutors.length > 0) {
  throw new Error(
    `B0 checkout contains an alternate executable migration path: ${alternateExecutors.join(', ')}`,
  );
}

const activeManifests = repositoryInventory.filter((path) => basename(path) === 'package.json');
const forbiddenManifestCommands = activeManifests.flatMap((path) => {
  const scripts = JSON.parse(readFileSync(path, 'utf8')).scripts ?? {};
  return Object.entries(scripts)
    .filter(([name, command]) =>
      forbiddenName.test(name) ||
      /\bA0\b|a0-greenfield|offline-legacy|disposable|SCRATCH_DATABASE_URL|vitest\.postgres|postgres-integration/i.test(String(command)) ||
      /(?:^|[;&|]\s*|\bcommand\s+|\bexec\s+|\bsudo(?:\s+-\S+)*\s+)(?:initdb|createdb|dropdb|pg_ctl)\b/i.test(String(command)) ||
      /\bpsql\b[^\n]*(?:\s(?:-f|--file(?:=|\s))\s*|<\s*(?![<&]))/i.test(String(command)) ||
      /\bdocker\s+(?:run|create)\b[^\n]*\b(?:postgres|postgresql)(?::[A-Za-z0-9._-]+)?\b/i.test(String(command)),
    )
    .map(([name]) => `${relative(path)}#scripts.${name}`);
});
if (forbiddenManifestCommands.length > 0) {
  throw new Error(
    `B0 checkout exposes a retired database command: ${forbiddenManifestCommands.join(', ')}`,
  );
}

const retiredExecutableReference =
  /apps\/webapp\/scripts\/postgres-integration\/(?:cli|harness-lib)\.ts|apps\/webapp\/vitest\.postgres\.(?:config|globalSetup|setup)\.ts|docs\/_TODO\/SAAS_FOUNDATION\/scripts\/smoke-p0-8-3-direct-org-policies\.mjs|deploy\/postgres\/port-context\/acceptance\.sh/;
const retiredDocReferences = repositoryInventory
  .filter((path) => relative(path).startsWith('docs/') && path.endsWith('.md'))
  .filter((path) => retiredExecutableReference.test(readFileSync(path, 'utf8')))
  .map(relative);
if (retiredDocReferences.length > 0) {
  throw new Error(
    `active documentation references a retired database executor: ${retiredDocReferences.join(', ')}`,
  );
}

console.log(
  `check-b0-migration-baseline: OK (B0 roots + ${entries.length - 1} webapp and ${integratorSql.length - 1} integrator forward migrations; no legacy chain)`,
);
