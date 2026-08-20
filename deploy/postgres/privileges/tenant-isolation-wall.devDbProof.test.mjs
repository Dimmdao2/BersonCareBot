/**
 * Живое доказательство ОДНОГО обещания системы: клиника не видит строк другой клиники.
 *
 * Почему файл существует. У самого важного обещания платформы не было ни одной поведенческой
 * проверки — и поэтому настоящая дыра прожила незамеченной: до 19.08 `app.install_port_context`
 * принимала ЛЮБУЮ названную организацию, включая выдуманную, и ничего не краснело. Дыру закрыл
 * `app_ext.assert_port_context_claim`, но регрессию по-прежнему никто бы не заметил.
 *
 * Проверяется ПОВЕДЕНИЕ, а не устройство. Здесь нет ни одной проверки того, что какая-то функция
 * существует, что в её теле есть сравнение, что счётчик равен числу или что политика называется
 * так-то. Заменить весь механизм стены на другой — проверка обязана остаться зелёной, пока обещание
 * держится, и покраснеть, как только оно перестало держаться.
 *
 * ТРИ утверждения, больше сюда не дописывать (четвёртое свойство — отдельный файл):
 *   1. С законным контекстом клиники A видны только строки A: ни одна возвращённая строка не несёт
 *      чужой organization_id.
 *   2. Контекст на клинику, к которой актор не принадлежит, ПОЛУЧИТЬ НЕЛЬЗЯ: установка отказывает
 *      кодом 42501, а не выдаёт пустой обзор.
 *   3. Без контекста вовсе чтение ОТКАЗЫВАЕТ, а не отвечает нулём строк. Ровно эта форма — «успех,
 *      сделано ничего» — месяцами прятала сломанную уборку по сроку хранения.
 *
 * ЛОВУШКА ПУСТОТЫ — то, ради чего проверку стоит держать. «A не видит B» истинно бесплатно, если у
 * B нет строк. Поэтому на каждую таблицу-предмет СНАЧАЛА привилегированной ролью доказывается, что
 * чужие строки в ней есть; таблица без чужих строк не засчитывается пройденной, а объявляется
 * НЕ ПРОВЕРЕННОЙ с причиной. Если так вышло со ВСЕМИ таблицами — проверка ПАДАЕТ со словами
 * «доказывать нечего», а не зеленеет.
 *
 * ПРЕДМЕТЫ берутся из декларации (`declaration.ts`), а не из списка в этом файле: таблицы, чья стена —
 * `clinic`, `clinic+patient`, `reference-org-copy` или `platform-role+clinic`. Таблица, добавленная в
 * декларацию завтра, попадает под проверку сама, без правки этого файла. (До 2026-08-20 предмет ещё и
 * требовал `org === true` — поле переписи «нашли колонку `organization_id`», а не признак стены — и это
 * держало вне проверки 50 стенованных таблиц, которых перепись просто не касалась; см. `subjectsFromDeclaration`.)
 *
 * Как ходит проба. Личность порта здесь настоящая: `SET LOCAL SESSION AUTHORIZATION <логин порта>`
 * делает `session_user` тем самым логином, поэтому используется НАСТОЯЩАЯ capability-строка порта и
 * настоящий путь `app.begin_port_context`. Пароли и клиентские сертификаты для этого не нужны, и
 * доказательство не зависит от того, как устроен mTLS. Наблюдать приватные таблицы шва может только
 * их владелец или суперпользователь, поэтому проба идёт локальным админ-сокетом
 * (`sudo -n -u postgres psql`), как читающие проверки в AGENTS.md §6.
 *
 * НИЧЕГО НЕ ПИШЕТ: вся работа под контекстом идёт в транзакции, которая заканчивается ROLLBACK,
 * фикстуры не создаются, строки не остаются. Единственная запись — строка принятого контекста,
 * которую вставляет сам шов и которая по построению не переживает транзакцию.
 *
 * Запуск руками:
 *   RUN_TENANT_ISOLATION_WALL_DB=1 node --test \
 *     deploy/postgres/privileges/tenant-isolation-wall.devDbProof.test.mjs
 * В выкатке TEST флаг ставит `deploy/host/deploy-test.sh` — после сверки прав и ДО перезапуска
 * служб, чтобы плохая выкатка останавливалась, не дойдя до живых людей.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { declaration } from './declaration.ts';

const ENABLED = process.env.RUN_TENANT_ISOLATION_WALL_DB === '1';
const DATABASE = process.env.TENANT_ISOLATION_PROOF_DB ?? process.env.PORT_CONTEXT_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

/** Стены, которые несут организационный предикат. Остальные org-таблицы (`platform-role`) арендной
 *  роли не открыты вовсе и предметом этой проверки не являются. */
const TENANT_WALLS = new Set(['clinic', 'clinic+patient', 'reference-org-copy', 'platform-role+clinic']);

/**
 * Предметы — из декларации, не из списка здесь. Раньше предмет ещё и требовал `table.org === true`;
 * это поле в декларации значит «перепись ИЗМЕРИЛА и таблица несёт organization_id», а не «у таблицы
 * есть стена клиники» (types.ts: «Опущено там, где перепись не мерила»). Требовать его тут держало
 * вне проверки 50 таблиц под стеной клиники (`be_payments`, `support_conversations`, `system_settings`,
 * `saas_billing_*` и другие) — не потому что стены нет, а потому что перепись поля `org` их не
 * коснулась (blind-audit F1, 2026-08-19/20). Стену определяет ИСКЛЮЧИТЕЛЬНО `wall`; наличие самой
 * колонки `organization_id` на каждый предмет всё равно перепроверяет `census()` ниже на живой базе —
 * таблица без колонки уходит в «не проверено» с причиной, а не молча выпадает из предметов.
 */
function subjectsFromDeclaration(database) {
  const declared = declaration.databases[database];
  if (!declared) throw new Error(`декларация не знает базы '${database}'`);
  return Object.entries(declared.tables)
    .filter(([, table]) => TENANT_WALLS.has(table.wall) && table.disposition === 'ACTIVE')
    .map(([name]) => name)
    .sort();
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function checkedIdentifier(name) {
  if (!IDENTIFIER.test(name)) throw new Error(`декларация назвала небезопасное имя отношения: '${name}'`);
  return name;
}

function checkedUuid(value, what) {
  if (!UUID.test(value)) throw new Error(`ожидался uuid (${what}), получено '${value}'`);
  return value;
}

// Ни один звонок к базе не смеет висеть бесконечно: зависший запрос вешал бы всю выкатку (blind-audit
// F2, вторая часть). Бюджет переопределим для проверки самого таймаута (см. запуск руками в шапке
// файла) — в обычном прогоне 30с с большим запасом хватает и на самый длинный census-запрос.
const PSQL_TIMEOUT_MS = Number(process.env.TENANT_ISOLATION_PROOF_PSQL_TIMEOUT_MS ?? 30_000);

function psql(lines, { expectFailure = false, tolerant = false } = {}) {
  const preamble = tolerant
    ? ['\\set VERBOSITY verbose', '\\set ON_ERROR_STOP 0', '\\set ON_ERROR_ROLLBACK on']
    : ['\\set VERBOSITY verbose', '\\set ON_ERROR_STOP 1'];
  const script = [...preamble, ...(Array.isArray(lines) ? lines : [lines])];
  const args = ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
    '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-f', '-'];
  const run = spawnSync('sudo', args, {
    input: `${script.join('\n')}\n`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: PSQL_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  if (run.error?.code === 'ETIMEDOUT' || run.signal) {
    throw new Error(`psql проба зависла дольше ${PSQL_TIMEOUT_MS}мс на базе ${DATABASE} и была убита `
      + `сигналом ${run.signal ?? 'SIGKILL'} — база не отвечает или запрос завис`);
  }
  if (run.error) throw run.error;
  const stderr = String(run.stderr ?? '');
  const outcome = {
    failed: run.status !== 0,
    stdout: String(run.stdout ?? '').trim(),
    stderr,
    // Ошибка привязана к СТРОКЕ скрипта: `\set VERBOSITY verbose` печатает
    // `psql:<stdin>:N: ERROR:  SQLSTATE: текст`, а каждый запрос ниже занимает ровно одну строку.
    // Это единственный способ узнать, КАКОЙ из ста восемнадцати запросов отказал, не открывая ста
    // восемнадцати соединений и не заводя plpgsql (арендной роли язык не открыт).
    errorsByLine: new Map([...stderr.matchAll(/psql:<stdin>:(\d+): ERROR:\s{2}([0-9A-Z]{5}): ([^\n]*)/gu)]
      .map((match) => [Number(match[1]) - preamble.length, { sqlstate: match[2], message: match[3] }])),
  };
  if (outcome.failed && !expectFailure) throw new Error(`psql не смог выполнить пробу:\n${stderr}`);
  return outcome;
}

/** Первая ошибка скрипта — то, чем отказ описывается человеку. */
function firstError(outcome) {
  const [entry] = [...outcome.errorsByLine.entries()].sort(([left], [right]) => left - right);
  return entry ? entry[1] : { sqlstate: null, message: outcome.stderr.trim() };
}

/** Отчёт об отказе должен читаться человеком в 3 часа ночи, а не листаться. */
function first(items, limit = 12) {
  return items.length <= limit ? items : [...items.slice(0, limit), `  … и ещё ${items.length - limit}`];
}

function rows(stdout) {
  return stdout.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => line.split('|'));
}

/* ─────────────────────── привилегированная перепись (ловушка пустоты) ─────────────────────── */

/**
 * На каждый предмет отвечает три вопроса, ни один из которых нельзя решить списком в файле:
 * есть ли отношение в этой базе, открыто ли оно вообще арендной роли, и какие организации в нём
 * лежат (двух образцов хватает: если в таблице встретились две разные организации, чужие строки
 * есть для ЛЮБОГО выбора A; если одна — только для A, отличного от неё).
 */
function census(subjects) {
  const list = subjects.map((name) => `('${checkedIdentifier(name)}')`).join(',');
  const shape = rows(psql(`
SELECT s.t
    || '|' || (pg_catalog.to_regclass(s.t) IS NOT NULL)::text
    || '|' || COALESCE((SELECT true FROM pg_catalog.pg_attribute a
                         WHERE a.attrelid = pg_catalog.to_regclass(s.t) AND a.attname = 'organization_id'
                           AND a.attnum > 0 AND NOT a.attisdropped), false)::text
    || '|' || COALESCE(pg_catalog.has_table_privilege('app_staff', pg_catalog.to_regclass(s.t), 'SELECT'), false)::text
  FROM (VALUES ${list}) AS s(t);`).stdout);

  const state = new Map();
  for (const [name, present, hasOrg, staffSelect] of shape) {
    state.set(name, { name, present: present === 'true', hasOrg: hasOrg === 'true', staffSelect: staffSelect === 'true', orgs: [] });
  }

  const readable = [...state.values()].filter((s) => s.present && s.hasOrg && s.staffSelect);
  if (readable.length > 0) {
    const first = rows(psql(readable.map((s) =>
      `SELECT '${s.name}|' || COALESCE((SELECT organization_id::text FROM ${s.name}
         WHERE organization_id IS NOT NULL LIMIT 1), '')`).join('\nUNION ALL\n') + ';').stdout);
    for (const [name, org] of first) if (org) state.get(name).orgs.push(checkedUuid(org, name));

    const withOne = readable.filter((s) => s.orgs.length === 1);
    if (withOne.length > 0) {
      const second = rows(psql(withOne.map((s) =>
        `SELECT '${s.name}|' || COALESCE((SELECT organization_id::text FROM ${s.name}
           WHERE organization_id IS NOT NULL AND organization_id <> '${s.orgs[0]}'::uuid LIMIT 1), '')`).join('\nUNION ALL\n') + ';').stdout);
      for (const [name, org] of second) if (org) state.get(name).orgs.push(checkedUuid(org, name));
    }
  }
  return state;
}

/** Таблица доказуема против A ровно тогда, когда в ней лежит строка организации, отличной от A. */
function provableAgainst(subject, organizationA) {
  return subject.orgs.some((org) => org !== organizationA);
}

/**
 * Актор и клиника A выбираются не по вкусу: берётся тот действующий сотрудник, чья организация
 * оставляет БОЛЬШЕ ВСЕГО доказуемых таблиц. Иначе выбор «первого попавшегося» мог бы молча
 * обнулить проверку на самых наполненных таблицах.
 */
function chooseActor(state) {
  const candidates = rows(psql(`
SELECT m.organization_id::text || '|' || MIN(ref.opaque_ref::text)
  FROM public.be_organization_members m
  JOIN app_ext.variant_a_identity_refs ref ON ref.physical_user_id = m.platform_user_id
 WHERE m.status = 'active'
 GROUP BY m.organization_id
 ORDER BY m.organization_id;`).stdout);
  assert.notEqual(candidates.length, 0, `${DATABASE}: нет ни одного действующего сотрудника — доказывать нечего`);

  const scored = candidates.map(([organizationId, actorRef]) => {
    const organization = checkedUuid(organizationId, 'organization_id сотрудника');
    return {
      organization,
      actorRef: checkedUuid(actorRef, 'opaque_ref сотрудника'),
      provable: [...state.values()].filter((s) => provableAgainst(s, organization)).length,
    };
  }).sort((left, right) => right.provable - left.provable || left.organization.localeCompare(right.organization));
  return scored[0];
}

/* ─────────────────────── настоящий путь порта ─────────────────────── */

function seam() {
  const [[capabilityId, login]] = rows(psql(`
SELECT capability_id::text || '|' || session_login
  FROM app_ext.port_context_capabilities
 WHERE context_class = 'staff' AND target_role = 'app_staff'
   AND purpose = 'relation' AND function_identity IS NULL
 ORDER BY session_login LIMIT 1;`).stdout);
  assert.ok(login, `${DATABASE}: у порта нет реляционной capability класса staff — проверять нечем`);
  if (!/^[a-z_][a-z0-9_]*$/u.test(login)) throw new Error(`небезопасное имя логина '${login}'`);
  const [[argsHash]] = rows(psql(
    `SELECT encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex');`).stdout);
  return { capabilityId: checkedUuid(capabilityId, 'capability_id'), login, argsHash };
}

/** Настоящий путь порта, ровно теми же операторами: одна строка скрипта — один оператор. */
function installStaffContext({ capabilityId, login, argsHash }, actorRef, organizationId) {
  return [
    `SET LOCAL SESSION AUTHORIZATION ${login};`,
    `SELECT app.begin_port_context('${capabilityId}'::uuid, ROW(1::smallint, 'staff'::app.port_context_class, `
      + `'app_staff'::name, 'relation', NULL::regprocedure, decode('${argsHash}', 'hex'), '${actorRef}'::uuid, `
      + `NULL::uuid, '${organizationId}'::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims);`,
  ];
}

/* ─────────────────────── сами утверждения ─────────────────────── */

let shared = null;
function prepared() {
  if (shared) return shared;
  const subjects = subjectsFromDeclaration(DATABASE);
  assert.notEqual(subjects.length, 0, 'декларация не назвала ни одной таблицы под стеной клиники');
  const state = census(subjects);
  const actor = chooseActor(state);
  const exercised = [...state.values()].filter((s) => provableAgainst(s, actor.organization));
  const skipped = [...state.values()].filter((s) => !provableAgainst(s, actor.organization)).map((s) => ({
    name: s.name,
    reason: !s.present ? 'отношения нет в этой базе'
      : !s.hasOrg ? 'нет колонки organization_id'
        : !s.staffSelect ? 'арендной роли app_staff таблица не открыта вовсе'
          : s.orgs.length === 0 ? 'таблица пуста — утечь нечему'
            : 'все строки принадлежат самой проверяемой клинике — утечь нечему',
  }));
  shared = { subjects, state, actor, exercised, skipped, seam: seam() };
  return shared;
}

test('клиника видит только свои строки', { skip: !ENABLED }, () => {
  const { actor, exercised, skipped, seam: port, subjects } = prepared();

  // ЛОВУШКА ПУСТОТЫ, часть первая: без чужих строк «A не видит B» истинно бесплатно.
  assert.notEqual(exercised.length, 0,
    `ДОКАЗЫВАТЬ НЕЧЕГО на базе ${DATABASE}: ни в одной из ${subjects.length} таблиц под стеной клиники `
    + `нет ни одной строки организации, отличной от ${actor.organization}. «Чужое не видно» здесь истинно `
    + 'даром, и зелёный результат не значил бы ничего. Чтобы стену можно было доказать, в базе нужна '
    + 'вторая клиника с данными хотя бы в одной из этих таблиц.');

  // Каждый запрос — РОВНО ОДНА строка скрипта: по номеру строки в сообщении psql узнаётся, какая
  // таблица отказала. Отказ таблицы — не утечка, но и не «пройдено»: она уходит в непроверенные.
  const reads = exercised.map((subject) => `SELECT '${subject.name}|' || COALESCE((SELECT string_agg(`
    + `z.organization_id::text || ' x' || z.n, ', ' ORDER BY z.organization_id) FROM (SELECT organization_id, `
    + `count(*) AS n FROM ${subject.name} WHERE organization_id IS NOT NULL AND organization_id <> `
    + `'${actor.organization}'::uuid GROUP BY organization_id) AS z), '');`);

  const opening = ['BEGIN;', ...installStaffContext(port, actor.actorRef, actor.organization)];
  const outcome = psql([...opening, ...reads, 'ROLLBACK;'], { tolerant: true });

  for (const line of opening.keys()) {
    const failure = outcome.errorsByLine.get(line + 1);
    assert.equal(failure, undefined, failure && `законный контекст клиники ${actor.organization} `
      + `не устанавливается на базе ${DATABASE}: ${failure.sqlstate} ${failure.message}`);
  }

  const answered = new Map(rows(outcome.stdout));
  const refused = exercised
    .map((subject, index) => ({ subject, failure: outcome.errorsByLine.get(opening.length + index + 1) }))
    .filter(({ subject }) => !answered.has(subject.name));
  const proven = exercised.filter((subject) => answered.has(subject.name));

  // Честный перечень непроверенного дороже раздутого зелёного — печатается ДО assert ниже: если
  // проверять нечем и следующий assert упадёт, отчёт обязан уже назвать, что именно не покрыто, а не
  // оборваться молча (blind-audit F3, 2026-08-19/20).
  for (const gap of skipped) console.log(`не проверено · ${gap.name} · ${gap.reason}`);
  for (const { subject, failure } of refused) {
    console.log(`не проверено · ${subject.name} · staff-путь чтения отказал: `
      + `${failure ? `${failure.sqlstate} ${failure.message}` : 'без сообщения'}`);
  }
  console.log(`доказано на ${proven.length} таблицах из ${subjects.length} объявленных под стеной клиники; `
    + `клиника ${actor.organization}, актор ${actor.actorRef}, база ${DATABASE}`);

  // ЛОВУШКА ПУСТОТЫ, часть вторая: если ответила ноль таблиц, отсутствие утечек ничего не значит.
  assert.notEqual(proven.length, 0,
    `доказывать нечего: ни одна из ${exercised.length} наполненных таблиц не читается по staff-пути `
    + `на базе ${DATABASE}`);

  const leaks = proven
    .map((subject) => [subject.name, answered.get(subject.name)])
    .filter(([, breakdown]) => breakdown);
  assert.deepEqual(leaks, [], leaks.length === 0 ? '' : [
    `СТЕНА АРЕНДАТОРА ПРОТЕКЛА на базе ${DATABASE}.`,
    `Контекст клиники ${actor.organization} (актор ${actor.actorRef}) вернул строки других организаций:`,
    ...first(leaks.map(([name, breakdown]) => `  • ${name}: ${breakdown}`)),
    `проверено таблиц: ${proven.length} из ${subjects.length} объявленных под стеной клиники.`,
  ].join('\n'));

});

test('контекст на чужую клинику получить нельзя', { skip: !ENABLED }, () => {
  const { actor, seam: port } = prepared();

  const [[foreignOrganization] = []] = rows(psql(`
SELECT other.organization_id::text
  FROM public.be_organization_members other
 WHERE NOT EXISTS (
   SELECT 1 FROM public.be_organization_members mine
     JOIN app_ext.variant_a_identity_refs ref ON ref.physical_user_id = mine.platform_user_id
    WHERE ref.opaque_ref = '${actor.actorRef}'::uuid
      AND mine.organization_id = other.organization_id AND mine.status = 'active')
 LIMIT 1;`).stdout);
  assert.ok(foreignOrganization,
    `ДОКАЗЫВАТЬ НЕЧЕГО на базе ${DATABASE}: нет ни одной клиники, к которой актор ${actor.actorRef} `
    + 'не принадлежит, поэтому отказ в чужом контексте проверить не на чем. Нужна вторая клиника.');

  const outcome = psql([
    'BEGIN;',
    ...installStaffContext(port, actor.actorRef, checkedUuid(foreignOrganization, 'чужая организация')),
    `SELECT 'КОНТЕКСТ НА ЧУЖУЮ КЛИНИКУ ВЫДАН';`,
    'ROLLBACK;',
  ], { expectFailure: true });
  const failure = firstError(outcome);

  assert.equal(failure.sqlstate, '42501',
    `актор ${actor.actorRef} (клиника ${actor.organization}) на базе ${DATABASE} получил контекст на чужую `
    + `клинику ${foreignOrganization}: ${outcome.failed ? `${failure.sqlstate} ${failure.message}` : outcome.stdout}`);
});

test('без контекста чтение отказывает, а не отвечает нулём строк', { skip: !ENABLED }, () => {
  const { exercised, seam: port } = prepared();
  assert.notEqual(exercised.length, 0,
    `ДОКАЗЫВАТЬ НЕЧЕГО на базе ${DATABASE}: нет ни одной наполненной таблицы под стеной клиники`);

  // Спрашиваются ВСЕ наполненные таблицы, а не одна выбранная: «отказал» — это свойство пути, и
  // одна удачно выбранная таблица легко скрыла бы, что соседняя молча отвечает нулём.
  const opening = ['BEGIN;', `SET LOCAL SESSION AUTHORIZATION ${port.login};`, 'SET LOCAL ROLE app_staff;'];
  const reads = exercised.map((subject) => `SELECT '${subject.name}|' || count(*) FROM ${subject.name};`);
  const outcome = psql([...opening, ...reads, 'ROLLBACK;'], { tolerant: true });

  const answered = rows(outcome.stdout);
  const wrongCode = exercised
    .map((subject, index) => [subject.name, outcome.errorsByLine.get(opening.length + index + 1)])
    .filter(([name, failure]) => !answered.some(([answeredName]) => answeredName === name)
      && failure?.sqlstate !== '42501');

  assert.deepEqual([...answered, ...wrongCode], [], (answered.length + wrongCode.length) === 0 ? '' : [
    `${DATABASE}: чтение без контекста не отказало.`,
    ...first(answered.map(([name, count]) => `  • ${name}: запрос УСПЕШЕН и отдал строк: ${count}`)),
    ...first(wrongCode.map(([name, failure]) => `  • ${name}: отказ не 42501, а `
      + `${failure ? `${failure.sqlstate} ${failure.message}` : 'без сообщения'}`)),
    'Молчаливый ноль вместо отказа — ровно та форма, которая месяцами прятала сломанную уборку по сроку хранения.',
  ].join('\n'));
});
