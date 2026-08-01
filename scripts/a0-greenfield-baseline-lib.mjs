#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, '..');
export const packageDir = path.join(repoRoot, 'docs', 'ARCHITECTURE', 'DB_DUMPS', 'a0-greenfield');
export const schemaPath = path.join(packageDir, 'schema.sql');
export const seedPath = path.join(packageDir, 'seed.sql');
export const manifestPath = path.join(packageDir, 'migration-manifest.json');

export const BASELINE_OWNER_ROLE = 'bcb_a0_owner';
export const EXPECTED_SCHEMAS = Object.freeze([
  'app',
  'app_ext',
  'drizzle',
  'integrator',
  'public',
]);
export const EXPECTED_EXTENSIONS = Object.freeze(['btree_gist', 'pgcrypto']);
export const SAFE_OPERATOR_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
export const TRUSTED_POSTGRES_ROOT = '/usr/lib/postgresql';
export const EXPECTED_NORMALIZED_ROLE_OCCURRENCES = 6;
export const REFRESH_SOURCE_PATHS = Object.freeze([
  'apps/integrator/src/infra/db/migrations/core',
  'apps/integrator/src/integrations',
  'apps/webapp/db/drizzle-migrations',
  'docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/seed.sql',
  'scripts/a0-greenfield-baseline-lib.mjs',
  'scripts/refresh-a0-greenfield-baseline.mjs',
]);

const credentialPatterns = Object.freeze([
  /postgres(?:ql)?:\/\/[^\s'";]+/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b[0-9]{6,}:[A-Za-z0-9_-]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u,
]);
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const quotedPhonePattern = /['"]\+[1-9][0-9]{9,14}['"]/u;

// Repo-wide sentinel for a placeholder booking, never a real person's phone number — same
// constant as apps/webapp/src/infra/repos/pgAnalyticsAudience.ts
// ALWAYS_EXCLUDED_ANALYTICS_PHONES and apps/webapp/scripts/purge-placeholder-bookings.ts
// PHONES ("БЛОК ОКНА" calendar block-window placeholder). It reaches the schema dump via
// app.is_platform_registration_analytics_user_excluded()
// (apps/webapp/db/drizzle-migrations/0261_platform_registration_events_read.sql).
const SCHEMA_PLACEHOLDER_PHONE_LITERALS = new Set(['+70000000000']);

function findSchemaPhoneLiteral(text) {
  const globalQuotedPhonePattern = new RegExp(quotedPhonePattern.source, 'gu');
  for (const match of text.matchAll(globalQuotedPhonePattern)) {
    const digits = match[0].slice(1, -1);
    if (!SCHEMA_PLACEHOLDER_PHONE_LITERALS.has(digits)) return digits;
  }
  return null;
}

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runGit(args, { root = repoRoot, encoding = 'utf8' } = {}) {
  const result = spawnSync('/usr/bin/git', args, {
    cwd: root,
    encoding,
    env: { PATH: SAFE_OPERATOR_PATH, LANG: 'C.UTF-8' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git_failed:${args[0]}`);
  return result.stdout;
}

function readGitFile(commit, filePath, root = repoRoot) {
  return runGit(['show', `${commit}:${filePath}`], { root, encoding: null });
}

function listGitFiles(commit, paths, root = repoRoot) {
  return String(runGit(['ls-tree', '-r', '--name-only', commit, '--', ...paths], { root }))
    .trim()
    .split('\n')
    .filter(Boolean);
}

export function assertCleanRefreshSource(root = repoRoot) {
  const status = String(
    runGit(['status', '--porcelain=v1', '--untracked-files=all', '--', ...REFRESH_SOURCE_PATHS], {
      root,
    }),
  ).trim();
  if (status) throw new Error('refresh_source_worktree_dirty');
}

export function assertTrustedRootOwnedBinary(binaryPath) {
  const absolute = path.resolve(binaryPath);
  const trustedPrefix = `${TRUSTED_POSTGRES_ROOT}${path.sep}`;
  if (!absolute.startsWith(trustedPrefix))
    throw new Error(`postgres_binary_outside_trusted_root:${absolute}`);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`postgres_binary_not_regular:${absolute}`);
  if (fs.realpathSync(absolute) !== absolute)
    throw new Error(`postgres_binary_not_canonical:${absolute}`);
  if (stat.uid !== 0) throw new Error(`postgres_binary_not_root_owned:${absolute}`);
  if ((stat.mode & 0o022) !== 0) throw new Error(`postgres_binary_writable_by_nonroot:${absolute}`);
  return absolute;
}

export function resolveTrustedPostgresBinaries(requiredNames) {
  const versions = fs
    .readdirSync(TRUSTED_POSTGRES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+(?:\.\d+)*$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = Object.fromEntries(
      requiredNames.map((name) => [name, path.join(TRUSTED_POSTGRES_ROOT, version, 'bin', name)]),
    );
    try {
      for (const binary of Object.values(candidate)) assertTrustedRootOwnedBinary(binary);
      return candidate;
    } catch {
      // A partial/unsafe installation is not eligible; continue to the next complete version.
    }
  }
  throw new Error(`trusted_postgres_toolchain_missing:${requiredNames.join(',')}`);
}

function isMigrationFile(name) {
  return name.endsWith('.sql') && !name.toLowerCase().includes('example');
}

export function discoverIntegratorMigrations(root = repoRoot) {
  const result = [];
  const coreDir = path.join(root, 'apps', 'integrator', 'src', 'infra', 'db', 'migrations', 'core');
  for (const fileName of fs.readdirSync(coreDir).filter(isMigrationFile).sort()) {
    result.push({ scope: 'core', fileName, filePath: path.join(coreDir, fileName) });
  }

  const integrationsRoot = path.join(root, 'apps', 'integrator', 'src', 'integrations');
  const integrationNames = fs
    .readdirSync(integrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const scope of integrationNames) {
    const migrationsDir = path.join(integrationsRoot, scope, 'db', 'migrations');
    if (!fs.existsSync(migrationsDir)) continue;
    for (const fileName of fs.readdirSync(migrationsDir).filter(isMigrationFile).sort()) {
      result.push({ scope, fileName, filePath: path.join(migrationsDir, fileName) });
    }
  }

  // Must match apps/integrator/src/infra/db/migrate.ts discoverMigrations(): stable filename sort.
  result.sort((left, right) => left.fileName.localeCompare(right.fileName));
  return result.map((entry) => ({
    scope: entry.scope,
    fileName: entry.fileName,
    version: `${entry.scope}:${entry.fileName}`,
    path: path.relative(root, entry.filePath),
    sha256: sha256(fs.readFileSync(entry.filePath)),
  }));
}

export function discoverDrizzleMigrations(root = repoRoot) {
  const migrationDir = path.join(root, 'apps', 'webapp', 'db', 'drizzle-migrations');
  const journal = readJson(path.join(migrationDir, 'meta', '_journal.json'));
  if (!Array.isArray(journal.entries)) throw new Error('drizzle_journal_entries_missing');
  return journal.entries.map((entry, arrayIndex) => {
    if (entry.idx !== arrayIndex) throw new Error(`drizzle_journal_idx_mismatch:${entry.tag}`);
    const filePath = path.join(migrationDir, `${entry.tag}.sql`);
    if (!fs.existsSync(filePath)) throw new Error(`drizzle_sql_missing:${entry.tag}`);
    return {
      idx: entry.idx,
      tag: entry.tag,
      when: entry.when,
      path: path.relative(root, filePath),
      sha256: sha256(fs.readFileSync(filePath)),
    };
  });
}

export function discoverIntegratorMigrationsAtCommit(commit, root = repoRoot) {
  runGit(['cat-file', '-e', `${commit}^{commit}`], { root });
  const corePrefix = 'apps/integrator/src/infra/db/migrations/core/';
  const integrationPattern =
    /^apps\/integrator\/src\/integrations\/([^/]+)\/db\/migrations\/([^/]+\.sql)$/u;
  const entries = [];
  for (const filePath of listGitFiles(
    commit,
    ['apps/integrator/src/infra/db/migrations/core', 'apps/integrator/src/integrations'],
    root,
  )) {
    const fileName = path.posix.basename(filePath);
    if (!isMigrationFile(fileName)) continue;
    let scope;
    if (filePath.startsWith(corePrefix)) scope = 'core';
    else scope = filePath.match(integrationPattern)?.[1];
    if (!scope) continue;
    entries.push({ scope, fileName, filePath });
  }
  entries.sort((left, right) => left.fileName.localeCompare(right.fileName));
  return entries.map((entry) => ({
    scope: entry.scope,
    fileName: entry.fileName,
    version: `${entry.scope}:${entry.fileName}`,
    path: entry.filePath,
    sha256: sha256(readGitFile(commit, entry.filePath, root)),
  }));
}

export function discoverDrizzleMigrationsAtCommit(commit, root = repoRoot) {
  runGit(['cat-file', '-e', `${commit}^{commit}`], { root });
  const migrationDir = 'apps/webapp/db/drizzle-migrations';
  const journal = JSON.parse(
    String(readGitFile(commit, `${migrationDir}/meta/_journal.json`, root)),
  );
  if (!Array.isArray(journal.entries)) throw new Error('drizzle_journal_entries_missing');
  return journal.entries.map((entry, arrayIndex) => {
    if (entry.idx !== arrayIndex) throw new Error(`drizzle_journal_idx_mismatch:${entry.tag}`);
    const filePath = `${migrationDir}/${entry.tag}.sql`;
    return {
      idx: entry.idx,
      tag: entry.tag,
      when: entry.when,
      path: filePath,
      sha256: sha256(readGitFile(commit, filePath, root)),
    };
  });
}

export function normalizeA0Dump(raw, sourceRole) {
  let restrictCount = 0;
  let unrestrictCount = 0;
  let normalized = raw.replace(/^\\restrict [^\r\n]+$/mu, () => {
    restrictCount += 1;
    return '\\restrict bcb_a0_schema_only';
  });
  normalized = normalized.replace(/^\\unrestrict [^\r\n]+$/mu, () => {
    unrestrictCount += 1;
    return '\\unrestrict bcb_a0_schema_only';
  });
  if (restrictCount !== 1 || unrestrictCount !== 1)
    throw new Error('pg_dump_restrict_shape_changed');

  const escapedRole = sourceRole.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const rolePattern = new RegExp(`\\b${escapedRole}\\b`, 'gu');
  const policyPattern =
    /^CREATE POLICY reference_catalog_seed_owner ON public\.(reference_categories|reference_items) .+?;$/gmsu;
  const policies = [...normalized.matchAll(policyPattern)];
  if (policies.length !== 2) throw new Error('reference_catalog_policy_shape_changed');
  let normalizedRoleOccurrences = 0;
  for (const match of policies) {
    const statement = match[0];
    const roleMatches = statement.match(rolePattern) ?? [];
    const expectedCurrentUser = `CURRENT_USER = '${sourceRole}'::name`;
    if (
      roleMatches.length !== 3 ||
      !statement.includes(` TO ${sourceRole} `) ||
      statement.split(expectedCurrentUser).length - 1 !== 2
    ) {
      throw new Error(`reference_catalog_policy_role_shape_changed:${match[1]}`);
    }
    normalizedRoleOccurrences += roleMatches.length;
  }
  if (normalizedRoleOccurrences !== EXPECTED_NORMALIZED_ROLE_OCCURRENCES) {
    throw new Error('reference_catalog_policy_role_count_changed');
  }
  const outsidePolicies = normalized.replace(policyPattern, '');
  if (rolePattern.test(outsidePolicies)) throw new Error('source_role_outside_known_policies');
  normalized = normalized.replace(policyPattern, (statement) =>
    statement.replace(rolePattern, BASELINE_OWNER_ROLE),
  );
  return { normalized: `${normalized.trimEnd()}\n`, normalizedRoleOccurrences };
}

function matchesInOrder(manifestEntries, currentEntries, identity, fields, label) {
  if (manifestEntries.length > currentEntries.length) {
    throw new Error(`${label}_manifest_longer_than_repository`);
  }
  for (let index = 0; index < manifestEntries.length; index += 1) {
    const manifestEntry = manifestEntries[index];
    const currentEntry = currentEntries[index];
    if (identity(manifestEntry) !== identity(currentEntry)) {
      throw new Error(`${label}_non_prefix_at:${index}`);
    }
    if (manifestEntry.sha256 !== currentEntry.sha256) {
      throw new Error(`${label}_historical_hash_drift:${identity(manifestEntry)}`);
    }
    for (const field of fields) {
      if (manifestEntry[field] !== currentEntry[field]) {
        throw new Error(`${label}_manifest_metadata_drift:${identity(manifestEntry)}:${field}`);
      }
    }
  }
}

function collectMatches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

export function scanSchemaArtifact(text) {
  const failures = [];
  if (!text.includes('-- PostgreSQL database dump')) failures.push('not_pg_dump_schema');
  if (!text.includes('-- PostgreSQL database dump complete'))
    failures.push('incomplete_pg_dump_schema');
  if (!text.includes('\\restrict bcb_a0_schema_only')) failures.push('missing_fixed_restrict');
  if (!text.includes('\\unrestrict bcb_a0_schema_only')) failures.push('missing_fixed_unrestrict');
  if (/^-- Data for Name:/mu.test(text) || /\bFROM stdin;$/mu.test(text) || /^\\\.$/mu.test(text)) {
    failures.push('data_section_forbidden');
  }
  if (/^(?:ALTER\s+.+\s+OWNER TO|GRANT\s|REVOKE\s|SET SESSION AUTHORIZATION)/mu.test(text)) {
    failures.push('owner_or_acl_forbidden');
  }
  if (/\bbcb_webapp_(?:dev|test|prod)(?:_user)?\b/iu.test(text))
    failures.push('runtime_identifier_forbidden');
  if (/\bbersoncarebot_(?:dev|test|prod)\b/iu.test(text))
    failures.push('environment_identifier_forbidden');
  if (emailPattern.test(text)) failures.push('email_literal_forbidden');
  if (findSchemaPhoneLiteral(text) !== null) failures.push('phone_literal_forbidden');
  if (credentialPatterns.some((pattern) => pattern.test(text)))
    failures.push('credential_shape_forbidden');

  const schemas = collectMatches(text, /^CREATE SCHEMA ([A-Za-z_][A-Za-z0-9_]*);$/gmu);
  // public is created by initdb and is intentionally not emitted by pg_dump.
  const effectiveSchemas = [...schemas, 'public'].sort();
  if (JSON.stringify(effectiveSchemas) !== JSON.stringify([...EXPECTED_SCHEMAS].sort())) {
    failures.push(`unexpected_schemas:${effectiveSchemas.join(',')}`);
  }
  const extensions = collectMatches(
    text,
    /^CREATE EXTENSION IF NOT EXISTS ([A-Za-z_][A-Za-z0-9_]*) WITH SCHEMA [A-Za-z_][A-Za-z0-9_]*;$/gmu,
  ).sort();
  if (JSON.stringify(extensions) !== JSON.stringify([...EXPECTED_EXTENSIONS].sort())) {
    failures.push(`unexpected_extensions:${extensions.join(',')}`);
  }

  const policyRoles = new Set();
  for (const match of text.matchAll(
    /^CREATE POLICY .+? ON .+?\bTO\s+([A-Za-z_][A-Za-z0-9_]*)\b/gmu,
  )) {
    policyRoles.add(match[1]);
  }
  const allowedPolicyRoles = new Set([
    BASELINE_OWNER_ROLE,
    'app_patient',
    'app_staff',
    // CREATE ROLE app_platform_settings — deploy/postgres/u9a-platform-settings-role.sql,
    // commit 7c9d94bea7 "feat(platform): add global settings principal spine" (2026-07-21).
    'app_platform_settings',
    // CREATE ROLE app_operational_web_push_reminder / app_web_push_reminder_discovery_definer —
    // deploy/postgres/c4-web-push-reminder-runtime.sql, commit 7ebda04181
    // "fix(saas): close owner-ready notification runtime gaps" (2026-07-17).
    'app_operational_web_push_reminder',
    'app_web_push_reminder_discovery_definer',
    // CREATE ROLE app_clinic_billing — deploy/postgres/c5a-platform-operations-runtime.sql,
    // commit 8efd156982 "fix(saas): close C5A quota trial and platform gates" (2026-07-21).
    'app_clinic_billing',
  ]);
  for (const role of policyRoles) {
    if (!allowedPolicyRoles.has(role)) failures.push(`unexpected_policy_role:${role}`);
  }

  return {
    failures,
    census: {
      tables: (text.match(/^CREATE TABLE /gmu) ?? []).length,
      functions: (text.match(/^CREATE FUNCTION /gmu) ?? []).length,
      policies: (text.match(/^CREATE POLICY /gmu) ?? []).length,
    },
    schemas: effectiveSchemas,
    extensions,
    policyRoles: [...policyRoles].sort(),
  };
}

export function scanSeedArtifact(text) {
  const failures = [];
  if (!text.includes('A0 PII-free deterministic migration-guard seed'))
    failures.push('seed_header_missing');
  if (!text.includes('@baseline.test')) failures.push('seed_test_identity_missing');
  if (quotedPhonePattern.test(text)) failures.push('seed_phone_forbidden');
  if (credentialPatterns.some((pattern) => pattern.test(text)))
    failures.push('seed_credential_shape_forbidden');
  const emails = text.match(new RegExp(emailPattern.source, 'giu')) ?? [];
  if (emails.some((email) => !email.toLowerCase().endsWith('@baseline.test'))) {
    failures.push('seed_non_test_email_forbidden');
  }
  const allowedTables = new Set([
    'reference_catalog_baselines',
    'be_organizations',
    'platform_users',
    'be_specialists',
    'be_organization_members',
    'be_appointments',
    'saas_org_entitlement_overrides',
  ]);
  for (const match of text.matchAll(/\bINSERT INTO public\.([A-Za-z_][A-Za-z0-9_]*)/gu)) {
    if (!allowedTables.has(match[1])) failures.push(`seed_table_forbidden:${match[1]}`);
  }
  return { failures, emails };
}

export function buildManifest({ schemaText, seedText, sourceCommit, generatedAt, pgDumpVersion }) {
  const schemaScan = scanSchemaArtifact(schemaText);
  if (schemaScan.failures.length > 0) throw new Error(schemaScan.failures.join('\n'));
  const seedScan = scanSeedArtifact(seedText);
  if (seedScan.failures.length > 0) throw new Error(seedScan.failures.join('\n'));
  return {
    formatVersion: 1,
    baseline: {
      sourceDatabase: 'bcb_webapp_dev',
      sourceCommit,
      generatedAt,
      pgDumpVersion,
      pgDumpMode: '--schema-only --no-owner --no-privileges --no-comments',
      schemaFile: 'schema.sql',
      schemaSha256: sha256(schemaText),
      seedFile: 'seed.sql',
      seedSha256: sha256(seedText),
      normalizedMigrationOwnerRole: BASELINE_OWNER_ROLE,
      schemas: schemaScan.schemas,
      extensions: schemaScan.extensions,
      census: schemaScan.census,
    },
    ledgers: {
      integrator: {
        table: 'integrator.schema_migrations',
        entries: discoverIntegratorMigrationsAtCommit(sourceCommit),
      },
      drizzle: {
        table: 'drizzle.__drizzle_migrations',
        entries: discoverDrizzleMigrationsAtCommit(sourceCommit),
      },
    },
  };
}

export function validatePackage({
  schemaFile = schemaPath,
  seedFile = seedPath,
  manifestFile = manifestPath,
} = {}) {
  const schemaText = fs.readFileSync(schemaFile, 'utf8');
  const seedText = fs.readFileSync(seedFile, 'utf8');
  const manifest = readJson(manifestFile);
  if (manifest.formatVersion !== 1) throw new Error('unsupported_manifest_format');
  if (!/^[0-9a-f]{40}$/u.test(manifest.baseline?.sourceCommit ?? '')) {
    throw new Error('invalid_source_commit');
  }
  if (manifest.baseline.schemaSha256 !== sha256(schemaText)) throw new Error('schema_hash_drift');
  if (manifest.baseline.seedSha256 !== sha256(seedText)) throw new Error('seed_hash_drift');
  if (manifest.baseline.normalizedMigrationOwnerRole !== BASELINE_OWNER_ROLE) {
    throw new Error('baseline_owner_role_drift');
  }
  if (
    manifest.baseline.schemaFile !== 'schema.sql' ||
    manifest.baseline.seedFile !== 'seed.sql' ||
    manifest.baseline.pgDumpMode !== '--schema-only --no-owner --no-privileges --no-comments'
  ) {
    throw new Error('baseline_contract_metadata_drift');
  }
  if (
    manifest.ledgers.integrator.table !== 'integrator.schema_migrations' ||
    manifest.ledgers.drizzle.table !== 'drizzle.__drizzle_migrations'
  ) {
    throw new Error('ledger_table_metadata_drift');
  }

  const schemaScan = scanSchemaArtifact(schemaText);
  if (schemaScan.failures.length > 0) throw new Error(schemaScan.failures.join('\n'));
  if (JSON.stringify(schemaScan.census) !== JSON.stringify(manifest.baseline.census)) {
    throw new Error('schema_census_drift');
  }
  const seedScan = scanSeedArtifact(seedText);
  if (seedScan.failures.length > 0) throw new Error(seedScan.failures.join('\n'));

  runGit(['merge-base', '--is-ancestor', manifest.baseline.sourceCommit, 'HEAD']);
  const sourceIntegrator = discoverIntegratorMigrationsAtCommit(manifest.baseline.sourceCommit);
  const sourceDrizzle = discoverDrizzleMigrationsAtCommit(manifest.baseline.sourceCommit);
  if (sourceIntegrator.length !== manifest.ledgers.integrator.entries.length)
    throw new Error('integrator_source_commit_manifest_length_drift');
  if (sourceDrizzle.length !== manifest.ledgers.drizzle.entries.length)
    throw new Error('drizzle_source_commit_manifest_length_drift');
  matchesInOrder(
    manifest.ledgers.integrator.entries,
    sourceIntegrator,
    (entry) => entry.version,
    ['scope', 'fileName', 'version', 'path', 'sha256'],
    'integrator_source_commit',
  );
  matchesInOrder(
    manifest.ledgers.drizzle.entries,
    sourceDrizzle,
    (entry) => entry.tag,
    ['idx', 'tag', 'when', 'path', 'sha256'],
    'drizzle_source_commit',
  );
  const headCommit = String(runGit(['rev-parse', 'HEAD'])).trim();
  const currentIntegrator = discoverIntegratorMigrationsAtCommit(headCommit);
  const currentDrizzle = discoverDrizzleMigrationsAtCommit(headCommit);
  matchesInOrder(
    manifest.ledgers.integrator.entries,
    currentIntegrator,
    (entry) => entry.version,
    ['scope', 'fileName', 'version', 'path', 'sha256'],
    'integrator',
  );
  matchesInOrder(
    manifest.ledgers.drizzle.entries,
    currentDrizzle,
    (entry) => entry.tag,
    ['idx', 'tag', 'when', 'path', 'sha256'],
    'drizzle',
  );
  return {
    manifest,
    schemaText,
    seedText,
    schemaScan,
    currentIntegrator,
    currentDrizzle,
    pending: {
      integrator: currentIntegrator.slice(manifest.ledgers.integrator.entries.length),
      drizzle: currentDrizzle.slice(manifest.ledgers.drizzle.entries.length),
    },
  };
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
