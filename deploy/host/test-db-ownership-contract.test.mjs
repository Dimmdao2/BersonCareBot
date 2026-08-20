// Guards the ownership regression that blocked the 2026-08-20 TEST reset: restoring as
// app_object_owner cannot create bersoncarebot_test, while the former bersoncarebot_test role
// must never be recreated or elevated. This is intentionally static: the destructive reset path
// cannot be exercised merely to verify that its three shell entrypoints still agree.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const expectedOwner = 'postgres';
const paths = {
  deploy: 'deploy/host/deploy-test.sh',
  saas: 'deploy/host/deploy-test-saas.sh',
  restore: 'deploy/host/restore-test-db-from-dump.sh',
};

function source(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function executableSource(path) {
  return source(path)
    .split(/\r?\n/u)
    .filter((line) => !/^\s*#/u.test(line))
    .join('\n');
}

function requiredMatch(path, pattern, description) {
  const match = pattern.exec(executableSource(path));
  assert.ok(match, `${path}: missing ${description}`);
  return match;
}

function assertOwner(path, found) {
  assert.equal(found, expectedOwner, `${path}: expected owner ${expectedOwner}, found ${found}`);
}

function saasFunction(name) {
  const script = executableSource(paths.saas);
  const start = script.indexOf(`${name}(){`);
  assert.notEqual(start, -1, `${paths.saas}: missing ${name}() owner assertion`);
  const end = script.indexOf('\n}', start);
  assert.notEqual(end, -1, `${paths.saas}: unterminated ${name}() owner assertion`);
  return script.slice(start, end + 2);
}

test('the three TEST reset entrypoints agree on postgres ownership', () => {
  const restoreRole = requiredMatch(paths.restore, /^RESTORE_ROLE=(\S+)$/mu, 'RESTORE_ROLE assignment')[1];
  const createdbOwner = requiredMatch(paths.restore, /\bcreatedb\s+--owner=(\S+)/u, 'createdb owner')[1];
  const pgRestoreRole = requiredMatch(paths.restore, /\bpg_restore\b[\s\S]*?--role="?\$?([A-Za-z_][A-Za-z0-9_]*)"?/u, 'pg_restore role')[1];
  const deployOwner = requiredMatch(
    paths.deploy,
    /\[\[\s+"\$database_identity"\s+==\s+"\$DB\|([^"]+)"\s+\]\]/u,
    'TEST database owner assertion',
  )[1];
  const restoreAssertion = requiredMatch(
    paths.restore,
    /\[\s+"\$database_owner"\s+=\s+([A-Za-z_][A-Za-z0-9_]*)\s+\]/u,
    'restore database owner assertion',
  )[1];
  const ownerAssertion = requiredMatch(
    paths.saas,
    /\[\s+"\$db_owner"\s+=\s+([A-Za-z_][A-Za-z0-9_]*)\s+\]/u,
    'SaaS database owner assertion',
  )[1];
  const platformUsersAssertion = requiredMatch(
    paths.saas,
    /\[\s+"\$platform_users_owner"\s+=\s+([A-Za-z_][A-Za-z0-9_]*)\s+\]/u,
    'SaaS platform_users owner assertion',
  )[1];

  assertOwner(paths.restore, restoreRole);
  assertOwner(paths.restore, createdbOwner);
  assertOwner(paths.restore, pgRestoreRole === 'RESTORE_ROLE' ? restoreRole : pgRestoreRole);
  assertOwner(paths.restore, restoreAssertion);
  assertOwner(paths.deploy, deployOwner);
  assertOwner(paths.saas, ownerAssertion);
  assertOwner(paths.saas, platformUsersAssertion);

  const restoreOwnerGate = saasFunction('assert_test_db_restore_owner_ready');
  assert.match(
    restoreOwnerGate,
    /\[\s+"\$db_owner"\s+=\s+postgres\s+\]/u,
    `${paths.saas}: assert_test_db_restore_owner_ready() must expect postgres`,
  );
});

test('the TEST reset entrypoints do not recreate or elevate the retired owner role', () => {
  for (const path of Object.values(paths)) {
    const script = executableSource(path);
    assert.doesNotMatch(
      script,
      /\bCREATE\s+ROLE\s+(?:"bersoncarebot_test"|bersoncarebot_test)\b/iu,
      `${path}: must not create retired role bersoncarebot_test`,
    );
    assert.doesNotMatch(
      script,
      /\bGRANT\s+CREATE\s+ON\s+DATABASE\b/iu,
      `${path}: must not grant CREATE ON DATABASE`,
    );
    assert.doesNotMatch(
      script,
      /\b(?:ALTER|CREATE)\s+ROLE\b(?:(?!;)[\s\S])*?\bBYPASSRLS\b/iu,
      `${path}: must not issue BYPASSRLS to any role`,
    );
  }
});
