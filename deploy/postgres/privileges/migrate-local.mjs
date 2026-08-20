#!/usr/bin/env node
/**
 * Local-postgres migration wrapper for the revision-10 NOLOGIN migrator.
 *
 * It deliberately takes no connection URL: invoke it from the host's local postgres identity
 * with PGHOST/PGDATABASE (or the usual local peer defaults).  Every temporary owner membership,
 * migration statement, backfill and post-state assertion lives in the same transaction.
 */
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseOwnerStatements,
  renderTemporaryMembershipAssertion,
} from './migrate-local-parse.mjs';
import {
  collectExpectedObjects,
  describeObject,
  findForeignLedgerRows,
  findMigrationNameViolations,
  findRenamedAppliedMigrations,
  readFrozenLegacyMigrationNames,
  readLegacyJournalEntries,
  readMigrationFolder,
  renderLedgerBootstrapSql,
  renderObjectPresenceSql,
  selectPendingMigrations,
} from './migration-order.mjs';

function value(name) {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`--${name} is required`);
  return process.argv[at + 1];
}

function values(name) {
  const result = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) result.push(process.argv[i + 1]);
  }
  return result;
}

/** Operator-facing refusals are a message, not a stack trace: the next command is the point. */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function sqlIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) throw new Error(`unsafe role name '${value}'`);
  return `"${value}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const useSudoPostgres = process.argv.includes('--sudo-postgres');
const rollbackOnly = process.argv.includes('--rollback-only');
// Rollback validation accepts only the canonical migrations folder. Legacy includes can perform
// external side effects that a PostgreSQL ROLLBACK cannot undo.
const rollbackOnlyLegacyOptions = ['--step', '--owner', '--migration', '--backfill', '--post']
  .filter((option) => process.argv.includes(option));
if (rollbackOnly && rollbackOnlyLegacyOptions.length > 0) {
  throw new Error(
    `--rollback-only cannot be combined with legacy execution option(s): ${rollbackOnlyLegacyOptions.join(', ')}`,
  );
}
if (rollbackOnly && !process.argv.includes('--drizzle-folder')) {
  throw new Error('--rollback-only is supported only with --drizzle-folder');
}

function spawnPsql(args, options = {}) {
  return useSudoPostgres
    ? spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', ...args], options)
    : spawnSync('psql', args, options);
}

/**
 * Bookkeeping the ledger needs before it can answer "which migrations are applied" by name.
 *
 * `drizzle.__drizzle_migrations` was written by content hash and apply time only, so the run had to
 * infer identity from a timestamp.  A migration file is routinely corrected in place after it has
 * been applied (the correction is inert for databases that already ran it), which makes the content
 * hash a moving identity and the timestamp a hand-maintained one.  The tag column makes the file
 * name — the same thing that orders the folder — the identity, so neither an in-place correction nor
 * a merge that renumbers anything can turn an applied migration back into a pending one.
 *
 * The legacy rows are labelled once from `meta/_journal.json`, the frozen historical `when -> tag`
 * map.  It is the journal's only remaining job.
 */
function bootstrapLedger(db, folder) {
  const result = spawnPsql(
    ['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-c',
      renderLedgerBootstrapSql(readLegacyJournalEntries(folder))],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error(`cannot prepare the Drizzle migration ledger of ${db} for name-based identity`);
  }
}

function readAppliedDrizzleRows(db) {
  const result = spawnPsql(
    ['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-c',
      "SELECT hash, created_at, COALESCE(tag, '') FROM drizzle.__drizzle_migrations ORDER BY created_at"],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error('cannot read Drizzle migration ledger');
  }
  return String(result.stdout ?? '').trim().split('\n').filter(Boolean).map((line) => {
    const [hash, createdAt, tag] = line.split('\t');
    if (!/^[0-9a-f]{64}$/u.test(hash ?? '') || !/^\d+$/u.test(createdAt ?? '')) {
      throw new Error('invalid Drizzle migration ledger row');
    }
    return { hash, createdAt: Number(createdAt), tag: tag || null };
  });
}

/**
 * The ledger says a migration ran; this asks the catalog whether its objects are actually there.
 *
 * A ledger row is a claim, not evidence.  On 19.08 three migrations were recorded as applied on a
 * database that was missing four of their functions, and every later run answered "pending=0,
 * already current" — the ledger agreed with itself while the schema had a hole.  So before anything
 * is applied, every object the applied migrations created and did not later drop is probed by name,
 * and a single absent one stops the run and is named.
 */
function findMissingObjects(db, appliedMigrations) {
  const objects = collectExpectedObjects(appliedMigrations);
  const sql = renderObjectPresenceSql(objects);
  if (!sql) return [];
  const result = spawnPsql(
    ['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-c', sql],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error(`cannot verify that applied migrations of ${db} still hold their objects`);
  }
  const present = new Map(
    String(result.stdout ?? '').trim().split('\n').filter(Boolean).map((line) => {
      const [at, flag] = line.split('\t');
      return [Number(at), flag === 't'];
    }),
  );
  if (present.size !== objects.length) {
    throw new Error(`object presence probe answered for ${present.size} of ${objects.length} objects`);
  }
  return objects.filter((_, index) => present.get(index) === false);
}

const db = value('db');
const migrator = value('migrator');
// Deliberate, named recovery for a migration the ledger claims but the schema does not hold.  It
// is never inferred: the operator spells out every tag, so a second, unrelated hole opened later
// still stops the run instead of riding along on a stale flag.
const reapplyTags = values('reapply');
// --relabel repoints a foreign ledger row (applied under a name this checkout does not carry — a
// rename, or a legacy `when`-slot backfill that mislabelled the wrong row, see
// `renderLedgerBootstrapSql`) at the file that is its true identity today, WITHOUT running a single
// statement again. It is only ever a ledger UPDATE; the hash equality check below is what makes that
// safe instead of a hand-wave — see the validation next to its use.
const relabelPairs = values('relabel').map((pair) => {
  const at = pair.indexOf(':');
  if (at <= 0 || at === pair.length - 1) throw new Error(`--relabel must be <old-tag>:<new-tag>, got '${pair}'`);
  return { oldTag: pair.slice(0, at), newTag: pair.slice(at + 1) };
});
// --drop-foreign removes a foreign ledger row that is not a rename of anything in this folder — a
// dead legacy-backfill mislabel with no file that will ever claim its name again. Refused, not
// silently accepted, when any file in the folder shares its hash: that shape is --relabel's, not
// this one's.
const dropForeignTags = values('drop-foreign');
// --unapply removes a ledger row that IS a file in this folder's own tag — the reverse of the
// INSERT this wrapper writes when a migration is applied. It exists because two agents independently
// hit the same wall and both reached for a raw `DELETE FROM drizzle.__drizzle_migrations`: one to
// undo a migration whose DDL had already been rolled back some other way, one to remove a probe row
// of its own (see docs/REPORTS/AUDIT_MIGRATION_LEDGER_REAUDIT_2026-08-20.md, non-blocking finding 1).
// It touches the ledger row ONLY — it never re-runs, rolls back or otherwise executes a migration's
// SQL; that is `--rollback-only`'s job, on a database that has not committed yet. Refused, not
// silently accepted, when the tag names no ledger row (nothing to unapply), when the row belongs to
// no file in this folder (that shape is --drop-foreign's, not this one's), or when the file's content
// has moved on since the row was written (the hash gate below): a mismatch means the ledger row and
// the file no longer agree on what actually ran, and blindly dropping it would erase the only record
// of that.
const unapplyTags = values('unapply');
const legacyOwners = values('owner');
const legacyMigration = process.argv.includes('--migration') ? realpathSync(resolve(value('migration'))) : null;
let steps = values('step').map((step) => {
  const at = step.indexOf(':');
  if (at <= 0 || at === step.length - 1) throw new Error(`--step must be <owner>:<sql-file>, got '${step}'`);
  return { owner: step.slice(0, at), migration: realpathSync(resolve(step.slice(at + 1))) };
});
const drizzleFolder = process.argv.includes('--drizzle-folder')
  ? realpathSync(resolve(value('drizzle-folder')))
  : null;
let drizzleSummary = null;
// Declared here, not inside the `if (drizzleFolder)` block below, so the final transaction assembly
// (which runs after that block, for both the drizzle-folder and legacy-step paths) can splice them in.
let relabelStatements = [];
let dropForeignStatements = [];
let unapplyStatements = [];
if (reapplyTags.length > 0 && !drizzleFolder) {
  throw new Error('--reapply is supported only with --drizzle-folder');
}
if ((relabelPairs.length > 0 || dropForeignTags.length > 0) && !drizzleFolder) {
  throw new Error('--relabel and --drop-foreign are supported only with --drizzle-folder');
}
if (unapplyTags.length > 0 && !drizzleFolder) {
  throw new Error('--unapply is supported only with --drizzle-folder');
}
if (drizzleFolder) {
  if (steps.length > 0 || legacyOwners.length > 0 || legacyMigration) {
    throw new Error('--drizzle-folder cannot be combined with --step/--owner/--migration');
  }
  bootstrapLedger(db, drizzleFolder);
  // File name is the order and the identity; the folder listing is the whole plan.
  const migrations = readMigrationFolder(drizzleFolder);
  // The name rule used to live only in `pnpm run lint` (`check-drizzle-migration-order.sh`): a file
  // with an old hand-picked number, not in the frozen legacy snapshot, sailed through this wrapper
  // straight to `BEGIN`/`INSERT` — proven live on 20.08 (MIGRATION_TIMESTAMP_NAMES_AUDIT_2026-08-20.md
  // §3(a)). Every runner that can commit a migration checks the same thing lint does, from the same
  // module, against the same frozen file — never the live journal (see module doc, `findJournalGrowth`).
  const nameViolations = findMigrationNameViolations(migrations, readFrozenLegacyMigrationNames(drizzleFolder));
  if (nameViolations.length > 0) {
    fail(
      nameViolations
        .map((tag) => `${tag}.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, and the frozen legacy `
          + 'snapshot (meta/_journal.frozen.json) does not know it as a legacy name.')
        .join('\n'),
    );
  }
  const appliedRows = readAppliedDrizzleRows(db);
  const foreign = findForeignLedgerRows(migrations, appliedRows);
  const foreignByTag = new Map(foreign.filter((row) => row.tag).map((row) => [row.tag, row]));

  const relabeledNewTags = new Set();
  for (const { oldTag, newTag } of relabelPairs) {
    const row = foreignByTag.get(oldTag);
    if (!row) {
      fail(`--relabel names ${oldTag}, which is not a foreign ledger row of ${db} (nothing to relabel)`);
    }
    const file = migrations.find((migration) => migration.tag === newTag);
    if (!file) {
      fail(`--relabel names ${newTag}, which is not a migration file in ${drizzleFolder}`);
    }
    if (appliedRows.some((applied) => applied.tag === newTag)) {
      fail(`--relabel names ${newTag}, which ${db} already carries a ledger row for`);
    }
    if (file.hash !== row.hash) {
      fail(
        `--relabel ${oldTag}:${newTag} refused: ${newTag}.sql hash (${file.hash}) does not match the `
          + `foreign row's hash (${row.hash}); this is not a pure rename, so relabeling would hide content `
          + 'drift instead of proving its absence. Resolve the drift first (rollback and reapply under the new name).',
      );
    }
    relabelStatements.push(
      `UPDATE drizzle.__drizzle_migrations SET tag = ${sqlLiteral(newTag)} WHERE tag = ${sqlLiteral(oldTag)};`,
    );
    relabeledNewTags.add(newTag);
  }

  for (const tag of dropForeignTags) {
    const row = foreignByTag.get(tag);
    if (!row) {
      fail(`--drop-foreign names ${tag}, which is not a foreign ledger row of ${db} (nothing to drop)`);
    }
    const claimant = migrations.find((migration) => migration.hash === row.hash);
    if (claimant) {
      fail(
        `--drop-foreign ${tag} refused: its hash (${row.hash}) matches ${claimant.tag}.sql in this folder — `
          + `this is a rename, not a dead row. Use --relabel ${tag}:${claimant.tag} instead.`,
      );
    }
    dropForeignStatements.push(`DELETE FROM drizzle.__drizzle_migrations WHERE tag = ${sqlLiteral(tag)};`);
  }

  const appliedByTag = new Map(appliedRows.filter((row) => row.tag).map((row) => [row.tag, row]));
  for (const tag of unapplyTags) {
    const row = appliedByTag.get(tag);
    if (!row) {
      fail(`--unapply names ${tag}, which ${db} has not applied at all (nothing to unapply)`);
    }
    const file = migrations.find((migration) => migration.tag === tag);
    if (!file) {
      fail(
        `--unapply names ${tag}, which is a foreign ledger row of ${db} (no file in ${drizzleFolder} claims `
          + `it) — use --drop-foreign ${tag} instead.`,
      );
    }
    if (file.hash !== row.hash) {
      fail(
        `--unapply ${tag} refused: ${tag}.sql hash (${file.hash}) does not match the ledger row's hash `
          + `(${row.hash}); the file has changed since this tag was applied, so unapplying would erase the `
          + 'only record of what actually ran instead of proving its absence. Resolve the drift first '
          + '(restore the file to the content that was applied, or give the new content its own tag).',
      );
    }
    unapplyStatements.push(`DELETE FROM drizzle.__drizzle_migrations WHERE tag = ${sqlLiteral(tag)};`);
  }

  // Migrations this same run is about to relabel onto count as applied for pending purposes — they
  // are not re-executed, only re-tagged, by the statements collected above.
  const effectiveAppliedRows = [...appliedRows, ...[...relabeledNewTags].map((tag) => ({ tag }))];
  const pendingByLedger = selectPendingMigrations(migrations, effectiveAppliedRows);
  const pendingTags = new Set(pendingByLedger.map((migration) => migration.tag));

  const unknownReapply = reapplyTags.filter((tag) => !migrations.some((migration) => migration.tag === tag));
  if (unknownReapply.length > 0) {
    fail(`--reapply names ${unknownReapply.join(', ')}, which is not a migration file in ${drizzleFolder}`);
  }
  const alreadyPending = reapplyTags.filter((tag) => pendingTags.has(tag));
  if (alreadyPending.length > 0) {
    fail(`--reapply names ${alreadyPending.join(', ')}, which ${db} has not applied at all; it is ordinary pending work`);
  }

  const applied = migrations.filter((migration) => !pendingTags.has(migration.tag));
  const missing = findMissingObjects(db, applied.filter((migration) => !reapplyTags.includes(migration.tag)));
  if (missing.length > 0) {
    const holders = [...new Set(missing.map((object) => object.tag))];
    fail(
      [
        `${db} records ${holders.length} migration(s) as applied whose objects are not in the catalog, `
          + 'so the ledger is answering for a schema it does not have:',
        ...missing.map((object) => `  absent: ${describeObject(object)}`),
        'Re-run with '
          + `${holders.map((tag) => `--reapply ${tag}`).join(' ')} `
          + 'to send them through this same wrapper again, after confirming each is safe to execute twice.',
      ].join('\n'),
    );
  }

  const pending = migrations.filter(
    (migration) => pendingTags.has(migration.tag) || reapplyTags.includes(migration.tag),
  );
  // A pending file byte-identical to a ledger row this checkout cannot name did not just arrive —
  // it is an applied migration under a new name.  The order-is-the-file-name rule makes a rename
  // the migration's identity change; running it again would apply already-applied DDL a second time
  // under a tag nothing else on the database will ever recognise.
  const renamed = findRenamedAppliedMigrations(
    pending.filter((migration) => !reapplyTags.includes(migration.tag)),
    foreign,
  );
  if (renamed.length > 0) {
    fail(
      renamed
        .map(
          ({ migration, row }) =>
            `${migration.tag}.sql is byte-identical to a migration ${db} already applied under a name this `
              + `checkout does not carry (ledger created_at=${row.createdAt}); renaming an applied migration `
              + 'is forbidden. Restore the original file name, or if this is genuinely new work, change its SQL.',
        )
        .join('\n'),
    );
  }
  steps = pending.flatMap((migration) =>
    parseOwnerStatements(migration.source, migration.tag).map((statement) => ({
      ...statement,
      drizzle: { hash: migration.hash, tag: migration.tag, reapply: reapplyTags.includes(migration.tag) },
    })),
  );
  drizzleSummary = {
    pending: pending.length,
    total: migrations.length,
    reapplied: reapplyTags.length,
    foreign: foreign.length,
    relabeled: relabelStatements.length,
    droppedForeign: dropForeignStatements.length,
    unapplied: unapplyStatements.length,
  };
  if (
    pending.length === 0
    && relabelStatements.length === 0
    && dropForeignStatements.length === 0
    && unapplyStatements.length === 0
  ) {
    console.log(
      `Drizzle owner-ordered migration already current for ${sqlIdentifier(db)}: pending=0 total=${migrations.length} `
        + `verified-objects=${collectExpectedObjects(applied).length} foreign-ledger-rows=${foreign.length}`,
    );
    process.exit(0);
  }
} else if (steps.length === 0) {
  if (legacyOwners.length !== 1 || !legacyMigration) {
    throw new Error('use one legacy --owner + --migration pair, or one or more --step <owner>:<sql-file>');
  }
  steps.push({ owner: legacyOwners[0], migration: legacyMigration });
}
const owners = [...new Set(steps.filter((step) => !step.backfill).map((step) => step.owner))];
const temporarySchemaCreates = [...new Map(
  steps
    .filter((step) => step.schemaCreate)
    .map((step) => [`${step.owner}:${step.schemaCreate}`, { owner: step.owner, schema: step.schemaCreate }]),
).values()];
const temporaryLanguageUsages = [...new Map(
  steps
    .filter((step) => step.languageUsage)
    .map((step) => [`${step.owner}:${step.languageUsage}`, { owner: step.owner, language: step.languageUsage }]),
).values()];
const backfill = process.argv.includes('--backfill') ? realpathSync(resolve(value('backfill'))) : null;
const post = process.argv.includes('--post') ? realpathSync(resolve(value('post'))) : null;
if (steps.some((step) => step.migration && !existsSync(step.migration)) || (backfill && !existsSync(backfill)) || (post && !existsSync(post))) {
  throw new Error('migration/backfill/post file does not exist');
}

const qDb = sqlIdentifier(db);
const qMigrator = sqlIdentifier(migrator);
const temporaryMembershipAssertion = renderTemporaryMembershipAssertion(migrator, owners);
const statements = [
  '\\set ON_ERROR_STOP on',
  'BEGIN;',
  ...relabelStatements,
  ...dropForeignStatements,
  ...unapplyStatements,
  ...owners.map((owner) => `GRANT ${sqlIdentifier(owner)} TO ${qMigrator} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;`),
  ...temporarySchemaCreates.map(({ owner, schema }) =>
    `GRANT CREATE ON SCHEMA ${sqlIdentifier(schema)} TO ${sqlIdentifier(owner)};`),
  ...temporaryLanguageUsages.map(({ owner, language }) =>
    `GRANT USAGE ON LANGUAGE ${sqlIdentifier(language)} TO ${sqlIdentifier(owner)};`),
  `SET LOCAL SESSION AUTHORIZATION ${qMigrator};`,
  ...steps.flatMap(({ owner, migration, sql, drizzle, backfill }, index) => {
    const closesDrizzleMigration = drizzle
      && (index === steps.length - 1 || steps[index + 1]?.drizzle?.tag !== drizzle.tag);
    const execution = backfill
      ? [
          'RESET ROLE;',
          'RESET SESSION AUTHORIZATION;',
          sql,
          ...(!closesDrizzleMigration ? [`SET LOCAL SESSION AUTHORIZATION ${qMigrator};`] : []),
        ]
      : [
          `SET LOCAL ROLE ${sqlIdentifier(owner)};`,
          "SELECT session_user, current_user, has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public;",
          migration ? `\\i ${migration}` : sql,
          'RESET ROLE;',
        ];
    return [
      ...execution,
      ...(closesDrizzleMigration
        ? [
            'RESET SESSION AUTHORIZATION;',
            ...(drizzle.reapply
              ? [`DELETE FROM drizzle.__drizzle_migrations WHERE tag = ${sqlLiteral(drizzle.tag)};`]
              : []),
            // created_at is bookkeeping now, not identity: it only records the order of application.
            `INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
             VALUES (${sqlLiteral(drizzle.hash)},
                     (SELECT COALESCE(MAX(created_at), 0) + 1000 FROM drizzle.__drizzle_migrations),
                     ${sqlLiteral(drizzle.tag)});`,
            `SET LOCAL SESSION AUTHORIZATION ${qMigrator};`,
          ]
        : []),
    ];
  }),
  'RESET SESSION AUTHORIZATION;',
  ...(backfill ? [`\\i ${backfill}`] : []),
  ...temporarySchemaCreates.map(({ owner, schema }) =>
    `REVOKE CREATE ON SCHEMA ${sqlIdentifier(schema)} FROM ${sqlIdentifier(owner)};`),
  ...temporaryLanguageUsages.map(({ owner, language }) =>
    `REVOKE USAGE ON LANGUAGE ${sqlIdentifier(language)} FROM ${sqlIdentifier(owner)};`),
  ...owners.map((owner) => `REVOKE ${sqlIdentifier(owner)} FROM ${qMigrator};`),
  `DO $$ BEGIN
     ${temporaryMembershipAssertion ?? ''}
     IF (SELECT rolcanlogin OR rolinherit OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = '${migrator}') THEN
       RAISE EXCEPTION 'migrator post-state is not NOLOGIN/NOINHERIT/NOBYPASSRLS';
     END IF;
   END $$;`,
  ...(post ? [`\\i ${post}`] : []),
  rollbackOnly ? 'ROLLBACK;' : 'COMMIT;',
].join('\n');

const result = spawnPsql(['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: statements, encoding: 'utf8' });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(result.status ?? 1);
if (drizzleSummary) {
  if (rollbackOnly) {
    console.log(
      `Drizzle owner-ordered migration validated and rolled back for ${qDb}: pending=${drizzleSummary.pending} total=${drizzleSummary.total} reapplied=${drizzleSummary.reapplied} foreign-ledger-rows=${drizzleSummary.foreign} relabeled=${drizzleSummary.relabeled} dropped-foreign=${drizzleSummary.droppedForeign} unapplied=${drizzleSummary.unapplied}`,
    );
  } else {
    console.log(`Drizzle owner-ordered migration committed for ${qDb}: pending=${drizzleSummary.pending} total=${drizzleSummary.total} reapplied=${drizzleSummary.reapplied} foreign-ledger-rows=${drizzleSummary.foreign} relabeled=${drizzleSummary.relabeled} dropped-foreign=${drizzleSummary.droppedForeign} unapplied=${drizzleSummary.unapplied}`);
  }
} else {
  console.log(`revision-10 migration committed for ${qDb} with temporary ${qMigrator} owner memberships revoked`);
}
