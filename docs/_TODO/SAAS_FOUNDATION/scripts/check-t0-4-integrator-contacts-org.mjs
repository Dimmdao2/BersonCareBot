#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

const files = {
  channelUsers: 'apps/integrator/src/infra/db/repos/channelUsers.ts',
  channelUsersTest: 'apps/integrator/src/infra/db/repos/channelUsers.test.ts',
};

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function assertContains(name, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${name} missing required text: ${needle}`);
  }
}

function runChecks(overrides = {}) {
  const channelUsers = overrides.channelUsers ?? read(files.channelUsers);
  const channelUsersTest = overrides.channelUsersTest ?? read(files.channelUsersTest);

  for (const needle of [
    'function organizationIdForIntegratorUserSql',
    'getCurrentOrganizationPrincipalId() ?? null',
    'public.platform_users platform_user',
    'public.org_enrollments',
    'public.be_organization_members',
    'count(DISTINCT active_user_orgs.organization_id) = 1',
    'INSERT INTO contacts (user_id, type, value_normalized, label, is_primary, organization_id',
    'organization_id = COALESCE(EXCLUDED.organization_id, contacts.organization_id)',
  ]) {
    assertContains(files.channelUsers, channelUsers, needle);
  }

  for (const needle of [
    'setUserPhone writes canonical contact only',
    'public.org_enrollments',
    'public.be_organization_members',
    'organization_id = COALESCE(EXCLUDED.organization_id, contacts.organization_id)',
  ]) {
    assertContains(files.channelUsersTest, channelUsersTest, needle);
  }
}

if (process.argv.includes('--self-test')) {
  const channelUsers = read(files.channelUsers).replace(
    'INSERT INTO contacts (user_id, type, value_normalized, label, is_primary, organization_id',
    'INSERT INTO contacts (user_id, type, value_normalized, label, is_primary',
  );
  try {
    runChecks({ channelUsers });
  } catch {
    console.log('check-t0-4-integrator-contacts-org self-test: OK');
    process.exit(0);
  }
  throw new Error('self-test did not detect missing contacts organization_id insert column');
}

try {
  runChecks();
  console.log('check-t0-4-integrator-contacts-org: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-t0-4-integrator-contacts-org: ${message}`);
  process.exit(1);
}
