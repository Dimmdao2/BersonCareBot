import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  JOURNAL_LIFECYCLE_EXTRA_CANDIDATES,
  JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS,
  JOURNAL_LIFECYCLE_REGISTRY,
  JOURNAL_LIFECYCLE_TABLE_SUFFIXES,
} from '../../../../../deploy/postgres/privileges/journal-lifecycle-registry';
import { RETENTION_SWEEP_TARGETS } from '@/infra/db/pruneRetentionTarget';
import { CRON_JOB_REGISTRY } from '@/modules/operator-health/cronJobRegistry';

/**
 * WHAT BREAKS WITHOUT THIS: a new journal/queue/temp table is declared, migrated and wired to a live
 * writer while belonging to no retention policy, no purge path and no sweep — exactly how
 * `message_log` and the consolidated `reminder_occurrence_history` reached the systemic audit of
 * 2026-08-27 (§E1, §C3). Nothing in lint, typecheck, the privilege generator or the migration gate
 * looks at data lifecycle, so the omission is invisible until someone measures the database.
 *
 * ORACLE: `deploy/postgres/privileges/declaration.ts` — the independent artifact that must list every
 * physical table before its migration may exist. This test never derives the candidate set from the
 * registry it is checking.
 */

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');

async function declaredTables(): Promise<string[]> {
  const cwd = process.cwd();
  process.chdir(REPO_ROOT);
  try {
    const mod = (await import(
      pathToFileURL(path.join(REPO_ROOT, 'deploy/postgres/privileges/declaration.ts')).href
    )) as { declaration: { databases: Record<string, { tables: Record<string, unknown> }> } };
    // Every managed database declares the same physical table set; take the union so a table added
    // to only one of them still needs a lifecycle decision.
    const union = new Set<string>();
    for (const db of Object.values(mod.declaration.databases)) {
      for (const table of Object.keys(db.tables ?? {})) union.add(table);
    }
    return [...union];
  } finally {
    process.chdir(cwd);
  }
}

function isLifecycleCandidate(table: string): boolean {
  if (JOURNAL_LIFECYCLE_EXTRA_CANDIDATES.includes(table)) return true;
  return JOURNAL_LIFECYCLE_TABLE_SUFFIXES.some((suffix) => table.endsWith(suffix));
}

it('leaves no declared journal/queue/temp table without a written lifecycle decision', async () => {
  const registered = new Set(JOURNAL_LIFECYCLE_REGISTRY.map((entry) => entry.table));
  const excluded = new Set(Object.keys(JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS));

  const undecided = (await declaredTables())
    .filter(isLifecycleCandidate)
    .filter((table) => !registered.has(table) && !excluded.has(table));

  expect(
    undecided,
    'Every journal/queue/attempt/temp store needs a lifecycle entry (owner, purge key, terminal ' +
      'states, retention decision, prune root, sweeping job) in journalLifecycleRegistry.ts — or an ' +
      'explicit "this is not a journal" line with a reason in ' +
      'JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS.',
  ).toEqual([]);
});

it('keeps the registry itself honest: no entry may leave a required lifecycle fact empty', () => {
  const incomplete = JOURNAL_LIFECYCLE_REGISTRY.filter(
    (entry) =>
      entry.table.trim() === '' ||
      entry.why.trim() === '' ||
      entry.retention === undefined ||
      ('basis' in entry.retention && entry.retention.basis.trim() === ''),
  ).map((entry) => entry.table);

  expect(incomplete).toEqual([]);
});

it('registers no table twice and never contradicts itself with a non-journal decision', () => {
  const seen = new Map<string, number>();
  for (const entry of JOURNAL_LIFECYCLE_REGISTRY) {
    seen.set(entry.table, (seen.get(entry.table) ?? 0) + 1);
  }
  expect([...seen.entries()].filter(([, n]) => n > 1).map(([t]) => t)).toEqual([]);

  const contradicted = JOURNAL_LIFECYCLE_REGISTRY.map((e) => e.table).filter(
    (table) => table in JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS,
  );
  expect(contradicted).toEqual([]);
});

it('makes every decided retention window executable: named prune target plus a sweeping job', () => {
  const sweepTargets = new Set<string>(RETENTION_SWEEP_TARGETS);
  const cronJobKeys = new Set(CRON_JOB_REGISTRY.map((job) => job.jobKey));

  const unexecutable = JOURNAL_LIFECYCLE_REGISTRY.filter(
    (entry) => entry.retention.kind === 'window',
  )
    .filter((entry) => {
      const target = (entry.retention as { pruneTarget: string }).pruneTarget;
      // A target label of the ONE closed-list root must really be in that list; roots outside it
      // (product analytics, media, the operator archive) name themselves and only need a sweep job.
      const rootOk = sweepTargets.has(target) || target.includes('.') || target.includes(':');
      const sweepOk = entry.sweptBy !== null && cronJobKeys.has(entry.sweptBy);
      return !rootOk || !sweepOk;
    })
    .map((entry) => entry.table);

  expect(
    unexecutable,
    'A retention window with no reachable prune root or no registered sweeping job is a policy that ' +
      'never runs — audit §B2, where declared retention had no alarm clock.',
  ).toEqual([]);
});

it('does not let an open owner question hide as a silent gap', () => {
  const openQuestions = JOURNAL_LIFECYCLE_REGISTRY.filter(
    (entry) => entry.retention.kind === 'owner-question',
  );
  for (const entry of openQuestions) {
    const retention = entry.retention as { id: string; basis: string };
    expect(retention.id, `${entry.table} owner question needs a stable id`).toMatch(/^OQ-[A-Z0-9-]+$/);
    expect(retention.basis.length, `${entry.table} owner question needs a written basis`).toBeGreaterThan(40);
  }
  // Recorded so a reader sees how many decisions are still owed, instead of discovering it by
  // measuring the database later.
  expect(new Set(openQuestions.map((e) => (e.retention as { id: string }).id))).toEqual(
    new Set([
      'OQ-REMINDER-HISTORY-WINDOW',
      'OQ-TERMINAL-UPLOAD-SESSION-WINDOW',
      'OQ-WEBHOOK-ERROR-EVENTS-WINDOW',
      'OQ-SAAS-ISOLATION-EVENTS-WINDOW',
    ]),
  );
});

it('binds the closed-list prune targets to the registry: no sweep target without a policy', () => {
  const registryTargets = new Set<string>();
  for (const entry of JOURNAL_LIFECYCLE_REGISTRY) {
    if ('pruneTarget' in entry.retention) registryTargets.add(entry.retention.pruneTarget);
    for (const extra of entry.alsoPruneTargets ?? []) registryTargets.add(extra);
  }

  // `reminder_occurrence_history_terminal` is reachable through the root but deliberately not run
  // until OQ-REMINDER-HISTORY-WINDOW is answered, so it is exempt from "must be a decided window"
  // while still required to be a registered table.
  const orphanTargets = RETENTION_SWEEP_TARGETS.filter(
    (target) => !registryTargets.has(target) && target !== 'reminder_occurrence_history_terminal',
  );

  expect(
    orphanTargets,
    'A prune target that no registry entry owns is a delete with no written policy behind it.',
  ).toEqual([]);
});
