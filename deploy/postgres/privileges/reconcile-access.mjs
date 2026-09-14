#!/usr/bin/env node
/**
 * Repeatable access reconcile for one database that has already completed initial cutover.
 * It never runs legacy cleanup, zero-state, target-login cleanup, or database restore.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', '..');

// Сколько ждать чужой замок, прежде чем отступить. Три секунды — заметно больше любого живого
// запроса приложения и заметно меньше того, что пользователь считает зависанием.
const LOCK_TIMEOUT_SQL_LITERAL = "'3s'";
const RETRY_BACKOFF_SECONDS = [5, 15, 45, 90];

function value(name, fallback = undefined) {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0) {
    if (fallback !== undefined) return fallback;
    throw new Error(`--${name} is required`);
  }
  const result = process.argv[at + 1];
  if (!result || result.startsWith('--')) throw new Error(`--${name} requires a value`);
  return result;
}

const allowedArgs = new Set(['--env', '--db', '--admin-socket', '--admin-port']);
for (let index = 2; index < process.argv.length; index += 2) {
  if (!allowedArgs.has(process.argv[index]) || !process.argv[index + 1]) {
    throw new Error(`unsupported argument '${process.argv[index] ?? ''}'`);
  }
}

const envName = value('env');
if (!/^[a-z][a-z0-9_-]*$/u.test(envName)) throw new Error(`unsafe environment '${envName}'`);
const dbName = value('db');
if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(dbName)) throw new Error(`unsafe database identifier '${dbName}'`);
const requestedSocket = value('admin-socket');
if (!existsSync(requestedSocket)) {
  throw new Error('--admin-socket must be an existing local PostgreSQL socket directory');
}
const adminSocket = realpathSync(requestedSocket);
if (!adminSocket.startsWith('/')) throw new Error('--admin-socket must resolve to an absolute local path');
const adminPort = value('admin-port', '5432');
if (!/^[1-9][0-9]{0,4}$/u.test(adminPort) || Number(adminPort) > 65535) {
  throw new Error('--admin-port must be a TCP port number');
}

const files = [
  'deploy/postgres/port-context/contract.sql',
  `deploy/postgres/generated/org-allowlist.${dbName}.sql`,
];
for (const file of files) {
  if (!existsSync(resolve(root, file))) throw new Error(`missing ${file}`);
}

function run(commandName, args, options = {}) {
  const postgresIdentity = process.getuid?.() === 0 && commandName === 'psql';
  const executable = postgresIdentity ? 'runuser' : commandName;
  const executableArgs = postgresIdentity ? ['-u', 'postgres', '--', commandName, ...args] : args;
  return spawnSync(executable, executableArgs, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function command(commandName, args, options = {}) {
  const result = run(commandName, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${commandName} failed (${result.status ?? result.signal}):\n${result.stderr ?? ''}${result.stdout ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

function generator(...args) {
  return command('node', [
    '--experimental-strip-types',
    resolve(root, 'deploy/postgres/privileges/generate-cli.mjs'),
    ...args,
  ]);
}

function repositorySql(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

generator('--db', dbName, '--check');
// Same gate, port-context artifact: `--check` alone only covers privileges/allowlist
// (`buildArtifacts` in generate-cli.mjs branches on `--port-context-only` — one call can't check
// both). Without this second call the committed `port-context-capabilities.*.sql` files can drift
// from the declaration (or, as found 19.08, keep unresolved merge-conflict markers) and no deploy
// or CI step would ever notice — this reconcile is the only place that already gates on `--check`.
generator('--db', dbName, '--check', '--port-context-only');
const sql = [
  '\\set ON_ERROR_STOP on',
  `\\set DBNAME ${dbName}`,
  generator('--env', envName, '--db', dbName, '--env-login-variables'),
  'BEGIN;',
  // Замок берём С ОЖИДАНИЕМ, а не намертво. Без этого первый же занятый объект ставил reconcile в
  // очередь на ACCESS EXCLUSIVE, а за ним — ВСЕХ последующих читателей той же таблицы: живая работа
  // клиники вставала до конца деплоя. С таймаутом попытка падает целиком и повторяется позже, когда
  // очередной запрос отпустит объект; частичного состояния при этом не остаётся — транзакция одна.
  `SET LOCAL lock_timeout = ${LOCK_TIMEOUT_SQL_LITERAL};`,
  `SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bcb-access-reconcile:' || current_database(), 0));`,
  // Target login shells, attributes, memberships and passwords are the only
  // allowed cluster mutations in a per-target reconcile.
  generator('--env', envName, '--db', dbName),
  // Verify the complete shared graph after repairing this target's exact four
  // login edges. Sibling or rogue edges are never repaired here.
  // `--db` здесь называет КЛАСТЕР цели: роль-мигратор объявлена на среду, и требовать мигратора
  // соседнего окружения в этом кластере — гарантированный ложный drift.
  generator('--shared-role-verify', '--db', dbName),
  repositorySql('deploy/postgres/port-context/contract.sql'),
  generator('--db', dbName, '--relation-wall-registry'),
  repositorySql(`deploy/postgres/generated/org-allowlist.${dbName}.sql`),
  generator('--db', dbName, '--target-access-only'),
  // The deny-by-default target artifact revokes login ACLs before rebuilding
  // canonical-role access. Reapply the same four target logins last so their
  // exact CONNECT/schema ACLs and memberships are the committed final state.
  generator('--env', envName, '--db', dbName),
  generator('--db', dbName, '--port-context-verify'),
  generator('--env', envName, '--db', dbName, '--env-verify'),
  generator('--db', dbName, '--catalog-closure-verify'),
  'COMMIT;',
].join('\n');

/**
 * Отказ из-за замка — это НЕ поломка прав, а «сейчас занято»: объект держит живой запрос. Такую
 * попытку повторяем целиком, потому что reconcile атомарен и после отката база осталась ровно в том
 * состоянии, в котором была. Любая другая ошибка — настоящая: падаем сразу и громко.
 */
function isLockContention(output) {
  return /lock timeout|deadlock detected|55P03|40P01/iu.test(output);
}

function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

const psqlArgs = [
  '-X', '-h', adminSocket, '-p', adminPort, '-U', 'postgres', '-d', dbName,
  '-v', 'ON_ERROR_STOP=1',
];
let applied = false;
for (let attempt = 1; attempt <= RETRY_BACKOFF_SECONDS.length + 1 && !applied; attempt += 1) {
  const result = run('psql', psqlArgs, { input: sql });
  if (result.status === 0) {
    applied = true;
    break;
  }
  const output = `${result.stderr ?? ''}${result.stdout ?? ''}`;
  const backoff = RETRY_BACKOFF_SECONDS[attempt - 1];
  if (!isLockContention(output) || backoff === undefined) {
    throw new Error(`psql failed (${result.status ?? result.signal}):\n${output}`);
  }
  console.warn(
    `access reconcile: объект занят живым запросом (попытка ${attempt}), повтор через ${backoff} c`,
  );
  sleepSeconds(backoff);
}
console.log(
  `access reconcile committed: env=${envName} database=${dbName}; local admin socket=${adminSocket}`,
);
