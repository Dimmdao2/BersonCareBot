#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../');

const forbiddenRuntimeFragments = [
  'mailing.topic.upserted',
  'user.subscription.upserted',
  'mailing.log.sent',
  'mailing.topic.upsert',
  'user.subscription.upsert',
  'mailing.log.append',
  'SubscriptionMailingProjection',
  'subscriptionMailingProjection',
  'mailing_topics_webapp',
  'user_subscriptions_webapp',
  'mailing_logs_webapp',
];

const forbiddenRuntimePaths = [
  'apps/integrator/src/infra/adapters/subscriptionMailingReadsPort.ts',
  'apps/integrator/src/infra/db/repos/mailingLogs.ts',
  'apps/integrator/src/infra/db/repos/subscriptions.ts',
  'apps/integrator/src/infra/db/repos/topics.ts',
  'apps/webapp/src/infra/repos/inMemorySubscriptionMailingProjection.ts',
  'apps/webapp/src/infra/repos/pgSubscriptionMailingProjection.ts',
  'apps/webapp/src/app/api/integrator/subscriptions/for-user/route.ts',
  'apps/webapp/src/app/api/integrator/subscriptions/topics/route.ts',
];

const retiredTables = [
  'public.mailing_logs_webapp',
  'public.user_subscriptions_webapp',
  'public.mailing_topics_webapp',
  'public.mailing_logs',
  'public.user_subscriptions',
  'public.mailings',
  'public.mailing_topics',
  'integrator.mailing_logs',
  'integrator.user_subscriptions',
  'integrator.mailings',
  'integrator.mailing_topics',
];

function runtimeFilesUnder(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const absolute = join(root, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...runtimeFilesUnder(absolute));
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/.test(entry) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry)) continue;
    files.push(absolute);
  }
  return files;
}

export function findD8RuntimeViolations(entries) {
  const violations = [];
  for (const entry of entries) {
    for (const fragment of forbiddenRuntimeFragments) {
      if (entry.content.includes(fragment)) {
        violations.push(`${entry.path}: contains retired D8 fragment "${fragment}"`);
      }
    }
    if (forbiddenRuntimePaths.includes(entry.path)) {
      violations.push(`${entry.path}: retired D8 runtime path exists`);
    }
  }
  return violations;
}

function currentRuntimeEntries() {
  const roots = ['apps/integrator/src', 'apps/webapp/src', 'apps/webapp/scripts'];
  return roots.flatMap((root) =>
    runtimeFilesUnder(join(repoRoot, root)).map((absolute) => ({
      path: relative(repoRoot, absolute),
      content: readFileSync(absolute, 'utf8'),
    })),
  );
}

function assertMigrationDropsRetiredTables() {
  const migrationPath = join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0275_retire_dead_mailing_domain.sql',
  );
  const migration = readFileSync(migrationPath, 'utf8');
  const missing = retiredTables.filter(
    (table) => !migration.includes(`DROP TABLE IF EXISTS ${table}`),
  );
  if (missing.length > 0) {
    throw new Error(`D8 migration does not drop: ${missing.join(', ')}`);
  }
  if (!migration.includes('D8 refuses to drop non-empty table')) {
    throw new Error('D8 migration is missing the non-empty-table refusal guard');
  }
}

function runSelfTest() {
  const faults = [
    {
      name: 'producer event',
      entry: { path: 'apps/integrator/src/fault.ts', content: "'mailing.topic.upserted'" },
    },
    {
      name: 'producer mutation',
      entry: { path: 'apps/integrator/src/fault.ts', content: "'mailing.log.append'" },
    },
    {
      name: 'consumer adapter',
      entry: {
        path: 'apps/webapp/src/fault.ts',
        content: 'const subscriptionMailingProjection = true;',
      },
    },
    {
      name: 'projection table',
      entry: { path: 'apps/webapp/src/fault.ts', content: "'mailing_logs_webapp'" },
    },
    {
      name: 'retired path',
      entry: {
        path: 'apps/integrator/src/infra/db/repos/topics.ts',
        content: 'export {};',
      },
    },
  ];

  for (const fault of faults) {
    const violations = findD8RuntimeViolations([fault.entry]);
    if (violations.length === 0) {
      throw new Error(`self-test failed to detect ${fault.name}`);
    }
  }
  console.log('check-d8-mailing-retirement: self-test OK');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const violations = findD8RuntimeViolations(currentRuntimeEntries());
  if (violations.length > 0) {
    console.error(violations.join('\n'));
    process.exit(1);
  }
  assertMigrationDropsRetiredTables();
  console.log('check-d8-mailing-retirement: OK');
}
