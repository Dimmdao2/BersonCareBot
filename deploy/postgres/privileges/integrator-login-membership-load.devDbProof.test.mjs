/**
 * D17 шаг 3 — живое доказательство того, что два членства логина интегратора НЕСУЩИЕ, а не
 * остаточные: `app_tenant_service` и `app_operational_delivery_worker`.
 *
 * Какую поломку ловит (одной строкой): кто-то снимает одно из этих членств (или сужает права
 * роли), не переведя сначала живые пути, — и приём сообщений или доставка молча получают 42501.
 *
 * Почему проверка появилась 22.08. Шаг 3 должен был снять «лишние» членства, а замер показал
 * обратное: снимать нечего, потому что обе роли держат живой продукт.
 *   • `app_tenant_service` — ЕДИНСТВЕННАЯ из шести ролей логина, которой видны шесть колонок,
 *     читаемых реляционными читателями интегратора (`repos/platformUserByChannel.ts:127-129`,
 *     `repos/reminders.ts:28-32,323,343,374,394`, `repos/adminStats.ts:44,50,51`). Ни одна другая
 *     роль их не видит, значит снятие членства = отказ на разрешении получателя.
 *   • `app_operational_delivery_worker` — единственная, которой доступна `UPDATE` очереди
 *     `public.outgoing_delivery_queue` (`repos/outgoingDeliveryQueue.ts`, `repos/jobQueue.ts`),
 *     то есть без неё воркер доставки не двигает ни одной строки.
 * Ни один офлайн-тест этого не краснит: декларация описывает ЖЕЛАЕМОЕ состояние прав, а вопрос
 * здесь другой — хватает ли оставшихся ролей живому коду. Ответ живёт только в кластере.
 *
 * Проверка идёт против ЖИВОГО каталога прав, а не против текста декларации, и потому краснеет и
 * тогда, когда декларацию правят, и тогда, когда кластер разъезжается с ней.
 *
 * Третий тест — самопроверка батареи: заведомо ложная цель (роль, которой этих прав не давали)
 * ОБЯЗАНА не пройти тот же предикат. Без неё зелёный цвет ничего не значил бы.
 *
 * Читать `pg_roles`/`has_column_privilege` может любой, но держим тот же локальный админ-канал,
 * что и соседние живые пробы (AGENTS.md §6). Ничего не пишется: только SELECT.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_INTEGRATOR_MEMBERSHIP_DB=1 node --test \
 *     deploy/postgres/privileges/integrator-login-membership-load.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_INTEGRATOR_MEMBERSHIP_DB === '1';
const DATABASE = process.env.INTEGRATOR_MEMBERSHIP_PROOF_DB ?? 'bcb_webapp_dev';
const LOGIN = process.env.INTEGRATOR_MEMBERSHIP_PROOF_LOGIN ?? 'bcb_dev_integrator';

for (const [name, value] of [['database', DATABASE], ['login', LOGIN]]) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) throw new Error(`unsafe ${name} identifier '${value}'`);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/** Роли, в которые логин интегратора умеет `SET ROLE`; порядок не важен, состав — да. */
function memberships() {
  return psql(`
    SELECT r.rolname
    FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid
    JOIN pg_roles g ON g.oid = m.member
    WHERE g.rolname = '${LOGIN}'
    ORDER BY 1;
  `).split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * Колонки, которые читают живые реляционные читатели интегратора под организационным принципалом.
 * Каждая строка — `отношение`, `колонка`, и место в коде, откуда она читается.
 */
const TENANT_SERVICE_READS = [
  ['public.platform_users', 'integrator_user_id', 'repos/platformUserByChannel.ts:127'],
  ['public.user_contacts', 'platform_user_id', 'repos/platformUserByChannel.ts:128'],
  ['public.user_channel_bindings', 'user_id', 'repos/platformUserByChannel.ts:129'],
  ['public.org_enrollments', 'platform_user_id', 'repos/reminders.ts:30'],
  ['public.be_organization_members', 'platform_user_id', 'repos/reminders.ts:32'],
  ['public.reminder_rules', 'integrator_rule_id', 'repos/reminders.ts:323'],
];

/** Очередь доставки: без этих операций воркер не двигает ни одной строки. */
const DELIVERY_WORKER_WRITES = [
  ['public.outgoing_delivery_queue', 'status', 'UPDATE', 'repos/outgoingDeliveryQueue.ts:177'],
  ['public.outgoing_delivery_queue', 'attempt_count', 'UPDATE', 'repos/jobQueue.ts:163'],
  ['integrator.direct_public_write_retries', 'status', 'UPDATE', 'repos/directPublicWriteRetry.ts'],
];

/** Кто из ролей логина видит колонку — список имён. */
function rolesWithColumnPrivilege(roles, relation, column, privilege) {
  const values = roles.map((r) => `('${r}')`).join(',');
  const out = psql(`
    SELECT role_name FROM (VALUES ${values}) AS candidate(role_name)
    WHERE has_column_privilege(candidate.role_name, '${relation}', '${column}', '${privilege}')
    ORDER BY 1;
  `);
  return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

test('app_tenant_service — единственная роль логина, которой видны колонки живых читателей', { skip: !ENABLED }, () => {
  const roles = memberships();
  assert.ok(roles.includes('app_tenant_service'), `логин ${LOGIN} не член app_tenant_service`);
  for (const [relation, column, where] of TENANT_SERVICE_READS) {
    const holders = rolesWithColumnPrivilege(roles, relation, column, 'SELECT');
    assert.deepEqual(
      holders,
      ['app_tenant_service'],
      `${relation}.${column} (${where}): ожидали ровно app_tenant_service, получили [${holders.join(', ')}]`,
    );
  }
});

test('app_operational_delivery_worker — единственная роль логина, которой доступна запись очереди', { skip: !ENABLED }, () => {
  const roles = memberships();
  assert.ok(roles.includes('app_operational_delivery_worker'), `логин ${LOGIN} не член app_operational_delivery_worker`);
  for (const [relation, column, privilege, where] of DELIVERY_WORKER_WRITES) {
    const holders = rolesWithColumnPrivilege(roles, relation, column, privilege);
    assert.deepEqual(
      holders,
      ['app_operational_delivery_worker'],
      `${relation}.${column} ${privilege} (${where}): ожидали ровно app_operational_delivery_worker, получили [${holders.join(', ')}]`,
    );
  }
});

test('самопроверка: предикат отличает роль, которой этих прав не давали', { skip: !ENABLED }, () => {
  // `app_integrator_request` — рабочая роль того же логина, и на `public.*` у неё ноль прав
  // (перепись D17, WORK_ORDER). Если предикат начнёт отвечать «да» кому угодно, оба теста выше
  // станут бессмысленно зелёными — эта проверка ловит именно такой отказ батареи.
  for (const [relation, column] of TENANT_SERVICE_READS) {
    const holders = rolesWithColumnPrivilege(['app_integrator_request'], relation, column, 'SELECT');
    assert.deepEqual(holders, [], `${relation}.${column}: app_integrator_request не должен видеть колонку`);
  }
  const queue = rolesWithColumnPrivilege(['app_integrator_request'], 'public.outgoing_delivery_queue', 'status', 'UPDATE');
  assert.deepEqual(queue, [], 'app_integrator_request не должен писать очередь доставки');
});
