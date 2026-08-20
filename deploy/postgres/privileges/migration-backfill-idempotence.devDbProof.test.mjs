/**
 * Живое доказательство одного свойства миграции «одна самостоятельная смена адреса за жизнь
 * клиники»: ПОВТОРНЫЙ прогон миграции не переписывает уже проставленный штамп `initiated_by`.
 * Opt-in: без `RUN_MIGRATION_BACKFILL_DB=1` файл пропускается, поэтому в CI он не ходит в базу.
 *
 * Какую поломку ловит (одной строкой): в миграцию возвращается бэкфилл, который вычисляет штамп
 * заново — соединением с текущим членством или любым другим внешним признаком, — и второй прогон
 * меняет значение, проставленное первым.
 *
 * Почему проверка появилась 19.08. Мигратор применяет миграции по водяному знаку `created_at`, и
 * пока строки в леджере нет, миграция остаётся pending и будет выполнена ЕЩЁ РАЗ. Первая редакция
 * несла безусловный `UPDATE … SET initiated_by = CASE WHEN EXISTS (…членство…)`. Между двумя
 * прогонами мир меняется обычной операцией: сотрудник, менявший адрес, увольняется, членство
 * удаляется каскадом — и второй прогон переводит штамп из 'clinic' в 'platform_admin', молча
 * возвращая клинике ВТОРУЮ пожизненную смену. Ровно эту последовательность здесь и проигрывают.
 *
 * Проба идёт против ЖИВОГО файла миграции, а не против его текста: файл исполняется целиком, как
 * его исполнил бы мигратор, и находится по устойчивому суффиксу имени — номер миграции временный
 * (`TEMPORARY LOCAL MIGRATION NUMBER`) и будет переназначен перед сведением в `feat`.
 *
 * Две оговорки о том, что проба сознательно снимает, — иначе она проверяла бы не то:
 *   1) append-only триггер `app.guard_organization_slug_rename_event_mutation` на время пробы
 *      выключен. Он вторая стена, а не проверяемое свойство: идемпотентным должен быть сам
 *      statement, а не только его невезение с триггером;
 *   2) проба идёт локальным админ-сокетом (`sudo -n -u postgres psql`), то есть в обход RLS.
 *      Statement с маркером `BCB-MIGRATION-OWNER` исполняется от владельца объекта, который под
 *      FORCE RLS не видит ни одной строки, а statement с маркером `BCB-MIGRATION-BACKFILL` мигратор
 *      исполняет как раз от `postgres` (`migrate-local.mjs`, RESET SESSION AUTHORIZATION). Проба
 *      берёт более разрешительный из двух режимов: свойство обязано держаться и в нём.
 *
 * Вся работа идёт в транзакции, которая заканчивается ROLLBACK: DEV-данные не меняются, фикстурное
 * членство и фикстурное событие живут только внутри неё.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_MIGRATION_BACKFILL_DB=1 node --test \
 *     deploy/postgres/privileges/migration-backfill-idempotence.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ENABLED = process.env.RUN_MIGRATION_BACKFILL_DB === '1';
const DATABASE = process.env.MIGRATION_BACKFILL_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../apps/webapp/db/drizzle-migrations',
);
const MIGRATION_SUFFIX = '_a_lifetime_allowance_counted_by_join_is_not_lifetime.sql';

function migrationPath() {
  const matches = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(MIGRATION_SUFFIX));
  if (matches.length !== 1) {
    throw new Error(`expected exactly one migration ending in ${MIGRATION_SUFFIX}, found ${matches.length}`);
  }
  return join(MIGRATIONS_DIR, matches[0]);
}

// Текст миграции вклеивается в поток psql, а не подключается через `\\i`: psql здесь работает от
// системного пользователя postgres, которому дерево репозитория в /home/dev не читается.
function migrationSql() {
  return readFileSync(migrationPath(), 'utf8');
}

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

// Фикстура: пара «пользователь + организация, в которой он ЕЩЁ не состоит», свежее членство между
// ними и событие переименования от этого актора. Событие вставляется БЕЗ `initiated_by`: до
// миграции такой колонки нет, и проба обязана уметь стартовать с до-миграционного состояния.
const FIXTURE = `
ALTER TABLE public.organization_slug_rename_events
  DISABLE TRIGGER organization_slug_rename_events_immutable_guard;

CREATE TEMP TABLE probe_pair AS
SELECT u.id AS platform_user_id, org.id AS organization_id
  FROM public.platform_users AS u
  CROSS JOIN LATERAL (
    SELECT o.id
      FROM public.be_organizations AS o
     WHERE NOT EXISTS (
       SELECT 1 FROM public.be_organization_members AS m
        WHERE m.platform_user_id = u.id AND m.organization_id = o.id)
     ORDER BY o.id
     LIMIT 1) AS org
 ORDER BY u.id
 LIMIT 1;

DO $fixture$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM probe_pair) THEN
    RAISE EXCEPTION 'fixture needs a platform user and an organization they are not a member of';
  END IF;
END $fixture$;

INSERT INTO public.be_organization_members (organization_id, platform_user_id, role)
SELECT organization_id, platform_user_id, 'admin' FROM probe_pair;

CREATE TEMP TABLE probe_event AS
WITH inserted AS (
  INSERT INTO public.organization_slug_rename_events
    (organization_id, actor_platform_user_id, previous_slug, next_slug)
  SELECT organization_id, platform_user_id, 'probe-previous-slug', 'probe-next-slug' FROM probe_pair
  RETURNING id)
SELECT id FROM inserted;`;

// Между прогонами мир меняется ровно так, как он меняется в проде: сотрудник уходит из клиники.
const EMPLOYEE_LEAVES = `
DELETE FROM public.be_organization_members AS m
 USING probe_pair AS p
 WHERE m.platform_user_id = p.platform_user_id
   AND m.organization_id = p.organization_id;`;

const STAMP_AFTER_FIRST = `
CREATE TEMP TABLE after_first AS
SELECT id, initiated_by FROM public.organization_slug_rename_events;
SELECT 'stamp-after-first=' || e.initiated_by
  FROM public.organization_slug_rename_events AS e
  JOIN probe_event AS pe USING (id);`;

const REWRITTEN_ROWS = `
SELECT 'rewritten=' || a.id::text || ':' || a.initiated_by || '->' || e.initiated_by
  FROM after_first AS a
  JOIN public.organization_slug_rename_events AS e USING (id)
 WHERE a.initiated_by IS DISTINCT FROM e.initiated_by
 ORDER BY 1;`;

// Историческая редакция бэкфилла — вычисление штампа соединением с текущим членством, без WHERE.
const UNCONDITIONAL_BACKFILL = `
UPDATE public.organization_slug_rename_events AS ev
SET initiated_by = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.be_organization_members AS member
      WHERE member.platform_user_id = ev.actor_platform_user_id
        AND member.organization_id = ev.organization_id
    ) THEN 'clinic'
    ELSE 'platform_admin'
  END;`;

function runProbe(secondPass) {
  const out = psql(`
BEGIN;
${FIXTURE}
${migrationSql()}
${STAMP_AFTER_FIRST}
${EMPLOYEE_LEAVES}
${secondPass}
${REWRITTEN_ROWS}
ROLLBACK;`);
  const lines = out.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return {
    stampAfterFirst: lines
      .filter((line) => line.startsWith('stamp-after-first='))
      .map((line) => line.slice('stamp-after-first='.length)),
    rewritten: lines
      .filter((line) => line.startsWith('rewritten='))
      .map((line) => line.slice('rewritten='.length)),
  };
}

test('applying the migration twice does not rewrite an already stamped rename event',
  { skip: !ENABLED }, () => {
    const result = runProbe(migrationSql());
    assert.deepEqual(result.stampAfterFirst, ['clinic'],
      'the fixture event must come out of the first pass stamped as a clinic-initiated rename — '
      + 'otherwise the second pass has nothing meaningful to rewrite');
    assert.deepEqual(result.rewritten, [],
      `the second pass rewrote stamped rows: ${result.rewritten.join(', ')}`);
  });

// Самопроверка пробы: заведомо неидемпотентный бэкфилл ОБЯЗАН покраснеть и назвать строку. Без неё
// зелёный результат выше не отличим от пробы, которая просто ничего не измеряет.
test('the probe names the rows a membership-recomputing backfill rewrites',
  { skip: !ENABLED }, () => {
    const result = runProbe(UNCONDITIONAL_BACKFILL);
    assert.deepEqual(result.stampAfterFirst, ['clinic']);
    assert.equal(result.rewritten.length, 1,
      'exactly the fixture event must be rewritten by the unconditional backfill');
    assert.match(result.rewritten[0], /:clinic->platform_admin$/u,
      'the rewrite must be the one that hands the clinic a second lifetime rename');
  });
