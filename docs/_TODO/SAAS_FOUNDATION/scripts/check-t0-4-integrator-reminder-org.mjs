#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

const files = {
  reminders: 'apps/integrator/src/infra/db/repos/reminders.ts',
  remindersTest: 'apps/integrator/src/infra/db/repos/reminders.orgContext.test.ts',
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
  const reminders = overrides.reminders ?? read(files.reminders);
  const remindersTest = overrides.remindersTest ?? read(files.remindersTest);

  for (const needle of [
    'function organizationIdForIntegratorUserSql',
    'getCurrentOrganizationPrincipalId() ?? null',
    'public.platform_users platform_user',
    'public.org_enrollments',
    'public.be_organization_members',
    'count(DISTINCT active_user_orgs.organization_id) = 1',
    'organizationId: organizationIdExpression',
    'organizationId: sql`COALESCE(${organizationIdExpression}, ${userReminderRules.organizationId})`',
    'SELECT organization_id FROM user_reminder_rules',
    'SELECT organization_id FROM user_reminder_occurrences',
  ]) {
    assertContains(files.reminders, reminders, needle);
  }

  for (const needle of [
    'reminders repo organization context writes',
    'stamps reminder rules from current principal with single active org fallback',
    'copies reminder occurrence and delivery-log organization from parent rows',
    'stamps content access grants from current principal with single active org fallback',
  ]) {
    assertContains(files.remindersTest, remindersTest, needle);
  }
}

if (process.argv.includes('--self-test')) {
  const reminders = read(files.reminders).replace(
    'getCurrentOrganizationPrincipalId() ?? null',
    'null',
  );
  try {
    runChecks({ reminders });
  } catch {
    console.log('check-t0-4-integrator-reminder-org self-test: OK');
    process.exit(0);
  }
  throw new Error('self-test did not detect missing reminder rule organization expression');
}

try {
  runChecks();
  console.log('check-t0-4-integrator-reminder-org: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-t0-4-integrator-reminder-org: ${message}`);
  process.exit(1);
}
