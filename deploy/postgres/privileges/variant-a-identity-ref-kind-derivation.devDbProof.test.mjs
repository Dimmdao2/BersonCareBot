/**
 * Живое доказательство ВЫВОДА непрозрачной ссылки на именованной DEV-базе. Opt-in: без
 * `RUN_VARIANT_A_IDENTITY_REF_DB=1` файл пропускается, поэтому в CI он в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): выдача ссылок, где вид человека ничего не меняет — либо оба
 * вида получают ОДНО значение (и разделение actor/subject бессмысленно, а второй вид вообще не
 * заводится, упираясь в `variant_a_identity_refs_opaque_ref_key`), либо, наоборот, изменившийся
 * вывод перестал воспроизводить УЖЕ ВЫДАННЫЕ акторские ссылки.
 *
 * Зачем именно сейчас (D15b/7a Ш4, 22.08). До Ш4 `opaque_ref` выводился как
 * `sha256(uuid_send(physical_id))` — чистая функция ОДНОГО аргумента. Приложение просило одну
 * ссылку и клало её в оба поля claims, поэтому совпадение видов было незаметно. Ш4 — тот шаг, где
 * пациент начинает просить ДВЕ ссылки, и без изменения вывода он физически не едет: вторая вставка
 * умирает `23505` на UNIQUE. Вывод стал `sha256(uuid_send(id) || <разделитель вида>)`, причём
 * разделитель акторского вида ПУСТ — этим акторская формула осталась побайтно прежней.
 *
 * Что здесь доказывается ПОВЕДЕНИЕМ самих функций, а не текстом исходника:
 *   1. два вида одного человека дают РАЗНЫЕ ссылки, и обе разрешаются в него же;
 *   2. каждую из уже выданных акторских ссылок продукт ВОСПРОИЗВОДИТ дословно (строка удаляется в
 *      откаченной транзакции и чеканится заново ТЕМ ЖЕ резолвером — сравнивается не пересказ
 *      формулы, а её собственный ответ);
 *   3. один и тот же (человек, вид) даёт одну и ту же ссылку и тогда, когда строки в карте нет —
 *      то есть стабильность обеспечена выводом, а не только чтением-первым;
 *   4. `UNIQUE` на `opaque_ref` цел и по-прежнему отвергает дубль;
 *   5. приёмный шов пациента проходит: ссылки РАЗНЫЕ, а `actor_id IS DISTINCT FROM subject_id` в
 *      `app_ext.assert_port_context_claim` по-прежнему не срабатывает, потому что человек один.
 *
 * Почему проба сама раскладывает контракт. `deploy/postgres/port-context/contract.sql` — авторитет
 * рождения объектов `app_ext`, и он приезжает на базу шагом reconcile, который эта ветка вести не
 * может (DEV ведёт ведущий; `migrate-dev.sh --execute` этой работе запрещён). Поэтому проба берёт
 * ИЗ САМОГО ФАЙЛА ПРОДУКТА целевую форму карты, тела резолверов и приёмного шва, проигрывает их в
 * откаченной транзакции и там же спрашивает. Это тот же текст, что приедет reconcile-ом.
 *
 * Границы доказательства. Проба идёт под локальным админ-сокетом (`sudo -n -u postgres psql`,
 * AGENTS.md §6), то есть проверяет ЗНАЧЕНИЯ и вывод, а не маршрут клиентских логинов и не права.
 * Права проверяет reconcile (`--port-context-verify`), сквозной вход — живой прогон на :5200.
 *
 * Ничего не остаётся в базе: и DDL, и вставки, и удаления идут внутри `BEGIN … ROLLBACK`.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_VARIANT_A_IDENTITY_REF_DB=1 node --test \
 *     deploy/postgres/privileges/variant-a-identity-ref-kind-derivation.devDbProof.test.mjs
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

/** Точный кусок продукта между двумя его же якорями — иначе проба доказывала бы свой пересказ. */
function contractSlice(startsWith, endsWith) {
  const from = CONTRACT.indexOf(startsWith);
  assert.notEqual(from, -1, `contract.sql больше не содержит '${startsWith}'`);
  const to = CONTRACT.indexOf(endsWith, from);
  assert.notEqual(to, -1, `contract.sql больше не содержит '${endsWith}' после '${startsWith}'`);
  return CONTRACT.slice(from, to + endsWith.length);
}

/** Целевая форма карты (Ш1-2), тела резолверов (Ш3-4) и приёмный шов — дословно из контракта. */
const CONTRACT_SHAPE = [
  contractSlice('CREATE TABLE IF NOT EXISTS app_ext.variant_a_identity_refs (', '$variant_a_kind$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_identity(p_platform_user_id uuid, p_ref_kind text)',
    'END $$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_identity(p_platform_user_id uuid)\n',
    'END $$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_physical(p_opaque_ref uuid, p_expected_ref_kind text)',
    'END $$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_physical(p_opaque_ref uuid)\n',
    'END $$;'),
  // Приёмный шов — часть предмета проверки: именно он сравнивает актора и субъекта, и именно его
  // проверка `actor_id IS DISTINCT FROM subject_id` обязана продолжать пропускать пациента, у
  // которого ссылки РАЗНЫЕ, а человек один.
  contractSlice('CREATE OR REPLACE FUNCTION app_ext.assert_port_context_claim(', 'END $$;'),
  contractSlice(
    'ALTER FUNCTION app_ext.resolve_variant_a_identity(uuid) OWNER TO app_seam_identity_lookup_owner;',
    'ALTER FUNCTION app_ext.resolve_variant_a_physical(uuid,text) OWNER TO app_seam_identity_lookup_owner;'),
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

test('Ш4: два вида одного человека дают РАЗНЫЕ ссылки, и обе ведут к нему',
  { skip: !ENABLED }, () => {
    // До Ш4 эта проба падала `23505 duplicate key value violates unique constraint
    // "variant_a_identity_refs_opaque_ref_key"`: субъектная ссылка выводилась в то же значение,
    // что и акторская. Это и есть блокер, из-за которого Ш4 не ехал.
    const parts = probe(`
  DECLARE person uuid := gen_random_uuid(); actor_ref uuid; subject_ref uuid;
  BEGIN
    actor_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    subject_ref := app_ext.resolve_variant_a_identity(person, 'subject');
    PERFORM set_config('bcb.probe',
      actor_ref::text || '|' || subject_ref::text || '|' ||
      app_ext.resolve_variant_a_physical(actor_ref)::text || '|' ||
      app_ext.resolve_variant_a_physical(subject_ref)::text || '|' || person::text, false);
  END;`);
    assert.equal(parts.length, 5, `вид не развёл ссылки: ${parts.join('|')}`);
    assert.notEqual(parts[1], parts[0],
      'акторская и субъектная ссылки одного человека совпали — разделение видов бессмысленно');
    assert.equal(parts[2], parts[4], 'акторская ссылка разрешилась не в того человека');
    assert.equal(parts[3], parts[4], 'субъектная ссылка разрешилась не в того человека');
  });

test('Ш4: КАЖДУЮ уже выданную акторскую ссылку продукт воспроизводит дословно',
  { skip: !ENABLED }, () => {
    // Условие «уже выданные ссылки НЕ меняются». Проверяется не сравнением формул, а самим
    // резолвером: строка карты удаляется в откаченной транзакции и чеканится заново — если вывод
    // акторского вида сдвинулся хоть на бит, значение вернётся другим. Дай акторскому виду
    // непустой разделитель — и разойдётся КАЖДАЯ строка сразу.
    const parts = probe(`
  DECLARE known record; total integer := 0; drifted integer := 0; reminted uuid;
  BEGIN
    FOR known IN
      SELECT physical_user_id, opaque_ref FROM app_ext.variant_a_identity_refs WHERE ref_kind = 'actor'
    LOOP
      total := total + 1;
      DELETE FROM app_ext.variant_a_identity_refs
       WHERE physical_user_id = known.physical_user_id AND ref_kind = 'actor';
      reminted := app_ext.resolve_variant_a_identity(known.physical_user_id, 'actor');
      IF reminted IS DISTINCT FROM known.opaque_ref THEN drifted := drifted + 1; END IF;
    END LOOP;
    PERFORM set_config('bcb.probe', total::text || '|' || drifted::text, false);
  END;`);
    assert.equal(parts.length, 2, `перечесть выданные ссылки не удалось: ${parts.join('|')}`);
    assert.ok(Number(parts[0]) > 0, 'в карте нет ни одной акторской строки — проверять нечего');
    assert.equal(parts[1], '0',
      `вывод сдвинул уже выданные акторские ссылки: ${parts[1]} из ${parts[0]}`);
  });

test('Ш4: одна и та же пара (человек, вид) даёт одну и ту же ссылку и без строки в карте',
  { skip: !ENABLED }, () => {
    // Стабильность обязана держаться на ВЫВОДЕ, а не только на чтении-первым: `gen_random_uuid()`
    // прошёл бы чтение-первым и провалил бы вот это — а с ним поехали бы ссылки, выданные другой
    // базой того же кластера.
    const parts = probe(`
  DECLARE person uuid := gen_random_uuid(); first_ref uuid; second_ref uuid;
  BEGIN
    first_ref := app_ext.resolve_variant_a_identity(person, 'subject');
    DELETE FROM app_ext.variant_a_identity_refs WHERE physical_user_id = person;
    second_ref := app_ext.resolve_variant_a_identity(person, 'subject');
    PERFORM set_config('bcb.probe', first_ref::text || '|' || second_ref::text, false);
  END;`);
    assert.equal(parts.length, 2, `повторная чеканка не прошла: ${parts.join('|')}`);
    assert.equal(parts[1], parts[0], 'вывод перестал быть стабильным — ссылка поехала');
  });

test('Ш4: UNIQUE на ссылке цел и по-прежнему отвергает дубль',
  { skip: !ENABLED }, () => {
    const parts = probe(`
  DECLARE person uuid := gen_random_uuid(); other uuid := gen_random_uuid(); taken uuid;
  BEGIN
    taken := app_ext.resolve_variant_a_identity(person, 'actor');
    INSERT INTO app_ext.variant_a_identity_refs(physical_user_id, opaque_ref, ref_kind)
    VALUES (other, taken, 'subject');
    PERFORM set_config('bcb.probe', 'accepted', false);
  END;`);
    assert.equal(parts[0], '23505',
      `одна ссылка досталась двум людям — UNIQUE на opaque_ref больше не стена: ${parts.join('|')}`);
  });

test('Ш4: приёмный шов пациента проходит на РАЗНЫХ ссылках одного человека',
  { skip: !ENABLED }, () => {
    // Дословное требование шага: `actor_ref <> subject_ref`, оба разрешаются в один физический id,
    // и проверка `actor_id IS DISTINCT FROM subject_id` по-прежнему проходит. Берётся НАСТОЯЩИЙ
    // клиент DEV и его настоящая клиника — иначе доказательство было бы про выдуманные строки.
    const parts = probe(`
  DECLARE person uuid; org uuid; actor_ref uuid; subject_ref uuid;
  BEGIN
    SELECT enrollment.platform_user_id, enrollment.organization_id INTO person, org
      FROM public.org_enrollments enrollment
      JOIN app_ext.variant_a_identity_refs known
        ON known.physical_user_id = enrollment.platform_user_id
     LIMIT 1;
    actor_ref := app_ext.resolve_variant_a_identity(person, 'actor');
    subject_ref := app_ext.resolve_variant_a_identity(person, 'subject');
    PERFORM app_ext.assert_port_context_claim('patient', 'app_patient', actor_ref, subject_ref, org, NULL);
    PERFORM set_config('bcb.probe',
      'accepted|' || actor_ref::text || '|' || subject_ref::text, false);
  END;`);
    assert.equal(parts[0], 'accepted',
      `приёмный шов отверг пациента с двумя видами ссылок: ${parts.join('|')}`);
    assert.notEqual(parts[2], parts[1],
      'шов пропустил пациента только потому, что ссылки остались одинаковыми');
  });
