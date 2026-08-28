import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS,
  JOURNAL_LIFECYCLE_REGISTRY,
} from '../../../../../deploy/postgres/privileges/journal-lifecycle-registry';
import { RETENTION_SWEEP_TARGETS } from '@/infra/db/pruneRetentionTarget';
import { CRON_JOB_REGISTRY } from '@/modules/operator-health/cronJobRegistry';
import { MEDIA_PLAYBACK_STATS_RETENTION_BRANCHES } from '@/app-layer/media/playbackHourlyRetention';
import { PRODUCT_ANALYTICS_RETENTION_BRANCHES } from '@/modules/product-analytics/productAnalyticsRetention';
import {
  OPERATOR_MEDIA_PLAYBACK_STATS_RETENTION_JOB_KEY,
  OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY,
} from '@/modules/operator-health/backgroundJobManifest';

/**
 * WHAT BREAKS WITHOUT THIS: a new table is declared, migrated and wired to a live writer while
 * belonging to no retention policy, no purge path and no sweep — exactly how `message_log` and the
 * consolidated `reminder_occurrence_history` reached the systemic audit of 2026-08-27 (§E1, §C3), and
 * exactly how `manual_patient_commands` reached the audit of 2026-08-28 (F1) and made every account
 * purge of a patient fail. Nothing in lint, typecheck, the privilege generator or the migration gate
 * looks at data lifecycle, so the omission is invisible until someone measures the database.
 *
 * ORACLE: `deploy/postgres/privileges/declaration.ts` — the independent artifact that must list every
 * physical table before its migration may exist. This test never derives the candidate set from the
 * registry it is checking.
 *
 * THE CANDIDATE SET IS EVERY DECLARED TABLE. The previous version of this gate only considered names
 * ending in `_log` / `_events` / `_queue` / … plus a hand list of extras, so the 2026-08-28 audit
 * declared `public.bcb_probe_sms_deliveries` and the gate stayed green (F3). A name heuristic cannot
 * be the trigger: it is precisely the tables nobody thought of as journals that go unclassified.
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

const USER_PURGE_KINDS = new Set([
  'cascade',
  'explicit-delete',
  'deferred-delete',
  'explicit-anonymise',
  'anonymised',
  'phone-keyed',
  'via-parent',
  'staff-authored',
  'self-expiring',
  'purge-blocked',
  'owner-question',
  'absent-retired',
  'not-user-scoped',
]);
const ORG_PURGE_KINDS = new Set([
  'organization_id',
  'org-anonymised',
  'via-parent',
  'absent-retired',
  'not-org-scoped',
]);

/**
 * Runtime shape check, deliberately not "the TypeScript type says so": the escape hatch this gate
 * exists to close was a plain string, and a plain string type-checks fine the moment somebody widens
 * the union again. A decision is only a decision when both purge semantics are actually written.
 */
function structuralFaults(table: string, decision: unknown): string[] {
  const faults: string[] = [];
  if (typeof decision !== 'object' || decision === null) {
    return [`${table}: non-structured exception (${typeof decision}) — needs reason + purge semantics`];
  }
  const d = decision as { reason?: unknown; userPurge?: unknown; orgPurge?: unknown };
  if (typeof d.reason !== 'string' || d.reason.trim() === '') {
    faults.push(`${table}: missing reason`);
  }
  const user = d.userPurge as { kind?: unknown } | undefined;
  if (!user || typeof user.kind !== 'string' || !USER_PURGE_KINDS.has(user.kind)) {
    faults.push(`${table}: missing or unknown account-purge semantics`);
  }
  const org = d.orgPurge as { kind?: unknown } | undefined;
  if (!org || typeof org.kind !== 'string' || !ORG_PURGE_KINDS.has(org.kind)) {
    faults.push(`${table}: missing or unknown organization-purge semantics`);
  }
  return faults;
}

it('leaves no declared table at all without a written lifecycle decision', async () => {
  const registered = new Set(JOURNAL_LIFECYCLE_REGISTRY.map((entry) => entry.table));
  const excluded = new Set(Object.keys(JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS));

  const undecided = (await declaredTables()).filter(
    (table) => !registered.has(table) && !excluded.has(table),
  );

  expect(
    undecided,
    'Every declared physical table needs either a lifecycle entry (owner, purge key, terminal ' +
      'states, retention decision, prune root, sweeping job) in journal-lifecycle-registry.ts, or a ' +
      'structured "this is not a journal" decision in JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS ' +
      'carrying a reason plus explicit account-purge and organization-purge semantics. There is no ' +
      'name heuristic: an arbitrarily named new table lands here too.',
  ).toEqual([]);
});

it('classifies every declared table exactly once, and nothing it does not declare', async () => {
  const declared = new Set(await declaredTables());
  const registered = JOURNAL_LIFECYCLE_REGISTRY.map((entry) => entry.table);
  const excluded = Object.keys(JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS);

  const bothWays = registered.filter((table) => table in JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS);
  expect(bothWays, 'A table cannot be both a journal and not a journal.').toEqual([]);

  const undeclared = [...registered, ...excluded].filter((table) => !declared.has(table)).sort();
  expect(
    undeclared,
    'A lifecycle decision for a table that declaration.ts does not declare is a policy for nothing — ' +
      'it hides a rename or a removal instead of surfacing it.',
  ).toEqual([]);
});

it('accepts no bare or half-written non-journal exception', () => {
  const faults = Object.entries(JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS)
    .flatMap(([table, decision]) => structuralFaults(table, decision))
    .sort();

  expect(
    faults,
    'A bare reason string is how patient_practice_completions and patient_diary_day_snapshots were ' +
      'marked "not a journal" and survived account purge (audit 2026-08-28, F2). Both purge ' +
      'semantics must be written, and "not-user-scoped" / "not-org-scoped" are legitimate answers.',
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

it('keeps every recorded open question answerable: a stable id, a column and a written basis', () => {
  const faults: string[] = [];
  for (const entry of JOURNAL_LIFECYCLE_REGISTRY) {
    if (entry.userPurge.kind !== 'owner-question') continue;
    const purge = entry.userPurge;
    if (!/^OQ-[A-Z0-9-]+$/.test(purge.id)) faults.push(`${entry.table}: purge question needs a stable id`);
    if (purge.column.trim() === '') faults.push(`${entry.table}: purge question needs the column`);
    if (purge.basis.length <= 40) faults.push(`${entry.table}: purge question needs a written basis`);
  }
  expect(faults).toEqual([]);

  // Recorded so an unanswered purge decision is a number a reader sees, not something discovered by
  // measuring the database later.
  // OQ-DELIVERY-ATTEMPT-USER-PURGE was ANSWERED on 2026-08-28 (owner brief, finding 1): the delivery
  // journal keeps its non-identifying outcome and loses the person on all three surfaces it carried
  // him on, so the entry is now an executed `explicit-anonymise` rather than a question. Nothing is
  // owed here today — and this assertion is what makes a new silent one impossible.
  expect(
    new Set(
      JOURNAL_LIFECYCLE_REGISTRY.filter((e) => e.userPurge.kind === 'owner-question').map((e) =>
        (e.userPurge as { id: string }).id,
      ),
    ),
  ).toEqual(new Set<string>());
});

/**
 * The three — and only three — shapes a decided window's prune root may have, each checkable against
 * an artifact outside this registry.
 *
 * Audit 2026-08-28, F4: the previous rule was `sweepTargets.has(target) || target.includes('.') ||
 * target.includes(':')`, i.e. ANY name with punctuation counted as executable. Under it the required
 * injection of `app.audit_missing_prune_target` stayed green, and two false roots were already
 * living in the registry: `app.archive_operator_health_failures`, which moves failures INTO the
 * archive rather than pruning it, and `media_playback_stats.retention:events`, a module branch no
 * module implements. A prune root is now resolved, not spelled.
 */
type PruneRootResolution = { ok: true } | { ok: false; why: string };

/** Every callable the privilege declaration says is installed, by `schema.function` name. */
async function declaredInstalledPruneRoots(): Promise<Map<string, string[]>> {
  const cwd = process.cwd();
  process.chdir(REPO_ROOT);
  try {
    const mod = (await import(
      pathToFileURL(path.join(REPO_ROOT, 'deploy/postgres/privileges/declaration.ts')).href
    )) as {
      declaration: {
        portContext: {
          functions: Record<string, unknown>;
          capabilities: Record<string, { purpose?: string; functionIdentity?: string }>;
        };
      };
    };
    const context = mod.declaration.portContext;
    const installed = new Set(
      Object.keys(context.functions).map((regprocedure) => regprocedure.split('(')[0] ?? ''),
    );
    // A root is only a PRUNE root when the declared seam it is reached through says so. This is what
    // separates `app.prune_operator_health_failure_archive` (purpose `health.failure-archive.prune`)
    // from `app.archive_operator_health_failures` (purpose `platform.health-archive.clear`), which
    // the registry named for years while the scheduler called the other one.
    const purposesByName = new Map<string, string[]>();
    for (const capability of Object.values(context.capabilities)) {
      const identity = capability.functionIdentity;
      if (!identity) continue;
      const name = identity.split('(')[0] ?? '';
      if (!installed.has(name)) continue;
      purposesByName.set(name, [...(purposesByName.get(name) ?? []), capability.purpose ?? '']);
    }
    return purposesByName;
  } finally {
    process.chdir(cwd);
  }
}

function isPrunePurpose(purpose: string): boolean {
  return purpose.startsWith('retention.') || purpose.endsWith('.prune');
}

it('makes every decided retention window executable: real prune root, scheduler and health signal', async () => {
  const sweepTargets = new Set<string>(RETENTION_SWEEP_TARGETS);
  const cronJobs = new Map(CRON_JOB_REGISTRY.map((job) => [job.jobKey, job]));
  const dbPruneRootPurposes = await declaredInstalledPruneRoots();
  /* Branches a background job REALLY performs, taken from the module that performs them. */
  const moduleBranches = new Map<string, readonly string[]>([
    [OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY, PRODUCT_ANALYTICS_RETENTION_BRANCHES],
    [OPERATOR_MEDIA_PLAYBACK_STATS_RETENTION_JOB_KEY, MEDIA_PLAYBACK_STATS_RETENTION_BRANCHES],
  ]);

  function resolvePruneRoot(target: string, sweptBy: string | null): PruneRootResolution {
    if (sweepTargets.has(target)) return { ok: true };
    if (target.includes(':')) {
      const [jobKey, branch] = [
        target.slice(0, target.indexOf(':')),
        target.slice(target.indexOf(':') + 1),
      ];
      if (jobKey !== sweptBy) {
        return { ok: false, why: `module branch names job '${jobKey}' but is swept by '${sweptBy}'` };
      }
      const branches = moduleBranches.get(jobKey);
      if (!branches) return { ok: false, why: `no module declares the branches of job '${jobKey}'` };
      if (!branches.includes(branch)) {
        return { ok: false, why: `job '${jobKey}' implements no '${branch}' sweep branch` };
      }
      return { ok: true };
    }
    if (target.includes('.')) {
      const purposes = dbPruneRootPurposes.get(target);
      if (!purposes) {
        return { ok: false, why: `no installed callable '${target}' is declared in declaration.ts` };
      }
      if (!purposes.some(isPrunePurpose)) {
        return { ok: false, why: `'${target}' is installed but its declared purpose is not pruning (${purposes.join(', ')})` };
      }
      return { ok: true };
    }
    return { ok: false, why: `'${target}' is not a closed-list sweep target` };
  }

  const unexecutable: string[] = [];
  for (const entry of JOURNAL_LIFECYCLE_REGISTRY) {
    if (entry.retention.kind !== 'window') continue;
    const targets = [entry.retention.pruneTarget, ...(entry.alsoPruneTargets ?? [])];
    for (const target of targets) {
      const resolved = resolvePruneRoot(target, entry.sweptBy);
      if (!resolved.ok) unexecutable.push(`${entry.table}: ${resolved.why}`);
    }
    const job = entry.sweptBy === null ? undefined : cronJobs.get(entry.sweptBy);
    if (!job) {
      unexecutable.push(`${entry.table}: no registered sweeping job '${entry.sweptBy}'`);
      continue;
    }
    // The health signal: the job's staleness threshold is what reds out the operator card when the
    // sweep stops running. A window whose sweep cannot go stale is unobservable.
    if (!(job.staleAfterSec > 0)) {
      unexecutable.push(`${entry.table}: job '${job.jobKey}' carries no staleness health signal`);
    }
  }

  expect(
    unexecutable.sort(),
    'A retention window with no reachable prune root or no registered sweeping job is a policy that ' +
      'never runs — audit §B2, where declared retention had no alarm clock. A prune root is one of: ' +
      'a closed-list RETENTION_SWEEP_TARGETS label; `<jobKey>:<branch>` where the module behind that ' +
      'job really implements that branch; or a `schema.function` the privilege declaration installs ' +
      'AND reaches through a seam whose declared purpose is pruning.',
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
