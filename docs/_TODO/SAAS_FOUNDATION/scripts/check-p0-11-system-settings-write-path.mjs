#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sourceTextIncludes } from './source-text-guard.mjs';

const repoRoot = process.cwd();

const files = {
  ports: 'apps/webapp/src/modules/system-settings/ports.ts',
  service: 'apps/webapp/src/modules/system-settings/service.ts',
  webappRepo: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  migration: 'apps/webapp/db/drizzle-migrations/0164_p0_11_3_system_settings_audit_org.sql',
  journal: 'apps/webapp/db/drizzle-migrations/meta/_journal.json',
};

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function assertContains(name, text, needle) {
  if (!sourceTextIncludes(text, needle, name)) {
    throw new Error(`${name} missing required text: ${needle}`);
  }
}

function runChecks(overrides = {}) {
  const ports = overrides.ports ?? read(files.ports);
  const service = overrides.service ?? read(files.service);
  const webappRepo = overrides.webappRepo ?? read(files.webappRepo);
  const migration = overrides.migration ?? read(files.migration);
  const journal = overrides.journal ?? read(files.journal);

  assertContains(files.ports, ports, 'export type SystemSettingsWriteOptions');
  assertContains(files.ports, ports, 'organizationId?: string | null');
  assertContains(files.ports, ports, 'options?: SystemSettingsWriteOptions');
  assertContains(files.service, service, 'function resolveWriteOrganizationId(');
  assertContains(
    files.service,
    service,
    'const organizationId = options.organizationId?.trim() || null',
  );
  assertContains(files.service, service, 'organizationId: resolveWriteOrganizationId(r.key, options)');

  for (const needle of [
    'ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE',
    'ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE',
    'INSERT INTO system_settings_audit',
    '(key, scope, organization_id, old_value_json, new_value_json, changed_by, source)',
  ]) {
    assertContains(files.webappRepo, webappRepo, needle);
  }

  assertContains(
    files.migration,
    migration,
    'ALTER TABLE "public"."system_settings_audit" ADD COLUMN IF NOT EXISTS "organization_id" uuid;',
  );
  assertContains(
    files.migration,
    migration,
    'ADD CONSTRAINT "system_settings_audit_organization_id_fkey"',
  );
  assertContains(
    files.migration,
    migration,
    'CREATE INDEX IF NOT EXISTS "idx_system_settings_audit_org_key_at"',
  );
  assertContains(files.journal, journal, '"tag": "0164_p0_11_3_system_settings_audit_org"');
}

if (process.argv.includes('--self-test')) {
  const service = read(files.service).replace(
    'organizationId: resolveWriteOrganizationId(r.key, options)',
    'organizationId: null',
  );
  try {
    runChecks({ service });
  } catch {
    console.log('check-p0-11-system-settings-write-path self-test: OK');
    process.exit(0);
  }
  throw new Error('self-test did not detect missing write organizationId');
}

try {
  runChecks();
  console.log('check-p0-11-system-settings-write-path: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-11-system-settings-write-path: ${message}`);
  process.exit(1);
}
