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

export function parseOwnerStatements(source, tag) {
  return source.split('--> statement-breakpoint').map((statement, index) => {
    const match = /^\s*--\s*BCB-MIGRATION-OWNER:\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\r?\n|$)/u.exec(statement);
    if (!match?.[1]) {
      throw new Error(`pending migration ${tag} statement ${index + 1} has no BCB-MIGRATION-OWNER`);
    }
    if (match[1] === 'postgres') {
      throw new Error(`pending migration ${tag} statement ${index + 1} cannot use postgres as a schema owner`);
    }
    const sql = statement.slice(match[0].length).trim();
    if (!sql) throw new Error(`pending migration ${tag} statement ${index + 1} is empty`);
    return { owner: match[1], sql };
  });
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
  const result = spawnSync(
    'psql',
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

function readReconciliations(migrations) {
  const byTag = new Map(migrations.map((migration) => [migration.tag, migration]));
  const forwardBySource = new Map();
  const marker = /^-- RECONCILES-MIGRATION-HASH: ([0-9]{4}_[a-z0-9_]+)$/gmu;
  for (const migration of migrations) {
    for (const match of migration.source.matchAll(marker)) {
      const source = byTag.get(match[1]);
      if (!source || source.when >= migration.when || forwardBySource.has(source.tag)) {
        throw new Error(`invalid migration reconciliation source=${match[1]} forward=${migration.tag}`);
      }
      forwardBySource.set(source.tag, migration);
    }
  }
  return forwardBySource;
}

function assertDrizzleCompleteness(migrations, appliedHashes, forwardBySource) {
  const appliedByTag = new Map();
  const isApplied = (migration, visiting = new Set()) => {
    if (appliedByTag.has(migration.tag)) return appliedByTag.get(migration.tag);
    if (appliedHashes.has(migration.hash)) {
      appliedByTag.set(migration.tag, true);
      return true;
    }
    if (visiting.has(migration.tag)) throw new Error(`cyclic migration reconciliation at ${migration.tag}`);
    const forward = forwardBySource.get(migration.tag);
    const applied = forward ? isApplied(forward, new Set([...visiting, migration.tag])) : false;
    appliedByTag.set(migration.tag, applied);
    return applied;
  };
  const missing = migrations.filter((migration) => !isApplied(migration)).map((migration) => migration.tag);
  if (missing.length > 0) throw new Error(`migration ledger incomplete after plan: ${missing.join(',')}`);
}

const db = value('db');
const migrator = value('migrator');
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
if (drizzleFolder) {
  if (steps.length > 0 || legacyOwners.length > 0 || legacyMigration) {
    throw new Error('--drizzle-folder cannot be combined with --step/--owner/--migration');
  }
  const migrations = readDrizzleMigrations(drizzleFolder);
  const appliedRows = readAppliedDrizzleRows(db);
  const latestCreatedAt = appliedRows.reduce((latest, row) => Math.max(latest, row.createdAt), 0);
  const pending = migrations.filter((migration) => migration.when > latestCreatedAt);
  steps = pending.flatMap((migration) =>
    parseOwnerStatements(migration.source, migration.tag).map((statement) => ({
      ...statement,
      drizzle: { hash: migration.hash, tag: migration.tag, when: migration.when },
    })),
  );
  const projectedHashes = new Set([...appliedRows.map((row) => row.hash), ...pending.map((migration) => migration.hash)]);
  assertDrizzleCompleteness(migrations, projectedHashes, readReconciliations(migrations));
  drizzleSummary = { pending: pending.length, total: migrations.length };
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
const owners = [...new Set(steps.map((step) => step.owner))];
const backfill = process.argv.includes('--backfill') ? realpathSync(resolve(value('backfill'))) : null;
const post = process.argv.includes('--post') ? realpathSync(resolve(value('post'))) : null;
if (steps.some((step) => step.migration && !existsSync(step.migration)) || (backfill && !existsSync(backfill)) || (post && !existsSync(post))) {
  throw new Error('migration/backfill/post file does not exist');
}

const qDb = sqlIdentifier(db);
const qMigrator = sqlIdentifier(migrator);
const statements = [
  '\\set ON_ERROR_STOP on',
  'BEGIN;',
  ...owners.map((owner) => `GRANT ${sqlIdentifier(owner)} TO ${qMigrator} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;`),
  `SET LOCAL SESSION AUTHORIZATION ${qMigrator};`,
  ...steps.flatMap(({ owner, migration, sql, drizzle }, index) => [
    `SET LOCAL ROLE ${sqlIdentifier(owner)};`,
    "SELECT session_user, current_user, has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public;",
    migration ? `\\i ${migration}` : sql,
    'RESET ROLE;',
    ...(drizzle && (index === steps.length - 1 || steps[index + 1]?.drizzle?.tag !== drizzle.tag)
      ? [
          'RESET SESSION AUTHORIZATION;',
          `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${sqlLiteral(drizzle.hash)}, ${drizzle.when});`,
          `SET LOCAL SESSION AUTHORIZATION ${qMigrator};`,
        ]
      : []),
  ]),
  'RESET SESSION AUTHORIZATION;',
  ...(backfill ? [`\\i ${backfill}`] : []),
  ...owners.map((owner) => `REVOKE ${sqlIdentifier(owner)} FROM ${qMigrator};`),
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
                WHERE m.member = '${migrator}'::regrole
                  AND m.roleid = ANY (ARRAY[${owners.map((owner) => `'${owner}'::regrole`).join(', ')}])) THEN
       RAISE EXCEPTION 'temporary migration membership survived';
     END IF;
     IF (SELECT rolcanlogin OR rolinherit OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = '${migrator}') THEN
       RAISE EXCEPTION 'migrator post-state is not NOLOGIN/NOINHERIT/NOBYPASSRLS';
     END IF;
   END $$;`,
  ...(post ? [`\\i ${post}`] : []),
  'COMMIT;',
].join('\n');

const result = spawnSync('psql', ['-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: statements, encoding: 'utf8' });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(result.status ?? 1);
if (drizzleSummary) {
  console.log(`Drizzle owner-ordered migration committed for ${qDb}: pending=${drizzleSummary.pending} total=${drizzleSummary.total}`);
} else {
  console.log(`revision-10 migration committed for ${qDb} with temporary ${qMigrator} owner memberships revoked`);
}
