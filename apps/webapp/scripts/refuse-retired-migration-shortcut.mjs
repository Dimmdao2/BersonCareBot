#!/usr/bin/env node
/**
 * Two migration shortcuts this repository retired, kept as a door that refuses and says where to go.
 *
 * `db:migrate:drizzle` ran `drizzle-kit migrate`, the ORM migrator that applies `when > max(created_at)`
 * from `meta/_journal.json`.  That watermark is the defect the migration rules exist to prevent: a
 * migration whose name lands below it never becomes pending again, and the runner keeps printing
 * "already current" over a hole in the schema.  It also writes rows without a `tag`, so everything it
 * applies stays unnamed in the ledger and pending forever for the runners that do read names.
 *
 * `db:seed-drizzle-meta` wrote "applied" rows for every journal entry WITHOUT executing any of their
 * SQL — a ledger full of claims and an empty schema, by design.
 *
 * They are refusals rather than deletions because both were in the repository long enough to be in
 * runbooks and in a reader's fingers; a missing script says "command not found", and this says which
 * command replaces it.
 */
const ROUTES = {
  'db:migrate:drizzle': [
    'Retired: `drizzle-kit migrate` applies migrations by the `when > max(created_at)` watermark of',
    'meta/_journal.json, and writes ledger rows with no tag. A migration whose name lands below the',
    'watermark is never pending again — the exact hole the current rules refuse to leave open.',
  ],
  'db:seed-drizzle-meta': [
    'Retired: it wrote "applied" ledger rows for every journal entry WITHOUT executing their SQL,',
    'which is the forged-ledger-row failure itself, packaged as a command.',
  ],
};

const which = process.argv[2] ?? '';
const why = ROUTES[which] ?? ['Retired migration shortcut.'];
process.stderr.write(
  [
    ...why,
    '',
    'Apply migrations through one of the two sanctioned runners:',
    '  DEV   bash deploy/host/migrate-dev.sh --preflight   # compile pending DDL in one rolled-back transaction',
    '        bash deploy/host/migrate-dev.sh --execute     # apply, then reconcile the privilege declaration',
    '  TEST  bash deploy/host/deploy-test.sh <branch>',
    '  local pnpm --dir apps/webapp run migrate            # DATABASE_URL of the target database',
    '',
    'Canon: AGENTS.md, "Миграции после baseline B0".',
    '',
  ].join('\n'),
);
process.exit(1);
