/**
 * Живое доказательство на именованной DEV-базе: `app_staff` может пройти весь write-путь
 * `createPgSpecialistTasksPort` (create/update-remind_at/complete/delete) — теми самыми операторами,
 * которые формирует Drizzle на реальных callsite'ах `apps/webapp/src/infra/repos/pgSpecialistTasks.ts`.
 * Opt-in: без `RUN_SPECIALIST_TASKS_STAFF_WRITE_DB=1` файл пропускается, в CI не ходит.
 *
 * Какую поломку ловит (одной строкой): врач не может создать/переставить задание по пациенту —
 * `POST /api/doctor/tasks` падает `42501 permission denied for table specialist_tasks` в момент,
 * когда вебапп пишет задание с `remind_at` (`docs/_TODO/runs/integrator-cleanup/
 * D30_SPECIALIST_TASK_TEST_LIVE_FAILURE_2026-08-21.md`).
 *
 * Механизм — тот же класс, что и `treatment-program-staff-insert.devDbProof.test.mjs` (проверено
 * 2026-08-20): Drizzle-ORM всегда называет ВСЕ колонки схемы в сгенерированном
 * `INSERT INTO t (...) VALUES (...)`, даже отсутствующие в `.values({...})` — им подставляется
 * `DEFAULT`, и Postgres всё равно требует колоночную привилегию INSERT на них (включая PK `id` с
 * `defaultRandom()`). Для UPDATE Drizzle называет ровно те колонки, что присутствуют в `.set({...})`
 * — здесь дыра была уже, но по другой причине: `update()` называет `remind_at` каждый раз, когда
 * патч меняет напоминание (ровно операция из заголовка D30 «вебапп пишет задание в момент установки
 * remind_at»), а колоночный UPDATE-грант `app_staff` эту колонку не перечислял вовсе.
 *
 * ЧЕТЫРЕ пробы — по одной на каждый метод порта, той же формой операторов, что и реальный callsite:
 *   1. create()  — INSERT называет все 13 колонок схемы (9 — литералом, 4 — DEFAULT).
 *   2. update()  — UPDATE меняет remind_at (плюс organization_id/updated_at, которые ставит порт
 *      на каждый update). Это ровно то, что ловил D30-дефект: до фикса грант молчал про remind_at.
 *   3. complete() — UPDATE ставит completed_at (плюс organization_id/updated_at).
 *   4. delete()  — DELETE (табличная привилегия, регрессионный смоук, не только колоночная).
 *
 * Проверка идёт против ЖИВЫХ грантов каталога, не текста declaration.ts. Каждая проба — свой
 * BEGIN/ROLLBACK: DEV-данные не меняются. Локальный админ-сокет (`sudo -n -u postgres psql`), как
 * читающие проверки в AGENTS.md §6; тело пробы делает `SET ROLE app_staff` внутри той же сессии.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_SPECIALIST_TASKS_STAFF_WRITE_DB=1 node --test \
 *     deploy/postgres/privileges/specialist-tasks-staff-write.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_SPECIALIST_TASKS_STAFF_WRITE_DB === '1';
const DATABASE = process.env.SPECIALIST_TASKS_STAFF_WRITE_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

const ORG = 'd0000000-0000-4000-8000-000000000004';

// Один оператор на метод порта, названный ровно так, как Drizzle называет его на реальном
// callsite (`pgSpecialistTasks.ts`): INSERT перечисляет каждую колонку схемы; UPDATE — ровно те
// колонки, что порт кладёт в `.set({...})` на этом пути. Это верхняя граница, которую обязан
// покрыть грант; уже, чем эта форма, ни один реальный вызов не бывает.
const OPERATION_PROBES = [
  {
    method: 'create',
    sql: `INSERT INTO specialist_tasks
      (id, organization_id, owner_user_id, patient_user_id, title, description, due_at, remind_at,
       is_important, completed_at, reminder_sent_at, created_at, updated_at)
      VALUES (default, '${ORG}'::uuid, gen_random_uuid(), gen_random_uuid(), 't', null, null,
              now(), false, default, default, default, now())`,
  },
  {
    method: 'update (remind_at)',
    sql: `UPDATE specialist_tasks
      SET organization_id = '${ORG}'::uuid, updated_at = now(), remind_at = now()
      WHERE id = gen_random_uuid() AND owner_user_id = gen_random_uuid()`,
  },
  {
    method: 'complete',
    sql: `UPDATE specialist_tasks
      SET organization_id = '${ORG}'::uuid, completed_at = now(), updated_at = now()
      WHERE id = gen_random_uuid() AND owner_user_id = gen_random_uuid() AND completed_at IS NULL`,
  },
  {
    method: 'delete',
    sql: `DELETE FROM specialist_tasks WHERE id = gen_random_uuid() AND owner_user_id = gen_random_uuid()`,
  },
];

/**
 * Прогоняет каждую пробу собственным psql-вызовом (`BEGIN; SET ROLE app_staff; <оператор>; ROLLBACK;`)
 * — так же, как соседний `treatment-program-staff-insert.devDbProof.test.mjs`, чтобы одна упавшая
 * проба не роняла остальные и не оставляла запись после себя.
 */
function probeAll(probes) {
  return probes.map(({ method, sql }) => {
    try {
      execFileSync(
        'sudo',
        ['-n', '-u', 'postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
          '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-f', '-'],
        {
          input: `BEGIN;\nSET ROLE app_staff;\n${sql};\nROLLBACK;`,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      return { method, ok: true, error: null };
    } catch (err) {
      const stderr = String(err.stderr ?? err.message ?? '');
      const match = stderr.match(/ERROR:\s*(.+)/);
      return { method, ok: false, error: match ? match[1].trim() : stderr.trim() };
    }
  });
}

test('app_staff can run every createPgSpecialistTasksPort write operator without "permission denied for table"',
  { skip: !ENABLED }, () => {
    const results = probeAll(OPERATION_PROBES);
    for (const { method, ok, error } of results) {
      // The grant check happens before RLS/context evaluation, so a successful grant either lets
      // the statement through outright or fails later on missing accepted port-context/org context
      // (0 rows matched, or an RLS WITH CHECK failure) — never on "permission denied for table".
      // Any 42501 "permission denied" here means the declared INSERT/UPDATE column grant is missing
      // a column this operator names.
      assert.ok(
        ok || !/permission denied for table/i.test(error ?? ''),
        `${method}: must not fail on missing table/column privilege — got: ${error}`,
      );
    }
  });

// Самопроверка: снятая привилегия на UPDATE(remind_at) обязана вернуть ровно тот 42501, ради
// которого написан этот файл — иначе проба выше ничего не проверяет. remind_at — сама колонка из
// заголовка D30 («вебапп пишет задание в момент установки remind_at»), которую грант молчал.
test('the probe detects a column grant that is missing "remind_at" on UPDATE again', { skip: !ENABLED }, () => {
  // No BEGIN here on purpose: each of these is its own auto-committed statement (psql's default
  // outside an explicit transaction block), so the weakened state is actually live for probeAll's
  // separate connection, and the restore in `finally` is guaranteed to run even if the assertion
  // below throws.
  psql('REVOKE UPDATE ("remind_at") ON TABLE public.specialist_tasks FROM app_staff;');
  try {
    const [result] = probeAll([OPERATION_PROBES.find((p) => p.method === 'update (remind_at)')]);
    assert.equal(result.ok, false, 'without UPDATE(remind_at) the probe must fail');
    assert.match(result.error ?? '', /permission denied for table/i);
  } finally {
    psql('GRANT UPDATE ("remind_at") ON TABLE public.specialist_tasks TO app_staff;');
  }
});
