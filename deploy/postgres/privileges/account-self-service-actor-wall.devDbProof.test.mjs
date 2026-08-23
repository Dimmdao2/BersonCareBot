/**
 * Живое доказательство того, что САМООБСЛУЖИВАНИЕ по учётке стоит на АКТОРСКОЙ ссылке, а не на
 * субъектной (медицинской). Opt-in: без `RUN_ACCOUNT_SELF_SERVICE_WALL_DB=1` файл пропускается
 * целиком, поэтому в CI он в базу не ходит.
 *
 * Какую поломку ловит (одной строкой): контакт, канал доставки или ФИО человека достаются по
 * СУБЪЕКТНОЙ ссылке — то есть личность открывается тем же ключом, которым открывают медицинские
 * данные, и разделение actor/subject перестаёт что-либо значить.
 *
 * Зачем именно сейчас (D15b/7a Ш6, 22.08). Девять стен — корень учётки `platform_users` и восемь
 * таблиц `user_*` (контакты, привязки каналов, предпочтения доставки, темы уведомлений, история
 * телефонов, web-push, ФИО) — до этого шага гейтились `app.current_patient_user_id()`, читающим
 * `subject_ref`. Работало это ровно потому, что до Ш4 обе непрозрачные ссылки человека были одним
 * значением. После Ш4 значения разные, после Ш5 подмена вида отвергается базой — и вот тут
 * субъектный аксессор на акторской стене становится не «исторической мелочью», а той самой встречей
 * личности с медициной, которую весь D15b/7a убирает.
 *
 * Что доказывается ПОВЕДЕНИЕМ, а не текстом декларации (текст стережёт `relation-access.test.mjs`):
 *   1. ГЛАВНОЕ: самообслуживание не сломано — под законным контекстом пациента человек видит СВОИ
 *      строки во всех девяти поверхностях, и путь установки контекста тот же, которым ходит порт
 *      (`app.begin_port_context`), а не пересказ;
 *   2. субъектной ссылкой чужая строка НЕ достаётся: контекст, несущий субъектную ссылку ДРУГОГО
 *      человека, не открывает ни одной его строки, а свои — продолжает открывать;
 *   3. проверка 2 держится на самой правке, а не на удачных фикстурах: девять инъекций, по одной на
 *      поверхность, возвращают в ЭТУ и только эту политику `app.current_patient_user_id()` — и
 *      чужие строки становятся видны РОВНО в ней, соседние остаются закрытыми;
 *   4. вход трёх учётных записей владельца (пациент, доктор, глобальный админ) не ломается: каждая
 *      устанавливает контекст своего класса и своим аксессором получает СВОЙ физический id.
 *
 * Почему контекст пункта 2 собирается подменой поля, а не заявкой. Ш5 закрыл заявку: гейт
 * `app_ext.assert_port_context_claim` отвергает пациента, у которого актор и субъект — разные люди
 * (`42501`, и это доказано в `variant-a-identity-ref-kind-fail-closed.devDbProof.test.mjs`). Вопрос
 * здесь другой и ниже гейта: КАКОЕ ПОЛЕ принятого контекста читает СТЕНА. Поэтому проба ставит
 * настоящий контекст настоящим путём порта и затем меняет в принятой строке ровно одно поле —
 * `subject_ref`. Так проверяется свойство самой стены, а не повторно свойство гейта.
 *
 * Почему проба сама раскладывает контракт и политики. `contract.sql` и артефакт прав приезжают на
 * базу шагом reconcile, который эта ветка вести не может (DEV ведёт соседняя ветка, `--execute`
 * запрещён). Поэтому проба берёт ИЗ САМИХ ФАЙЛОВ ПРОДУКТА тела функций и дословные строки девяти
 * политик из сгенерированного артефакта, проигрывает их в откаченной транзакции и там же
 * спрашивает. Это тот же текст, что приедет reconcile-ом, а не его пересказ.
 *
 * Границы доказательства. Проба идёт под локальным админ-сокетом (`sudo -n -u postgres psql`,
 * AGENTS.md §6) и переключается на настоящий логин порта, то есть проверяет ПОВЕДЕНИЕ СТЕНЫ. Права
 * (кому выдан EXECUTE на аксессор) проверяет reconcile; сквозной клик — живой прогон ПОСЛЕ
 * reconcile. Код и reconcile обязаны ехать ОДНОЙ выкаткой.
 *
 * Ничего не остаётся в базе: и DDL, и чеканка ссылок, и подмена поля идут внутри `BEGIN … ROLLBACK`.
 *
 * Запуск (владелец/ведущий, на боксе):
 *   RUN_ACCOUNT_SELF_SERVICE_WALL_DB=1 node --test \
 *     deploy/postgres/privileges/account-self-service-actor-wall.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ENABLED = process.env.RUN_ACCOUNT_SELF_SERVICE_WALL_DB === '1';
const DATABASE = process.env.ACCOUNT_SELF_SERVICE_WALL_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}
if (!/_dev$|_test$/u.test(DATABASE)) {
  throw new Error(`refusing to probe non dev/test database '${DATABASE}'`);
}

const CONTRACT = readFileSync(
  fileURLToPath(new URL('../port-context/contract.sql', import.meta.url)), 'utf8');
const ARTIFACT = readFileSync(
  fileURLToPath(new URL(`../generated/privileges.${DATABASE}.sql`, import.meta.url)), 'utf8');

// Имена параметров — РОВНО те, что у живой двери Ш8: `CREATE OR REPLACE` не умеет переименовывать
// входной параметр и отвечает «cannot change name of input parameter "p_action"». Пока дверь лежала
// в неприменённой миграции, безымянная заглушка создавалась с нуля и вопрос не вставал; после Ш8
// она роняет КАЖДУЮ пробу этого файла, то есть стена Ш6 остаётся без единой живой проверки.
const AUDIT_STUB = `CREATE OR REPLACE FUNCTION app.record_collapsing_audit_event(
  p_action text, p_organization_id uuid, p_actor_id uuid,
  p_target_id text, p_conflict_key text, p_details text
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

/**
 * Целевая форма шва: карта с видом, оба резолвера, ОБА аксессора и приёмный гейт заявки. Аксессоры
 * здесь предмет, а не фон: именно они превращают поле принятого контекста в физический id, который
 * сравнивает стена.
 */
const CONTRACT_SHAPE = [
  contractSlice('CREATE TABLE IF NOT EXISTS app_ext.variant_a_identity_refs (', '$variant_a_kind$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_identity(p_platform_user_id uuid, p_ref_kind text)',
    'END $$;'),
  contractSlice(
    'CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_physical(p_opaque_ref uuid, p_expected_ref_kind text)',
    'END $$;'),
  contractSlice('CREATE OR REPLACE FUNCTION app.current_actor_user_id()', 'END $$;'),
  contractSlice('CREATE OR REPLACE FUNCTION app.current_patient_user_id()', 'END $$;'),
  contractSlice('CREATE OR REPLACE FUNCTION app_ext.assert_port_context_claim(', 'END $$;'),
  AUDIT_STUB,
].join('\n');

/**
 * Девять поверхностей 1.3(д) схемы D15b/7a. Имя политики НЕ зашито: индекс в нём генератор считает
 * от порядка таблиц в декларации, и зашитый номер сделал бы пробу ложно-красной от чужой правки.
 */
const SURFACES = [
  { relation: 'public.platform_users', column: 'id', prefix: 'rev10_platform_users_patient_select_' },
  { relation: 'public.user_channel_bindings', column: 'user_id', prefix: 'rev10_patient_self_managed_' },
  { relation: 'public.user_channel_preferences', column: 'platform_user_id', prefix: 'rev10_patient_self_managed_' },
  { relation: 'public.user_contacts', column: 'platform_user_id', prefix: 'rev10_patient_self_managed_' },
  { relation: 'public.user_identity', column: 'platform_user_id', prefix: 'rev10_patient_self_managed_' },
  { relation: 'public.user_notification_topic_channels', column: 'user_id', prefix: 'rev10_patient_self_managed_' },
  { relation: 'public.user_notification_topics', column: 'user_id', prefix: 'rev10_patient_self_managed_' },
  { relation: 'public.user_phone_history', column: 'platform_user_id', prefix: 'rev10_patient_self_managed_' },
  { relation: 'public.user_web_push_subscriptions', column: 'user_id', prefix: 'rev10_patient_self_managed_' },
];

/** Дословная строка политики из сгенерированного артефакта — того самого, что приедет reconcile-ом. */
function policyStatement({ relation, prefix }) {
  const quoted = `"public"."${relation.slice('public.'.length)}"`;
  const found = ARTIFACT.split('\n').filter((line) =>
    line.startsWith(`CREATE POLICY "${prefix}`) && line.includes(` ON ${quoted} `));
  assert.equal(found.length, 1,
    `в privileges.${DATABASE}.sql нет ровно одной политики '${prefix}*' на ${relation} (найдено ${found.length})`);
  const name = found[0].slice('CREATE POLICY "'.length, found[0].indexOf('"', 'CREATE POLICY "'.length));
  return { name, drop: `DROP POLICY IF EXISTS "${name}" ON ${quoted};`, create: found[0] };
}

const POLICIES = SURFACES.map((surface) => ({ ...surface, ...policyStatement(surface) }));

for (const policy of POLICIES) {
  assert.ok(policy.create.includes('app.current_actor_user_id()'),
    `${policy.name}: артефакт всё ещё не на акторском аксессоре — доказывать нечего`);
  assert.ok(!policy.create.includes('app.current_patient_user_id()'),
    `${policy.name}: артефакт всё ещё зовёт субъектный аксессор`);
}

/**
 * Форма стен. `injectRelation` возвращает субъектный аксессор РОВНО одной политике — это и есть
 * откат шага по одной таблице (см. Ш6 «Откат» в схеме), и проба обязана на нём краснеть.
 */
function policyShape(injectRelation = null) {
  return POLICIES.map((policy) => {
    const create = policy.relation === injectRelation
      ? policy.create.replaceAll('app.current_actor_user_id()', 'app.current_patient_user_id()')
      : policy.create;
    if (policy.relation === injectRelation) {
      assert.notEqual(create, policy.create, `инъекции нечего менять в ${policy.name}`);
    }
    return `${policy.drop}\n${create}`;
  }).join('\n');
}

function psql(sql, { tolerant = false } = {}) {
  try {
    return execFileSync(
      'sudo',
      ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
        '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
      { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (failure) {
    if (tolerant) return `${failure.stdout ?? ''}\nERROR:${failure.stderr ?? ''}`;
    throw new Error(`psql отказал: ${failure.stderr ?? failure.message}\n--- SQL ---\n${sql}`);
  }
}

/** Ответы вида `ключ=значение` — по одному на строку; всё прочее (NOTICE, пустые строки) отбрасывается. */
function answers(stdout) {
  return new Map(stdout.split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[a-z0-9_.]+=/u.test(line))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }));
}

function uuid(value, what) {
  assert.match(value ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u, `${what}: '${value}'`);
  return value;
}

function login(value) {
  assert.match(value ?? '', /^[a-z_][a-z0-9_]*$/u, `небезопасное имя логина '${value}'`);
  return value;
}

/* ─────────────────────── фикстуры: живые люди, а не выдуманные строки ─────────────────────── */

const coverage = (alias) => SURFACES
  .map((surface, index) => `(SELECT count(*) FROM ${surface.relation} s${index}`
    + ` WHERE s${index}.${surface.column} = ${alias}.id)`)
  .map((expression) => `LEAST(${expression}, 1)`)
  .join(' + ');

let cached = null;
function fixture() {
  if (cached) return cached;
  const capability = psql(`
SELECT 'capability=' || capability_id::text FROM app_ext.port_context_capabilities
 WHERE context_class = 'patient' AND target_role = 'app_patient'
   AND purpose = 'relation' AND function_identity IS NULL ORDER BY session_login LIMIT 1;
SELECT 'login=' || session_login FROM app_ext.port_context_capabilities
 WHERE context_class = 'patient' AND target_role = 'app_patient'
   AND purpose = 'relation' AND function_identity IS NULL ORDER BY session_login LIMIT 1;
SELECT 'args_hash=' || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex');`);
  const seam = answers(capability);
  assert.ok(seam.get('capability'),
    `${DATABASE}: у порта нет реляционной capability класса patient — проверять нечем`);

  // Человек берётся по ПОКРЫТИЮ поверхностей, а не «первый попавшийся»: проба, у которой субъект
  // пуст в семи таблицах из девяти, зеленела бы бесплатно.
  const chosen = answers(psql(`
SELECT 'self=' || candidate.id::text || '|' || enrollment.organization_id::text
  FROM public.platform_users candidate
  JOIN public.org_enrollments enrollment ON enrollment.platform_user_id = candidate.id
 ORDER BY (${coverage('candidate')}) DESC, candidate.id LIMIT 1;`));
  const [self, organization] = (chosen.get('self') ?? '').split('|');
  assert.ok(self, `${DATABASE}: нет ни одного зачисленного человека — доказывать нечего`);

  const otherRow = answers(psql(`
SELECT 'other=' || candidate.id::text FROM public.platform_users candidate
 WHERE candidate.id <> '${uuid(self, 'self')}'::uuid
 ORDER BY (${coverage('candidate')}) DESC, candidate.id LIMIT 1;`));
  const other = otherRow.get('other');
  assert.ok(other, `${DATABASE}: второго человека нет — «чужое не достаётся» проверить не на чем`);

  const census = answers(psql(SURFACES.map((surface) => `
SELECT 'self.${surface.relation}=' || count(*) FROM ${surface.relation}
 WHERE ${surface.column} = '${uuid(self, 'self')}'::uuid;
SELECT 'other.${surface.relation}=' || count(*) FROM ${surface.relation}
 WHERE ${surface.column} = '${uuid(other, 'other')}'::uuid;`).join('\n')));

  cached = {
    self: uuid(self, 'self'),
    other: uuid(other, 'other'),
    organization: uuid(organization, 'organization'),
    capability: uuid(seam.get('capability'), 'capability_id'),
    login: login(seam.get('login')),
    argsHash: (() => {
      assert.match(seam.get('args_hash') ?? '', /^[0-9a-f]{64}$/u, 'typed-args hash');
      return seam.get('args_hash');
    })(),
    census,
  };
  return cached;
}

/** Настоящий путь порта: тот же оператор, которым контекст ставит приложение. */
function installPatientContext({ capability, login: portLogin, argsHash, organization }) {
  return [
    `SET LOCAL SESSION AUTHORIZATION ${portLogin};`,
    `SELECT app.begin_port_context('${capability}'::uuid, ROW(1::smallint,`
      + ` 'patient'::app.port_context_class, 'app_patient'::name, 'relation', NULL::regprocedure,`
      + ` decode('${argsHash}', 'hex'), current_setting('bcb.actor_ref')::uuid,`
      + ` current_setting('bcb.subject_ref')::uuid, '${organization}'::uuid, NULL::bigint,`
      + ' NULL::uuid)::app.port_context_claims);',
  ].join('\n');
}

/**
 * Одна откаченная транзакция: целевая форма шва и стен, чеканка ссылок, законный контекст пациента,
 * затем заданные вопросы. `injectRelation` — та самая инъекция по одной таблице.
 */
function probe({ injectRelation = null, swapSubject = false, questions }) {
  const state = fixture();
  return answers(psql(`
BEGIN;
${CONTRACT_SHAPE}
${policyShape(injectRelation)}
DO $mint$ BEGIN
  PERFORM set_config('bcb.actor_ref',
    app_ext.resolve_variant_a_identity('${state.self}'::uuid, 'actor')::text, true);
  PERFORM set_config('bcb.subject_ref',
    app_ext.resolve_variant_a_identity('${state.self}'::uuid, 'subject')::text, true);
  PERFORM set_config('bcb.other_subject_ref',
    app_ext.resolve_variant_a_identity('${state.other}'::uuid, 'subject')::text, true);
END $mint$;
${installPatientContext(state)}
${swapSubject ? `RESET SESSION AUTHORIZATION;
UPDATE app_ext.accepted_port_contexts
   SET subject_ref = current_setting('bcb.other_subject_ref')::uuid
 WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id() AND cleared_at IS NULL;
SET LOCAL SESSION AUTHORIZATION ${state.login};
SET LOCAL ROLE app_patient;` : ''}
${questions}
ROLLBACK;
`));
}

/* ─────────────────────── сами утверждения ─────────────────────── */

test('Ш6 главное: под законным контекстом человек продолжает видеть СВОИ контакты, каналы и ФИО',
  { skip: !ENABLED }, () => {
    const state = fixture();
    const populated = SURFACES.filter((surface) =>
      Number(state.census.get(`self.${surface.relation}`) ?? '0') > 0);
    assert.notEqual(populated.length, 0,
      `ДОКАЗЫВАТЬ НЕЧЕГО на базе ${DATABASE}: у выбранного человека ${state.self} нет строк ни в одной `
      + 'из девяти поверхностей самообслуживания');

    const seen = probe({
      questions: populated.map((surface) => `SELECT 'seen.${surface.relation}=' || count(*)`
        + ` FROM ${surface.relation} WHERE ${surface.column} = '${state.self}'::uuid;`).join('\n'),
    });

    const broken = populated
      .map((surface) => ({
        relation: surface.relation,
        expected: state.census.get(`self.${surface.relation}`),
        got: seen.get(`seen.${surface.relation}`),
      }))
      .filter(({ expected, got }) => got !== expected);
    assert.deepEqual(broken, [], broken.length === 0 ? '' : [
      `${DATABASE}: самообслуживание сломано — акторская стена закрыла человеку его собственные строки:`,
      ...broken.map(({ relation, expected, got }) =>
        `  • ${relation}: своих строк ${expected}, видно ${got ?? 'ОТКАЗ'}`),
      'Это ровно та поломка, ради недопущения которой шаг делится по таблицам.',
    ].join('\n'));

    const notProven = SURFACES.filter((surface) => !populated.includes(surface)).map((s) => s.relation);
    if (notProven.length > 0) console.log(`НЕ ПРОВЕРЕНО (у человека нет строк): ${notProven.join(', ')}`);
  });

test('Ш6 смысл шага: субъектная ссылка чужого человека не открывает ни одной его строки',
  { skip: !ENABLED }, () => {
    const state = fixture();
    // ЛОВУШКА ПУСТОТЫ: «чужое не видно» истинно бесплатно, если у чужого нет строк.
    const populated = SURFACES.filter((surface) =>
      Number(state.census.get(`other.${surface.relation}`) ?? '0') > 0);
    assert.notEqual(populated.length, 0,
      `ДОКАЗЫВАТЬ НЕЧЕГО на базе ${DATABASE}: у второго человека ${state.other} нет строк ни в одной `
      + 'поверхности — «чужое не достаётся» здесь истинно бесплатно');

    const seen = probe({
      swapSubject: true,
      questions: [
        ...populated.map((surface) => `SELECT 'foreign.${surface.relation}=' || count(*)`
          + ` FROM ${surface.relation} WHERE ${surface.column} = '${state.other}'::uuid;`),
        `SELECT 'mine.user_contacts=' || count(*) FROM public.user_contacts`
          + ` WHERE platform_user_id = '${state.self}'::uuid;`,
      ].join('\n'),
    });

    const leaked = populated
      .map((surface) => ({ relation: surface.relation, rows: seen.get(`foreign.${surface.relation}`) }))
      .filter(({ rows }) => rows !== '0');
    assert.deepEqual(leaked, [], leaked.length === 0 ? '' : [
      `${DATABASE}: субъектная ссылка ОТКРЫЛА чужую личность — стена всё ещё читает медицинскую ссылку:`,
      ...leaked.map(({ relation, rows }) => `  • ${relation}: чужих строк видно ${rows}`),
    ].join('\n'));

    // Вторая половина того же вопроса: закрыв чужое, стена не закрыла своё.
    assert.equal(seen.get('mine.user_contacts'), state.census.get('self.public.user_contacts'),
      'акторская стена перестала пускать человека к его собственным контактам');
  });

for (const surface of SURFACES) {
  test(`Ш6 инъекция: субъектный аксессор в ${surface.relation} снова открывает чужую личность`,
    { skip: !ENABLED }, () => {
      const state = fixture();
      const foreign = Number(state.census.get(`other.${surface.relation}`) ?? '0');
      assert.notEqual(foreign, 0,
        `ДОКАЗЫВАТЬ НЕЧЕГО: у второго человека ${state.other} нет строк в ${surface.relation}, `
        + 'поэтому и инъекции нечего показать');

      const seen = probe({
        injectRelation: surface.relation,
        swapSubject: true,
        questions: SURFACES.map((other) => `SELECT 'foreign.${other.relation}=' || count(*)`
          + ` FROM ${other.relation} WHERE ${other.column} = '${state.other}'::uuid;`).join('\n'),
      });

      assert.equal(seen.get(`foreign.${surface.relation}`), String(foreign),
        `инъекция в ${surface.relation} НЕ покраснела: субъектная ссылка не открыла чужие строки — `
        + 'значит зелень основной пробы держится не на этой политике, а на чём-то другом');

      const alsoLeaked = SURFACES.filter((other) => other.relation !== surface.relation)
        .filter((other) => (seen.get(`foreign.${other.relation}`) ?? '0') !== '0')
        .map((other) => other.relation);
      assert.deepEqual(alsoLeaked, [],
        `инъекция в ${surface.relation} открыла ещё и ${alsoLeaked.join(', ')} — стены не независимы`);
    });
}

/** Три учётки владельца — единственные живые входы на DEV и TEST; ими он и проверяет работу. */
const OWNER_ACCOUNTS = [
  { email: 'kinesiospace@gmail.com', what: 'пациент', klass: 'patient', role: 'app_patient' },
  { email: 'dimmdao@yandex.ru', what: 'доктор', klass: 'staff', role: 'app_staff' },
  { email: 'dimmdao@gmail.com', what: 'глобальный админ', klass: 'platform', role: 'app_platform_admin' },
];

for (const account of OWNER_ACCOUNTS) {
  test(`Ш6: вход не ломается — учётная запись владельца «${account.what}» (${account.email})`,
    { skip: !ENABLED }, () => {
      const state = fixture();
      const found = answers(psql(`
SELECT 'person=' || u.id::text FROM public.user_contacts c JOIN public.platform_users u ON u.id = c.platform_user_id
 WHERE c.contact_kind = 'email' AND c.value_normalized = '${account.email}' LIMIT 1;
SELECT 'capability=' || capability_id::text || '|' || session_login FROM app_ext.port_context_capabilities
 WHERE context_class = '${account.klass}' AND target_role = '${account.role}'
   AND purpose = 'relation' AND function_identity IS NULL LIMIT 1;`));
      const person = found.get('person');
      assert.ok(person, `учётной записи владельца ${account.email} нет на ${DATABASE} — доказательство пустое`);
      const [capability, portLogin] = (found.get('capability') ?? '').split('|');
      assert.ok(capability, `на ${DATABASE} нет реляционной capability класса ${account.klass}`);

      // Организация нужна только классам, которые её несут; у платформы её нет по построению.
      const organization = account.klass === 'staff'
        ? answers(psql(`SELECT 'org=' || organization_id::text FROM public.be_organization_members
 WHERE platform_user_id = '${uuid(person, 'person')}'::uuid AND status = 'active' LIMIT 1;`)).get('org')
        : account.klass === 'patient'
          ? answers(psql(`SELECT 'org=' || organization_id::text FROM public.org_enrollments
 WHERE platform_user_id = '${uuid(person, 'person')}'::uuid LIMIT 1;`)).get('org')
          : null;
      const subjectRef = account.klass === 'patient' ? "current_setting('bcb.actor_subject')::uuid" : 'NULL::uuid';

      const seen = answers(psql(`
BEGIN;
${CONTRACT_SHAPE}
${policyShape()}
DO $mint$ BEGIN
  PERFORM set_config('bcb.actor',
    app_ext.resolve_variant_a_identity('${person}'::uuid, 'actor')::text, true);
  PERFORM set_config('bcb.actor_subject',
    app_ext.resolve_variant_a_identity('${person}'::uuid, 'subject')::text, true);
END $mint$;
SET LOCAL SESSION AUTHORIZATION ${login(portLogin)};
SELECT app.begin_port_context('${uuid(capability, 'capability')}'::uuid, ROW(1::smallint,
  '${account.klass}'::app.port_context_class, '${account.role}'::name, 'relation', NULL::regprocedure,
  decode('${state.argsHash}', 'hex'), current_setting('bcb.actor')::uuid, ${subjectRef},
  ${organization ? `'${uuid(organization, 'organization')}'::uuid` : 'NULL::uuid'}, NULL::bigint, NULL::uuid)::app.port_context_claims);
SELECT 'actor=' || app.current_actor_user_id()::text;
ROLLBACK;
`));
      assert.equal(seen.get('actor'), person,
        `вход учётки владельца «${account.what}» сломан: аксессор вернул ${seen.get('actor') ?? 'ОТКАЗ'} вместо ${person}`);
    });
}
