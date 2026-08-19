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
  collectMigrationProofs,
  describeProof,
  findForeignLedgerRows,
  interpretProofAnswers,
  readLegacyJournalEntries,
  readMigrationFolder,
  renderLedgerBootstrapSql,
  renderProofSql,
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
 * The ledger says a migration ran; this asks the database whether that is true.
 *
 * A ledger row is a claim, not evidence.  On 19.08 three migrations were recorded as applied on a
 * database that was missing four of their functions, and every later run answered "pending=0,
 * already current" — the ledger agreed with itself while the schema had a hole.  So before anything
 * is applied, every proof the applied migrations owe is asked: the objects they still hold, and the
 * explicit VERIFY probe of the ones that hold no object a classifier can name.  A single unmet proof
 * stops the run and is named.
 */
function findUnmetProofs(db, appliedMigrations) {
  const proofs = collectMigrationProofs(appliedMigrations);
  const sql = renderProofSql(proofs);
  if (!sql) return [];
  const result = spawnPsql(
    ['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-c', sql],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error(`cannot verify that applied migrations of ${db} still answer for what they did`);
  }
  const answers = String(result.stdout ?? '').trim().split('\n').filter(Boolean).map((line) => {
    const [at, flag] = line.split('\t');
    return { at, present: flag === 't' };
  });
  return interpretProofAnswers(proofs, answers);
}

const db = value('db');
const migrator = value('migrator');
// Deliberate, named recovery for a migration the ledger claims but the schema does not hold.  It
// is never inferred: the operator spells out every tag, so a second, unrelated hole opened later
// still stops the run instead of riding along on a stale flag.
const reapplyTags = values('reapply');
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
if (reapplyTags.length > 0 && !drizzleFolder) {
  throw new Error('--reapply is supported only with --drizzle-folder');
}
// --reapply restores the object from the migration FILE, and a declaration-owned definer function is
// more than its file: the attestation wrapper in its body and the EXECUTE grant for the role that
// calls it arrive with the privilege declaration, not with the migration.  Reapplied alone, the
// function comes back disarmed.  So the recovery is only allowed from the entrypoints that
// reconcile the declaration as their last step; they set this marker for exactly this reason.
if (reapplyTags.length > 0 && !process.env.BCB_MIGRATION_ENTRYPOINT) {
  fail(
    [
      '--reapply rebuilds the object from the migration file alone, which leaves a definer function '
        + 'without its attestation seam and without EXECUTE for the role that calls it.',
      'Run the recovery through an entrypoint that reconciles the privilege declaration afterwards:',
      `  DEV:  bash deploy/host/migrate-dev.sh --execute ${reapplyTags.map((tag) => `--reapply ${tag}`).join(' ')}`,
      `  TEST: bash deploy/host/deploy-test.sh <branch> ${reapplyTags.map((tag) => `--reapply ${tag}`).join(' ')}`,
    ].join('\n'),
  );
}
if (drizzleFolder) {
  if (steps.length > 0 || legacyOwners.length > 0 || legacyMigration) {
    throw new Error('--drizzle-folder cannot be combined with --step/--owner/--migration');
  }
  bootstrapLedger(db, drizzleFolder);
  // File name is the order and the identity; the folder listing is the whole plan.
  const migrations = readMigrationFolder(drizzleFolder);
  const appliedRows = readAppliedDrizzleRows(db);
  const pendingByLedger = selectPendingMigrations(migrations, appliedRows);
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
  const unmet = findUnmetProofs(db, applied.filter((migration) => !reapplyTags.includes(migration.tag)));
  if (unmet.length > 0) {
    const holders = [...new Set(unmet.map((proof) => proof.tag))];
    fail(
      [
        `${db} records ${holders.length} migration(s) as applied that the database does not answer for, `
          + 'so the ledger is answering for a schema it does not have:',
        ...unmet.map((proof) => `  absent: ${describeProof(proof)}`),
        'Re-run through the entrypoint with '
          + `${holders.map((tag) => `--reapply ${tag}`).join(' ')} `
          + '(deploy/host/migrate-dev.sh --execute on DEV, deploy/host/deploy-test.sh on TEST), '
          + 'after confirming each is safe to execute twice.',
      ].join('\n'),
    );
  }

  const pending = migrations.filter(
    (migration) => pendingTags.has(migration.tag) || reapplyTags.includes(migration.tag),
  );
  steps = pending.flatMap((migration) =>
    parseOwnerStatements(migration.source, migration.tag).map((statement) => ({
      ...statement,
      drizzle: { hash: migration.hash, tag: migration.tag, reapply: reapplyTags.includes(migration.tag) },
    })),
  );
  const foreign = findForeignLedgerRows(migrations, appliedRows);
  drizzleSummary = {
    pending: pending.length,
    total: migrations.length,
    reapplied: reapplyTags.length,
    foreign: foreign.length,
  };
  if (pending.length === 0) {
    console.log(
      `Drizzle owner-ordered migration already current for ${sqlIdentifier(db)}: pending=0 total=${migrations.length} `
        + `verified-proofs=${collectMigrationProofs(applied).length} foreign-ledger-rows=${foreign.length}`,
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
      `Drizzle owner-ordered migration validated and rolled back for ${qDb}: pending=${drizzleSummary.pending} total=${drizzleSummary.total} reapplied=${drizzleSummary.reapplied} foreign-ledger-rows=${drizzleSummary.foreign}`,
    );
  } else {
    console.log(`Drizzle owner-ordered migration committed for ${qDb}: pending=${drizzleSummary.pending} total=${drizzleSummary.total} reapplied=${drizzleSummary.reapplied} foreign-ledger-rows=${drizzleSummary.foreign}`);
  }
} else {
  console.log(`revision-10 migration committed for ${qDb} with temporary ${qMigrator} owner memberships revoked`);
}
