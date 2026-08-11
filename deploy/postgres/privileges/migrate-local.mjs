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

function value(name) {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`--${name} is required`);
  return process.argv[at + 1];
}

function sqlIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) throw new Error(`unsafe role name '${value}'`);
  return `"${value}"`;
}

const db = value('db');
const migrator = value('migrator');
const owners = [value('owner')];
const migration = realpathSync(resolve(value('migration')));
const backfill = process.argv.includes('--backfill') ? realpathSync(resolve(value('backfill'))) : null;
const post = process.argv.includes('--post') ? realpathSync(resolve(value('post'))) : null;
if (!existsSync(migration) || (backfill && !existsSync(backfill)) || (post && !existsSync(post))) {
  throw new Error('migration/backfill/post file does not exist');
}

const qDb = sqlIdentifier(db);
const qMigrator = sqlIdentifier(migrator);
const statements = [
  '\\set ON_ERROR_STOP on',
  'BEGIN;',
  ...owners.map((owner) => `GRANT ${sqlIdentifier(owner)} TO ${qMigrator} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;`),
  `SET LOCAL SESSION AUTHORIZATION ${qMigrator};`,
  ...owners.flatMap((owner) => [
    `SET LOCAL ROLE ${sqlIdentifier(owner)};`,
    "SELECT session_user, current_user, has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public;",
    `\\i ${migration}`,
    'RESET ROLE;',
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
console.log(`revision-10 migration committed for ${qDb} with temporary ${qMigrator} owner memberships revoked`);
