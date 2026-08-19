#!/usr/bin/env node
/**
 * Local-postgres migration wrapper for the revision-10 NOLOGIN migrator.
 *
 * It deliberately takes no connection URL: invoke it from the host's local postgres identity
 * with PGHOST/PGDATABASE (or the usual local peer defaults).  Every temporary owner membership,
 * migration statement, backfill and post-state assertion lives in the same transaction.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseOwnerStatements,
  renderTemporaryMembershipAssertion,
} from './migrate-local-parse.mjs';
import { functionsPromisedByLedger } from './migrate-local-objects.mjs';

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

function sqlIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) throw new Error(`unsafe role name '${value}'`);
  return `"${value}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const useSudoPostgres = process.argv.includes('--sudo-postgres');
const rollbackOnly = process.argv.includes('--rollback-only');
// Rollback validation accepts only the canonical Drizzle journal. Legacy includes can perform
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

function readDrizzleMigrations(folder) {
  const journalPath = resolve(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  if (!Array.isArray(journal.entries)) throw new Error('invalid Drizzle journal');
  return journal.entries.map((entry) => {
    if (!Number.isInteger(entry.idx) || !Number.isSafeInteger(entry.when) || typeof entry.tag !== 'string') {
      throw new Error('invalid Drizzle journal entry');
    }
    const path = realpathSync(resolve(folder, `${entry.tag}.sql`));
    const source = readFileSync(path, 'utf8');
    return {
      ...entry,
      hash: createHash('sha256').update(source).digest('hex'),
      path,
      source,
    };
  });
}

function readAppliedDrizzleRows(db) {
  const result = spawnPsql(
    ['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-c',
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error('cannot read Drizzle migration ledger');
  }
  return String(result.stdout ?? '').trim().split('\n').filter(Boolean).map((line) => {
    const [hash, createdAt] = line.split('\t');
    if (!/^[0-9a-f]{64}$/u.test(hash ?? '') || !/^\d+$/u.test(createdAt ?? '')) {
      throw new Error('invalid Drizzle migration ledger row');
    }
    return { hash, createdAt: Number(createdAt) };
  });
}

/**
 * Ask the catalog which of the promised functions are not actually there.  `to_regprocedure`
 * returns NULL for a name it cannot resolve, so one round trip answers for the whole set; a type
 * name the parser got wrong makes the statement fail loudly instead of silently shrinking the set.
 */
function readMissingFunctions(db, identities) {
  if (identities.length === 0) return [];
  const array = identities.map((identity) => sqlLiteral(identity)).join(', ');
  const result = spawnPsql(
    ['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c',
      `SELECT candidate FROM unnest(ARRAY[${array}]::text[]) AS candidate `
        + 'WHERE to_regprocedure(candidate) IS NULL ORDER BY 1'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error(`cannot verify migrated objects against the ${db} catalog`);
  }
  return String(result.stdout ?? '').trim().split('\n').filter(Boolean);
}

/**
 * The ledger is applied by watermark (`when > max(created_at)`), not by content.  A journal entry
 * that is BOTH below the watermark and absent from the ledger can therefore never be picked up
 * again: every later run reports `pending=0 ... already current` over a hole in the schema.  That
 * is the silent skip this gate exists to make audible.  It is computed here, in the one place all
 * DEV and TEST runs go through (`deploy/host/migrate-dev.sh`, `deploy/host/deploy-test.sh`), so no
 * caller can hold a second, divergent copy of the rule.
 */
export function findSilentlySkippedMigrations(migrations, appliedRows) {
  const applied = new Set(appliedRows.map((row) => row.createdAt));
  const watermark = appliedRows.reduce((latest, row) => Math.max(latest, row.createdAt), 0);
  return migrations.filter((migration) => migration.when < watermark && !applied.has(migration.when));
}

/**
 * The second way a ledger lies, and the one the watermark gate cannot see: the row IS there, and
 * the object it stands for is NOT.  Nothing in the ledger can notice that, because the ledger never
 * looks at the catalog; the objects go away long after the row was written, from outside the
 * migrator entirely (a privileges reconcile run from a branch that does not declare them, a manual
 * drop, a restore from an older dump).  Every later run then prints `already current` over the
 * hole, exactly as it does for a silently skipped entry.
 *
 * Grouped by the migration that last created each absent object, so the report names the object AND
 * whom to re-run, rather than a bare list of missing names.
 */
export function findMigrationsWithMissingObjects(promised, missingIdentities) {
  const byTag = new Map();
  for (const identity of missingIdentities) {
    const tag = promised.get(identity);
    if (!tag) continue;
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(identity);
  }
  return byTag;
}

const db = value('db');
const migrator = value('migrator');
// Deliberate, named recovery for an already-skipped entry.  It is never inferred: the operator must
// spell out every tag, so an unrelated new hole opened later still stops the run instead of riding
// along on a stale flag.
const applyOutOfOrderTags = values('apply-out-of-order');
// Recovery for the other drift: the ledger row is there, its objects are not.  Bumping the journal
// `when` above the watermark would also make the migration run again, but it would leave the lying
// row in place and hide it from this gate forever, and it does not work at all once the migration
// is already applied to the other target.  So the ledger row is retracted and rewritten inside the
// same transaction that re-runs the migration.  Named tag by tag, never inferred: re-running an old
// migration on its own can undo a newer one that replaced its objects, so the operator confirms.
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
if (applyOutOfOrderTags.length > 0 && !drizzleFolder) {
  throw new Error('--apply-out-of-order is supported only with --drizzle-folder');
}
if (reapplyTags.length > 0 && !drizzleFolder) {
  throw new Error('--reapply is supported only with --drizzle-folder');
}
if (drizzleFolder) {
  if (steps.length > 0 || legacyOwners.length > 0 || legacyMigration) {
    throw new Error('--drizzle-folder cannot be combined with --step/--owner/--migration');
  }
  const migrations = readDrizzleMigrations(drizzleFolder);
  const appliedRows = readAppliedDrizzleRows(db);
  const latestCreatedAt = appliedRows.reduce((latest, row) => Math.max(latest, row.createdAt), 0);
  const silentlySkipped = findSilentlySkippedMigrations(migrations, appliedRows);
  const skippedTags = new Set(silentlySkipped.map((migration) => migration.tag));
  const unknownRequest = applyOutOfOrderTags.filter((tag) => !skippedTags.has(tag));
  if (unknownRequest.length > 0) {
    throw new Error(
      `--apply-out-of-order names ${unknownRequest.join(', ')}, which is not below the ${db} watermark ${latestCreatedAt} and missing from the ledger`,
    );
  }
  const unhandled = silentlySkipped.filter((migration) => !applyOutOfOrderTags.includes(migration.tag));
  if (unhandled.length > 0) {
    const listed = unhandled.map((migration) => `idx=${migration.idx} when=${migration.when} tag=${migration.tag}`);
    throw new Error(
      [
        `Drizzle journal and ${db} ledger describe different states: ${unhandled.length} migration(s) `
          + `sit below the applied watermark ${latestCreatedAt} and have no ledger row, so the watermark `
          + 'migrator will never apply them and every run would keep reporting "already current":',
        ...listed.map((line) => `  ${line}`),
        'Their objects are absent from the database. Re-run with '
          + `${unhandled.map((migration) => `--apply-out-of-order ${migration.tag}`).join(' ')} `
          + 'to apply them through this same wrapper, after confirming they carry no ordering dependency '
          + 'on anything already applied above them.',
      ].join('\n'),
    );
  }
  // The ledger's second promise, checked against the catalog rather than against itself.
  const promised = functionsPromisedByLedger(migrations, new Set(appliedRows.map((row) => row.createdAt)));
  const drifted = findMigrationsWithMissingObjects(promised, readMissingFunctions(db, [...promised.keys()]));
  // A drifted migration is rarely re-runnable ALONE: a later migration may have replaced the very
  // objects and constraints it creates, so re-running only the hole would roll them back to the
  // older edition.  The operator may therefore name a drifted migration and any migration ORDERED
  // AFTER it — that is re-running the tail, which lands on the same final state.  Anything else
  // (a healthy migration on its own, or one that sits BEFORE every hole) is refused, so a stale
  // flag in a command line still cannot re-run something at random.
  const earliestDrift = [...drifted.keys()]
    .map((tag) => migrations.find((migration) => migration.tag === tag)?.when ?? Infinity)
    .reduce((earliest, when) => Math.min(earliest, when), Infinity);
  const unknownReapply = reapplyTags.filter((tag) => {
    if (drifted.has(tag)) return false;
    const when = migrations.find((migration) => migration.tag === tag)?.when;
    return when === undefined || when < earliestDrift;
  });
  if (unknownReapply.length > 0) {
    throw new Error(
      `--reapply names ${unknownReapply.join(', ')}, which ${db} has no hole at or before: `
        + 'only a migration whose objects are missing, or one ordered after such a migration, '
        + 'may be re-applied',
    );
  }
  const undeclaredDrift = [...drifted].filter(([tag]) => !reapplyTags.includes(tag));
  if (undeclaredDrift.length > 0) {
    throw new Error(
      [
        `The ${db} ledger and the ${db} catalog describe different states: `
          + `${undeclaredDrift.length} applied migration(s) have a ledger row, and the objects that `
          + 'row stands for are absent from the database, so every run would keep reporting '
          + '"already current" over the hole:',
        ...undeclaredDrift.flatMap(([tag, identities]) => [
          `  tag=${tag}`,
          ...identities.map((identity) => `    missing: ${identity}`),
        ]),
        'Re-run with '
          + `${undeclaredDrift.map(([tag]) => `--reapply ${tag}`).join(' ')} `
          + 'to retract those ledger rows and apply the migrations again through this same wrapper. '
          + 'If a later migration replaced anything these create, name it with --reapply too: '
          + 're-running a hole on its own would put its older edition back.',
      ].join('\n'),
    );
  }
  const reapplySet = new Set(reapplyTags);
  const pending = migrations.filter(
    (migration) => migration.when > latestCreatedAt
      || skippedTags.has(migration.tag)
      || reapplySet.has(migration.tag),
  );
  steps = pending.flatMap((migration) =>
    parseOwnerStatements(migration.source, migration.tag).map((statement) => ({
      ...statement,
      drizzle: {
        hash: migration.hash,
        tag: migration.tag,
        when: migration.when,
        reapply: reapplySet.has(migration.tag),
      },
    })),
  );
  drizzleSummary = {
    pending: pending.length,
    total: migrations.length,
    outOfOrder: silentlySkipped.length,
    reapplied: reapplyTags.length,
  };
  if (pending.length === 0) {
    console.log(`Drizzle owner-ordered migration already current for ${sqlIdentifier(db)}: pending=0 total=${migrations.length}`);
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
              ? [`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ${drizzle.when};`]
              : []),
            `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${sqlLiteral(drizzle.hash)}, ${drizzle.when});`,
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
      `Drizzle owner-ordered migration validated and rolled back for ${qDb}: pending=${drizzleSummary.pending} total=${drizzleSummary.total} out-of-order=${drizzleSummary.outOfOrder} reapplied=${drizzleSummary.reapplied}`,
    );
  } else {
    console.log(`Drizzle owner-ordered migration committed for ${qDb}: pending=${drizzleSummary.pending} total=${drizzleSummary.total} out-of-order=${drizzleSummary.outOfOrder} reapplied=${drizzleSummary.reapplied}`);
  }
} else {
  console.log(`revision-10 migration committed for ${qDb} with temporary ${qMigrator} owner memberships revoked`);
}
