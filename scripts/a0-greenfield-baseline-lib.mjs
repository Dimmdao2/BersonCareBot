#!/usr/bin/env node

import crypto from 'node:crypto';
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

const credentialPatterns = Object.freeze([
  /postgres(?:ql)?:\/\/[^\s'";]+/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b[0-9]{6,}:[A-Za-z0-9_-]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u,
]);
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const quotedPhonePattern = /['"]\+[1-9][0-9]{9,14}['"]/u;

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  if (quotedPhonePattern.test(text)) failures.push('phone_literal_forbidden');
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
  const allowedPolicyRoles = new Set([BASELINE_OWNER_ROLE, 'app_patient', 'app_staff']);
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
        entries: discoverIntegratorMigrations(),
      },
      drizzle: {
        table: 'drizzle.__drizzle_migrations',
        entries: discoverDrizzleMigrations(),
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

  const currentIntegrator = discoverIntegratorMigrations();
  const currentDrizzle = discoverDrizzleMigrations();
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
