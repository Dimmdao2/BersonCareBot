/**
 * Блокировка строки внутри SECURITY DEFINER оплачивается правом класса UPDATE.
 *
 * PostgreSQL берёт за `FOR UPDATE`/`FOR NO KEY UPDATE`/`FOR SHARE`/`FOR KEY SHARE` право UPDATE, а не
 * SELECT: колоночного чтения не хватает, и запрос падает `42501 permission denied for table` ещё до
 * того, как посмотрит на данные. Табличный UPDATE при этом не нужен — хватает UPDATE на одной любой
 * колонке. Живая сверка на DEV (`bcb_webapp_dev`, 22.08):
 *
 *   SET LOCAL ROLE app_seam_email_otp_owner;
 *   SELECT 1 FROM public.platform_users … LIMIT 1;             -->  1 строка
 *   SELECT 1 FROM public.platform_users … LIMIT 1 FOR UPDATE;  -->  ERROR 42501
 *   GRANT UPDATE ("updated_at") … ; тот же запрос FOR UPDATE   -->  1 строка
 *
 * Что ловит этот файл: тело шва берёт замок с таблицы, а декларация выдала владельцу шва только
 * чтение. Так 21.08 сломался вход по коду из почты — cutover канонических контактов увёл запись из
 * `platform_users` в `user_contacts`, право сузили до SELECT, а два `FOR UPDATE` в теле остались.
 * Симптом снаружи — «неверный код», отказ прав в журнале.
 *
 * Проверка идёт против ДЕЙСТВУЮЩИХ артефактов схемы (generated snapshot + активные forward-миграции),
 * то есть против того, что реально приедет в кластер, а не против пересказа в декларации.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { declaration } from './declaration.ts';
import {
  SCHEMA_SNAPSHOT, activeSchemaArtifacts, latestArtifactFunctions, rowLockedRelations,
} from './function-body-surface.mjs';

const DATABASES = ['bersoncarebot_test', 'bcb_webapp_dev'];

const declaredSignature = (name) => Object.keys(declaration.portContext.functions)
  .filter((signature) => signature.startsWith(`${name}(`));

/**
 * Владелец функции держит право класса UPDATE. Либо он ВЛАДЕЛЕЦ таблицы (у владельца права свои, их
 * никто не выдаёт грантом — так живут приватные отношения контракта port-context), либо декларация
 * выдала ему UPDATE: табличный или на любой одной колонке — PostgreSQL хватает и колоночного.
 */
const holdsUpdate = (database, relation, role) => {
  if (declaration.portContext.privateRelations?.[relation]?.owner === role) return true;
  const table = declaration.databases[database]?.tables?.[relation];
  if (table?.owner === role) return true;
  return (table?.grants?.[role]?.privs ?? [])
    .some((priv) => (typeof priv === 'string' ? priv === 'UPDATE' : priv.priv === 'UPDATE'));
};

/** Тела с замком, сведённые с объявленной функцией; пары, которые надо проверить правами. */
function lockedPairs(database) {
  const pairs = [];
  for (const fn of latestArtifactFunctions(activeSchemaArtifacts())) {
    const locked = rowLockedRelations(fn.body);
    if (locked.size === 0) continue;
    const signatures = declaredSignature(fn.name);
    if (signatures.length !== 1) continue;
    const [signature] = signatures;
    const declared = declaration.portContext.functions[signature];
    if (declared.databases && !declared.databases.includes(database)) continue;
    for (const relation of [...locked].sort()) pairs.push({ signature, relation, fn, declared });
  }
  return pairs;
}

test('каждая заблокированная телом таблица несёт владельцу шва право класса UPDATE', () => {
  const missing = [];
  for (const database of DATABASES) {
    for (const { signature, relation, declared } of lockedPairs(database)) {
      if (!holdsUpdate(database, relation, declared.owner)) {
        missing.push(`${database}: ${signature} -> ${relation} (${declared.owner})`);
      }
    }
  }
  assert.deepEqual(missing, [], 'тело блокирует строку, а роль-владелец шва получила только чтение — живой вызов упадёт 42501');
});

test('замок оплачивается одной колонкой, а не табличным UPDATE и не расширенным чтением', () => {
  const wide = [];
  for (const fn of latestArtifactFunctions(activeSchemaArtifacts())) {
    const locked = rowLockedRelations(fn.body);
    if (locked.size === 0) continue;
    const signatures = declaredSignature(fn.name);
    if (signatures.length !== 1) continue;
    const [signature] = signatures;
    const surfaces = declaration.portContext.functions[signature].relationSurfaces ?? [];
    for (const relation of [...locked].sort()) {
      const surface = surfaces.find((candidate) => candidate.relation === relation);
      if (!surface || !surface.operations.includes('UPDATE')) continue;
      // Таблица, в которую тело ещё и ПИШЕТ, держит колонки записи по существу дела; проверяется
      // только та, где UPDATE появился РАДИ ЗАМКА.
      const written = new RegExp(`\\bupdate\\s+(?:only\\s+)?${relation.replace('.', '\\.')}\\b`);
      if (written.test(fn.body) || surface.operations.includes('INSERT')) continue;
      if (surface.tableOperations?.includes('UPDATE')) {
        wide.push(`${signature} -> ${relation}: табличный UPDATE ради замка`);
        continue;
      }
      const updateColumns = surface.operationColumns?.UPDATE ?? surface.columns;
      if (updateColumns.length !== 1) {
        wide.push(`${signature} -> ${relation}: UPDATE на ${updateColumns.length} колонках`);
      }
    }
  }
  assert.deepEqual(wide, []);
});

test('лексический разбор различает замок, подзапрос и `FOR UPDATE OF`', () => {
  const body = `
    perform 1 from public.platform_users as candidate
      where candidate.id in (select challenge.user_id from public.email_challenges as challenge)
      order by candidate.id for update;
    select queue.id from public.outgoing_delivery_queue as queue
      left join public.broadcast_audit as audit on audit.id = queue.audit_id
      limit 5 for update of queue skip locked;
    with stale as (select event.ctid from public.auth_rate_limit_events event limit 10 for update)
      delete from public.auth_rate_limit_events where ctid in (select ctid from stale);
    select p.* from public.staff_security_profiles p
      where p.user_id = app.require_staff_security_self_user_id() for update;
    select organization.title from public.be_organizations as organization for share;
  `;
  assert.deepEqual([...rowLockedRelations(body)].sort(), [
    'public.auth_rate_limit_events',
    'public.be_organizations',
    'public.outgoing_delivery_queue',
    'public.platform_users',
    'public.staff_security_profiles',
  ]);
});

test('артефакты схемы читаются и содержат объявленные швы', () => {
  const artifacts = activeSchemaArtifacts();
  assert.ok(artifacts.length > 1, 'нет активных forward-миграций рядом со snapshot');
  assert.ok(readFileSync(SCHEMA_SNAPSHOT, 'utf8').length > 0);
  const locking = latestArtifactFunctions(artifacts).filter((fn) => rowLockedRelations(fn.body).size > 0);
  assert.ok(locking.length > 0, 'разбор артефактов не нашёл ни одной блокировки — сломан парсер, а не права');
});
