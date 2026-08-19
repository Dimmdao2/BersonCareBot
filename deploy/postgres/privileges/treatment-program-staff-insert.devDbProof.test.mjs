/**
 * Живое доказательство на именованной DEV-базе: `app_staff` может создать задание/этап/группу/
 * рекомендацию/упражнение программы через Drizzle-формируемый `INSERT`, где сервер-генерируемые
 * колонки (`id`, `created_at`, `updated_at`, …) явно перечислены в списке колонок со значением
 * `DEFAULT`. Opt-in: без `RUN_TREATMENT_PROGRAM_STAFF_INSERT_DB=1` файл пропускается, в CI не ходит.
 *
 * Какую поломку ловит (одной строкой): врач не может дописать упражнение/этап/рекомендацию в
 * программу пациента — INSERT падает `42501 permission denied for table X`, хотя таблица врачу
 * объявлена «для записи».
 *
 * Механизм (замерено 2026-08-20, docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md
 * §«Пятая ошибка живого прохода»): Drizzle-ORM всегда перечисляет ВСЕ колонки схемы в
 * сгенерированном `INSERT INTO t (...) VALUES (...)` — любой ключ, отсутствующий в `.values({...})`,
 * всё равно попадает в список колонок со значением `DEFAULT` (в том числе PK `id` с
 * `defaultRandom()`, который НИ ОДИН вызывающий код никогда не задаёт явно). Postgres требует
 * привилегию INSERT на КАЖДУЮ колонку, названную в операторе, даже когда её значение — `DEFAULT`.
 * Декларация (`relation-access.ts`) объявляла app_staff только «содержательные» бизнес-колонки,
 * без `id`/`created_at`/`updated_at` — весь INSERT падал целиком, независимо от того, какие
 * колонки реально заполнял вызывающий код. Живой лог 20.08 00:16 (TEST,
 * `bcb_test_webapp_staff@bersoncarebot_test`) содержит статью с ровно этой формой (id и settings
 * поименованы, значение `default`).
 *
 * Проверка идёт против ЖИВЫХ грантов в каталоге, не против текста declaration.ts — поэтому не
 * зависит от того, как записана декларация. Каждая таблица проверяется в своей SAVEPOINT и
 * откатывается: DEV-данные не меняются. Проба идёт локальным админ-сокетом (`sudo -n -u postgres
 * psql`), как читающие проверки в AGENTS.md §6 — тело пробы делает `SET ROLE app_staff` внутри той
 * же сессии, поэтому GRANT-проверка идёт по-настоящему от имени рантайм-роли.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_TREATMENT_PROGRAM_STAFF_INSERT_DB=1 node --test \
 *     deploy/postgres/privileges/treatment-program-staff-insert.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_TREATMENT_PROGRAM_STAFF_INSERT_DB === '1';
const DATABASE = process.env.TREATMENT_PROGRAM_STAFF_INSERT_PROOF_DB ?? 'bcb_webapp_dev';

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

// Один INSERT на таблицу, названный ровно так, как Drizzle называет его на реальном вызывающем
// callsite: каждая колонка схемы присутствует в списке, отсутствующие в JS-объекте — как DEFAULT.
// Это верхняя граница, которую обязан покрыть грант; уже, чем эта форма, ни один реальный insert
// не бывает.
const TABLE_PROBES = [
  {
    table: 'treatment_program_instances',
    sql: `INSERT INTO treatment_program_instances
      (id, organization_id, template_id, patient_user_id, assigned_by, title, status, created_at,
       updated_at, patient_plan_last_opened_at, assignment_source)
      VALUES (default, '${ORG}'::uuid, null, gen_random_uuid(), null, 't', 'active', default,
              default, null, 'doctor')`,
  },
  {
    table: 'treatment_program_instance_stages',
    sql: `INSERT INTO treatment_program_instance_stages
      (id, organization_id, instance_id, source_stage_id, title, description, sort_order,
       local_comment, skip_reason, status, started_at, goals, objectives, expected_duration_days,
       expected_duration_text)
      VALUES (default, '${ORG}'::uuid, gen_random_uuid(), null, 't', null, 0, null, null,
              'available', null, null, null, null, null)`,
  },
  {
    table: 'treatment_program_instance_stage_items',
    sql: `INSERT INTO treatment_program_instance_stage_items
      (id, organization_id, stage_id, item_type, item_ref_id, sort_order, comment, local_comment,
       settings, snapshot, completed_at, is_actionable, status, group_id, created_at, last_viewed_at)
      VALUES (default, '${ORG}'::uuid, gen_random_uuid(), 'exercise', gen_random_uuid(), 0, null,
              null, default, '{}'::jsonb, null, null, 'active', null, default, null)`,
  },
  {
    table: 'treatment_program_instance_stage_groups',
    sql: `INSERT INTO treatment_program_instance_stage_groups
      (id, organization_id, stage_id, source_group_id, title, description, schedule_text,
       sort_order, system_kind)
      VALUES (default, '${ORG}'::uuid, gen_random_uuid(), null, 't', null, null, 0, null)`,
  },
  {
    table: 'treatment_program_events',
    sql: `INSERT INTO treatment_program_events
      (id, organization_id, instance_id, actor_id, event_type, target_type, target_id, payload,
       reason, created_at)
      VALUES (default, '${ORG}'::uuid, gen_random_uuid(), null, 'item_added',
              'stage_item_instance', gen_random_uuid(), default, null, default)`,
  },
  {
    table: 'recommendations',
    sql: `INSERT INTO recommendations
      (id, organization_id, title, body_md, media, tags, domain, body_region_id, quantity_text,
       frequency_text, duration_text, is_archived, created_by, created_at, updated_at)
      VALUES (default, '${ORG}'::uuid, 't', 'b', default, null, null, null, null, null, null,
              default, null, default, default)`,
  },
  {
    table: 'lfk_exercises',
    sql: `INSERT INTO lfk_exercises
      (id, owner_kind, organization_id, catalog_scope, title, description, region_ref_id,
       load_type, difficulty_1_10, contraindications, tags, is_archived, created_by, created_at,
       updated_at)
      VALUES (default, 'organization', '${ORG}'::uuid, 'personal', 't', null, null, null, null,
              null, null, default, null, default, default)`,
  },
  {
    table: 'lfk_exercise_media',
    sql: `INSERT INTO lfk_exercise_media
      (id, owner_kind, organization_id, exercise_id, media_url, media_type, sort_order, created_at)
      VALUES (default, 'organization', '${ORG}'::uuid, gen_random_uuid(), 'https://x', 'image', 0,
              default)`,
  },
];

/**
 * Прогоняет каждую пробу в своей SAVEPOINT внутри одной сессии-под-app_staff и возвращает
 * 'ok' | 'ERRCODE|message' на каждую — psql печатает `ERROR:` в stdout построчно только через
 * `\echo`, поэтому исход читаем из `pg_catalog.pg_stat_...`-независимого маркера: сама psql
 * останавливается на первой ошибке транзакции только если стоит `ON_ERROR_STOP`, поэтому каждая
 * проба идёт отдельным psql-вызовом (одна SAVEPOINT/ROLLBACK TO — не отдельная сессия, но
 * `ON_ERROR_STOP=1` уронил бы весь батч на первой красной пробе).
 */
function probeAll(probes) {
  return probes.map(({ table, sql }) => {
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
      return { table, ok: true, error: null };
    } catch (err) {
      const stderr = String(err.stderr ?? err.message ?? '');
      const match = stderr.match(/ERROR:\s*(.+)/);
      return { table, ok: false, error: match ? match[1].trim() : stderr.trim() };
    }
  });
}

test('app_staff can name every schema column (including server-defaulted ones) on an INSERT into every program-editing table',
  { skip: !ENABLED }, () => {
    const results = probeAll(TABLE_PROBES);
    for (const { table, ok, error } of results) {
      // The grant check happens before RLS/context evaluation, so a successful grant either lets
      // the insert through outright or fails later on missing accepted port-context/org context —
      // never on "permission denied for table". Any 42501 "permission denied" here means the
      // declared INSERT column grant is missing a column Drizzle names by default.
      assert.ok(
        ok || !/permission denied for table/i.test(error ?? ''),
        `${table}: INSERT with every schema column named must not fail on missing table privilege — got: ${error}`,
      );
    }
  });

// Самопроверка: снятая привилегия на "id" обязана вернуть ровно тот 42501, ради которого написан
// этот файл — иначе проба выше ничего не проверяет.
test('the probe detects a column grant that is missing "id" again', { skip: !ENABLED }, () => {
  // No BEGIN here on purpose: each of these is its own auto-committed statement (psql's default
  // outside an explicit transaction block), so the weakened state is actually live for probeAll's
  // separate connection, and the restore in `finally` is guaranteed to run even if the assertion
  // below throws.
  psql('REVOKE INSERT ("id") ON TABLE public.treatment_program_instance_stage_items FROM app_staff;');
  try {
    const [result] = probeAll([TABLE_PROBES.find((p) => p.table === 'treatment_program_instance_stage_items')]);
    assert.equal(result.ok, false, 'without INSERT("id") the probe must fail');
    assert.match(result.error ?? '', /permission denied for table/i);
  } finally {
    psql('GRANT INSERT ("id") ON TABLE public.treatment_program_instance_stage_items TO app_staff;');
  }
});
