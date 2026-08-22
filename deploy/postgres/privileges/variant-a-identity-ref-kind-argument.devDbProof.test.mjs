/**
 * Живое доказательство ОДНОГО свойства резолверов личности на именованной DEV-базе. Opt-in: без
 * `RUN_VARIANT_A_IDENTITY_REF_DB=1` файл пропускается, поэтому в CI он в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): резолвер личности начал отвечать НЕ ТО, когда у него
 * появился аргумент вида ссылки — выдал другому виду чужую ссылку, потерял путь вставки или
 * записал в карту не тот вид, чем попросили.
 *
 * Зачем именно сейчас (D15b/7a Ш3, 22.08). Шаг 3 даёт обоим резолверам `app_ext.*` и именованному
 * корню `app.pre_session_resolve_identity` аргумент вида, а прежние однопараметрические сигнатуры
 * оставляет тонкими делегатами до Ш7. Две вещи здесь способны сломаться молча:
 *   * делегат и новая сигнатура разойдутся — тот же человек получит РАЗНЫЕ ссылки в зависимости от
 *     того, каким именем его спросили, и вход перестанет быть входом в один аккаунт;
 *   * вид, которым попросили, не доедет до строки карты — `ref_kind` придёт из DEFAULT колонки, и
 *     карта тихо наберёт актор-строк там, где Ш4 будет ждать субъектные. Ни один SELECT об этом не
 *     скажет: значение ссылки выглядит нормально.
 * Обе проверяются ПОВЕДЕНИЕМ пары резолверов, а не текстом исходника: ниже вызываются сами функции
 * и читается сама строка карты.
 *
 * Почему проба сама раскладывает контракт. `deploy/postgres/port-context/contract.sql` —
 * авторитет рождения объектов `app_ext`, и он приезжает на базу шагом reconcile, который эту ветку
 * вести не может (DEV ведёт соседняя ветка; `migrate-dev.sh --execute` этой работе запрещён).
 * Поэтому проба берёт ИЗ САМОГО ФАЙЛА ПРОДУКТА целевую форму карты и тела четырёх функций,
 * проигрывает их в откаченной транзакции и там же спрашивает. Это тот же текст, что приедет
 * reconcile-ом, а не его пересказ: расходиться ему не с чем.
 *
 * Границы доказательства. Проба идёт под локальным админ-сокетом (`sudo -n -u postgres psql`,
 * AGENTS.md §6), то есть проверяет ЗНАЧЕНИЯ и путь аргумента, а не маршрут клиентских логинов и не
 * права: EXECUTE на эти функции есть только у своего шва, а владелец функций внутри пробы —
 * `postgres`. Права проверяет reconcile (`--port-context-verify`), сквозной вход — живой прогон на
 * :5200 после reconcile.
 *
 * Ничего не остаётся в базе: и DDL, и вставки идут внутри `BEGIN … ROLLBACK`.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_VARIANT_A_IDENTITY_REF_DB=1 node --test \
 *     deploy/postgres/privileges/variant-a-identity-ref-kind-argument.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ENABLED = process.env.RUN_VARIANT_A_IDENTITY_REF_DB === '1';
const DATABASE = process.env.VARIANT_A_IDENTITY_PROOF_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const CONTRACT = readFileSync(
  fileURLToPath(new URL('../port-context/contract.sql', import.meta.url)), 'utf8');

// Ш8-аудит лежит в pending migration, а предмет этой пробы — резолверы Ш3–Ш7.  Заглушка сохраняет
// их исполнимость в rollback-only candidate, не подменяя поведение самого аудита (его проверяет
// identity-boundary-audit.devDbProof.test.mjs).
const AUDIT_STUB = `CREATE OR REPLACE FUNCTION app.record_collapsing_audit_event(
  text, uuid, uuid, text, text, text
) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
GRANT EXECUTE ON FUNCTION app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)
  TO app_seam_identity_lookup_owner;`;

/** Точный кусок продукта между двумя его же якорями — иначе проба доказывала бы свой пересказ. */
function contractSlice(startsWith, endsWith) {
  const from = CONTRACT.indexOf(startsWith);
  assert.notEqual(from, -1, `contract.sql больше не содержит '${startsWith}'`);
  const to = CONTRACT.indexOf(endsWith, from);
  assert.notEqual(to, -1, `contract.sql больше не содержит '${endsWith}' после '${startsWith}'`);
  return CONTRACT.slice(from, to + endsWith.length);
}

/** Целевая форма карты и двух kind-aware резолверов, дословно из контракта. */
const CONTRACT_SHAPE = [
  contractSlice('CREATE TABLE IF NOT EXISTS app_ext.variant_a_identity_refs (', '$variant_a_kind$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_identity(p_platform_user_id uuid, p_ref_kind text)',
    'END $$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_physical(p_opaque_ref uuid, p_expected_ref_kind text)',
    'END $$;'),
  // Владелец — часть предмета проверки, а не декорация: функция исполняется его правами.
  contractSlice(
    'ALTER FUNCTION app_ext.resolve_variant_a_identity(uuid,text) OWNER TO app_seam_identity_lookup_owner;',
    'ALTER FUNCTION app_ext.resolve_variant_a_physical(uuid,text) OWNER TO app_seam_identity_lookup_owner;'),
  AUDIT_STUB,
].join('\n');

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/** Один вопрос к целевой форме контракта; всё, что он сделал, откатывается. */
function probe(body) {
  const raw = psql(`
BEGIN;
${CONTRACT_SHAPE}
DO $probe$
BEGIN
${body}
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bcb.probe', SQLSTATE || '|' || SQLERRM, false);
END $probe$;
SELECT current_setting('bcb.probe');
ROLLBACK;
`);
  return raw.split('|');
}

test('тот же человек: kind-aware акторская сигнатура выдаёт одну и ту же ссылку',
  { skip: !ENABLED }, () => {
    const parts = probe(`
  DECLARE person uuid; first_ref uuid; second_ref uuid;
  BEGIN
    person := (SELECT physical_user_id FROM app_ext.variant_a_identity_refs ORDER BY created_at LIMIT 1);
    first_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    second_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    PERFORM set_config('bcb.probe', first_ref::text || '|' || second_ref::text, false);
  END;`);
    assert.equal(parts.length, 2, `круг не прошёл: ${parts.join('|')}`);
    assert.equal(parts[1], parts[0],
      'повторный kind-aware вызов выдал человеку другую ссылку');
  });

test('новый человек: путь ВСТАВКИ жив, а вид доезжает до строки карты',
  { skip: !ENABLED }, () => {
    // Человека, которого в карте нет, ловит именно путь вставки: арбитр `ON CONFLICT`, список
    // колонок INSERT и CHECK вида проверяются только здесь.
    const parts = probe(`
  DECLARE fresh uuid := gen_random_uuid(); minted uuid; stored_kind text; back uuid;
  BEGIN
    minted := app_ext.resolve_variant_a_identity(fresh, 'subject');
    stored_kind := (SELECT ref_kind FROM app_ext.variant_a_identity_refs WHERE opaque_ref = minted);
    back := app_ext.resolve_variant_a_physical(minted, 'subject');
    PERFORM set_config('bcb.probe',
      minted::text || '|' || stored_kind || '|' || back::text || '|' || fresh::text, false);
  END;`);
    assert.equal(parts.length, 4, `путь вставки не прошёл: ${parts.join('|')}`);
    assert.equal(parts[1], 'subject',
      'запрошенный вид не доехал до строки карты — резолвер записал не то, о чём его просили');
    assert.equal(parts[2], parts[3], 'ссылка нового человека разрешилась не в него');
  });

test('вид — закрытый список: неизвестное значение отвергает сама карта, а не резолвер',
  { skip: !ENABLED }, () => {
    // Резолвер вид НЕ валидирует (это и есть Ш3), поэтому единственная стена здесь — CHECK
    // таблицы. Если её снять, мимо резолвера пройдёт четвёртый вид ссылки, которого не ждёт никто.
    const parts = probe(`
  BEGIN
    PERFORM app_ext.resolve_variant_a_identity(gen_random_uuid(), 'medical');
    PERFORM set_config('bcb.probe', 'accepted', false);
  END;`);
    assert.equal(parts[0], '23514',
      `неизвестный вид ссылки не был отвергнут CHECK-ом карты: ${parts.join('|')}`);
  });

// ПЕРЕВЁРНУТО Ш5 (22.08). Здесь стояло обратное ожидание — «резолвер вид ПРИНИМАЕТ и ещё НЕ
// сравнивает», и его собственный комментарий называл шаг, который его отменит. Ш5 наступил: вид
// теперь входит в предикат поиска, и акторская ссылка, предъявленная субъектом, не разрешается.
// Полное доказательство свойства — `variant-a-identity-ref-kind-fail-closed.devDbProof.test.mjs`;
// здесь остаётся ровно одна строка про то, что аргумент вида перестал быть декоративным.
test('Ш5: обратный резолвер СРАВНИВАЕТ вид, а не только принимает его',
  { skip: !ENABLED }, () => {
    const parts = probe(`
  DECLARE person uuid := gen_random_uuid(); actor_ref uuid; resolved uuid;
  BEGIN
    actor_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    resolved := app_ext.resolve_variant_a_physical(actor_ref, 'subject');
    PERFORM set_config('bcb.probe', resolved::text || '|' || person::text, false);
  END;`);
    assert.equal(parts[0], '42501',
      `акторская ссылка разрешилась субъектной: ${parts.join('|')}`);
  });

test('выдуманная ссылка отвергается 42501, а не отдаёт чужой физический id',
  { skip: !ENABLED }, () => {
    const parts = probe(`
  DECLARE invented uuid := '11111111-2222-4333-8444-555555555555'; kinded text;
  BEGIN
    BEGIN PERFORM app_ext.resolve_variant_a_physical(invented, 'actor'); kinded := 'accepted';
    EXCEPTION WHEN OTHERS THEN kinded := SQLSTATE; END;
    PERFORM set_config('bcb.probe', kinded, false);
  END;`);
    assert.deepEqual(parts, ['42501'],
      `выдуманная ссылка не была отвергнута: ${parts.join('|')}`);
  });
