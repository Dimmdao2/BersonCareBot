#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const image = 'postgres:16';
const container = `bcb-media-retire-${randomUUID().slice(0, 8)}`;
const role = 'bcb_test_operational_media_login';
const database = 'bersoncarebot_test';
const script = new URL('./retire-media-db-login.sh', import.meta.url).pathname;

function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function sql(statement) {
  return docker(
    'exec',
    '-i',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-Atc',
    statement,
  ).trim();
}

function retire() {
  return spawnSync(
    'docker',
    [
      'exec',
      container,
      'bash',
      '-lc',
      `function sudo() { shift 2; if [ "$1" = psql ]; then shift; command psql -U postgres "$@"; else command "$@"; fi; }; export -f sudo; bash /tmp/retire-media-db-login.sh --database ${database} --role ${role}`,
    ],
    {
      encoding: 'utf8',
    },
  );
}

try {
  docker(
    'run',
    '--rm',
    '-d',
    '--name',
    container,
    '-e',
    'POSTGRES_PASSWORD=postgres',
    '-e',
    `POSTGRES_DB=${database}`,
    image,
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      sql('SELECT 1');
      break;
    } catch (error) {
      if (attempt === 29) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  docker('cp', script, `${container}:/tmp/retire-media-db-login.sh`);

  sql(
    `CREATE ROLE ${role} LOGIN; CREATE ROLE app_operational_media_worker NOLOGIN; GRANT app_operational_media_worker TO ${role}; CREATE TABLE stale_media_acl(id integer); GRANT SELECT ON stale_media_acl TO ${role}; ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT ON TABLES TO ${role};`,
  );
  let result = retire();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname = '${role}'`), '0');
  assert.equal(
    sql(
      `SELECT count(*) FROM pg_auth_members membership JOIN pg_roles granted ON granted.oid = membership.roleid WHERE granted.rolname = 'app_operational_media_worker'`,
    ),
    '0',
  );

  result = retire();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already absent/);

  sql(
    `CREATE ROLE ${role} LOGIN; CREATE TABLE owned_by_legacy(id integer); ALTER TABLE owned_by_legacy OWNER TO ${role};`,
  );
  result = retire();
  assert.notEqual(result.status, 0, 'ownership injection must fail loudly');
  assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname = '${role}'`), '1');
  assert.equal(
    sql(`SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'owned_by_legacy'::regclass`),
    role,
  );
  console.log('retire-media-db-login disposable PostgreSQL 16 test: OK');
} finally {
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}
