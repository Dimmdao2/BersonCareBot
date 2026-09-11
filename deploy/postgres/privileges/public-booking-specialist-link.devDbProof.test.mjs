/**
 * Живое доказательство #926 §17.C на именованной DEV-базе. Opt-in: без
 * `RUN_PUBLIC_BOOKING_SPECIALIST_LINK_DB=1` файл пропускается, в CI в базу не ходит.
 *
 * Предмет — тело SECURITY DEFINER-функции `app.read_public_booking_catalog(uuid,uuid,uuid)`, то
 * есть то, чего не видит ни сборка, ни типы, ни один тест с подставной дверью: подставная дверь
 * возвращает то, что ей велел автор теста, а проверять надо, что возвращает НАСТОЯЩАЯ дверь
 * настоящей анонимной роли `app_tenant_service`.
 *
 * Два независимых класса поломки, оба дорогие и оба молчаливые.
 *
 *   1. **По ссылке `?specialist=<id>` аноним перебирает людей.** Ссылку на запись клиника раздаёт
 *      публично, а идентификатор в ней — обычный uuid, который можно менять руками. Разойдись
 *      ответы двери по форме — «нет такого», «есть, но клиника его не публикует», «есть, но
 *      уволен», «есть в другой клинике» — и перебор отвечает, кто в клинике работает и кого она
 *      наружу не выпускала. ФИО сотрудника это персональные данные. На экране при этом не меняется
 *      НИЧЕГО: человек в любом случае видит «этот специалист больше не принимает записи».
 *      Требование владельца: план §3.3 («одинаковый отказ, иначе анонимный запрос перечисляет»),
 *      §17.G («неактивный или удалённый специалист даёт тот же отказ»).
 *
 *   2. **Сужение каталога молча потерялось.** Ровно этим 17.C и открыт: кабинет выдавал ссылку
 *      «к Анне», а приёмный экран показывал весь филиал. Отказ дорогой (человек записывается не к
 *      тому специалисту и узнаёт об этом в кабинете врача) и абсолютно молчаливый — список услуг
 *      выглядит исправным, просто он не тот. Верни дверь полный список, потеряй JOIN по
 *      `be_specialist_service_availability` или сравни специалиста не с тем столбцом — снаружи не
 *      изменится ни один пиксель.
 *
 * Оракул независим от реализации: решение владельца и план
 * `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §17.C, §3.3, §6.2, §6.3.
 *
 * ПОЧЕМУ ОДИНАКОВОСТЬ ОТКАЗОВ ЗДЕСЬ НЕ ДОКАЗЫВАЕТСЯ ПУСТОТОЙ. У скрытого, неактивного и чужого
 * специалиста в фикстуре стоит ЖИВАЯ активная услуга в ТОМ ЖЕ филиале, а самотест `sameShape`
 * отдельно показывает, что без сужения этот филиал отдаёт две услуги, а не одну. Иначе «ответы
 * совпали» значило бы только «фикстура пуста», и тест зеленел бы на двери вообще без предикатов.
 *
 * Механика та же, что у соседних `*.devDbProof.test.mjs`: строка способности пересъёмкается с
 * объявленной и отличается только логином (`app.begin_port_context` выдан mTLS-логинам, а
 * доказывать надо правило двери, а не сертификаты), организация приезжает в принятом контексте —
 * дверь берёт её оттуда, а не из аргумента, — чтение идёт настоящей анонимной ролью, вся работа в
 * ОДНОЙ транзакции, которая кончается ROLLBACK. Постоянных следов на DEV не остаётся.
 *
 * Запуск (ведущий, на боксе):
 *   RUN_PUBLIC_BOOKING_SPECIALIST_LINK_DB=1 node --test \
 *     deploy/postgres/privileges/public-booking-specialist-link.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_PUBLIC_BOOKING_SPECIALIST_LINK_DB === '1';
const DATABASE = process.env.PUBLIC_BOOKING_SPECIALIST_LINK_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const ORG = '926c0000-0000-4000-8000-00000000000a';
const FOREIGN_ORG = '926c0000-0000-4000-8000-00000000000f';
const BRANCH = '926c2222-0000-4000-8000-00000000000a';
const SECOND_BRANCH = '926c2222-0000-4000-8000-00000000001a';
const FOREIGN_BRANCH = '926c2222-0000-4000-8000-00000000000f';

const SPECIALIST = {
  published: '926c3333-0000-4000-8000-000000000001',
  unpublished: '926c3333-0000-4000-8000-000000000002',
  inactive: '926c3333-0000-4000-8000-000000000003',
  foreign: '926c3333-0000-4000-8000-00000000000f',
  missing: '926c3333-0000-4000-8000-000000009999',
};

const SERVICE_OF_PUBLISHED = 'AUDIT926C Услуга опубликованного';
const SERVICE_OF_UNPUBLISHED = 'AUDIT926C Услуга скрытого';
const CAPABILITY = '00000000-0000-4000-8000-00000000926d';

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/**
 * Фикстура целиком внутри транзакции. Организации ставятся в обход триггеров: триггер засева
 * справочника к предмету проверки отношения не имеет, а транзакция всё равно откатывается.
 */
const FIXTURE = `
SET LOCAL session_replication_role = replica;
INSERT INTO public.be_organizations (id, title, is_active) VALUES
  ('${ORG}'::uuid, 'AUDIT926C Своя клиника', true),
  ('${FOREIGN_ORG}'::uuid, 'AUDIT926C Чужая клиника', true);
SET LOCAL session_replication_role = origin;

INSERT INTO public.organization_slug_claims (slug, kind, organization_id) VALUES
  ('audit926c-own', 'current', '${ORG}'::uuid),
  ('audit926c-foreign', 'current', '${FOREIGN_ORG}'::uuid);

-- Запись открыта у обеих: дверь пускает каталог только клинике с \`is_published\` каталога.
INSERT INTO public.clinic_public_directory_entries
  (organization_id, slug, display_name, is_published, card_is_published) VALUES
  ('${ORG}'::uuid, 'audit926c-own', 'AUDIT926C Своя клиника', true, true),
  ('${FOREIGN_ORG}'::uuid, 'audit926c-foreign', 'AUDIT926C Чужая клиника', true, true);

INSERT INTO public.be_branches (id, organization_id, title, city_code, address, is_active, sort_order) VALUES
  ('${BRANCH}'::uuid, '${ORG}'::uuid, 'AUDIT926C Филиал A1', 'msk', 'ул. A 1', true, 10),
  ('${SECOND_BRANCH}'::uuid, '${ORG}'::uuid, 'AUDIT926C Филиал A2', 'msk', 'ул. A 2', true, 20),
  ('${FOREIGN_BRANCH}'::uuid, '${FOREIGN_ORG}'::uuid, 'AUDIT926C Филиал F1', 'msk', 'ул. F 1', true, 10);

INSERT INTO public.be_specialists
  (id, organization_id, full_name, description, is_active, card_is_published, sort_order) VALUES
  ('${SPECIALIST.published}'::uuid, '${ORG}'::uuid, 'AUDIT926C Опубликованный', 'короткая', true, true, 10),
  ('${SPECIALIST.unpublished}'::uuid, '${ORG}'::uuid, 'AUDIT926C Неопубликованный', 'короткая', true, false, 20),
  ('${SPECIALIST.inactive}'::uuid, '${ORG}'::uuid, 'AUDIT926C Неактивный', 'короткая', false, true, 30),
  ('${SPECIALIST.foreign}'::uuid, '${FOREIGN_ORG}'::uuid, 'AUDIT926C Чужой специалист', 'короткая', true, true, 10);

INSERT INTO public.be_clinic_services
  (id, organization_id, title, duration_minutes, price_minor, is_active, public_widget_visible, admin_manual_only, sort_order) VALUES
  ('926c4444-0000-4000-8000-000000000001'::uuid, '${ORG}'::uuid, '${SERVICE_OF_PUBLISHED}', 60, 100000, true, true, false, 10),
  ('926c4444-0000-4000-8000-000000000002'::uuid, '${ORG}'::uuid, '${SERVICE_OF_UNPUBLISHED}', 60, 100000, true, true, false, 20),
  ('926c4444-0000-4000-8000-00000000000f'::uuid, '${FOREIGN_ORG}'::uuid, 'AUDIT926C Чужая услуга', 60, 100000, true, true, false, 10);

-- У КАЖДОГО отказного специалиста живая активная услуга в ТОМ ЖЕ филиале: иначе одинаковость
-- отказов доказывалась бы пустотой фикстуры, а не предикатами двери.
INSERT INTO public.be_specialist_service_availability
  (organization_id, specialist_id, service_id, branch_id, is_active) VALUES
  ('${ORG}'::uuid, '${SPECIALIST.published}'::uuid, '926c4444-0000-4000-8000-000000000001'::uuid, '${BRANCH}'::uuid, true),
  ('${ORG}'::uuid, '${SPECIALIST.unpublished}'::uuid, '926c4444-0000-4000-8000-000000000002'::uuid, '${BRANCH}'::uuid, true),
  ('${ORG}'::uuid, '${SPECIALIST.inactive}'::uuid, '926c4444-0000-4000-8000-000000000002'::uuid, '${BRANCH}'::uuid, true),
  ('${FOREIGN_ORG}'::uuid, '${SPECIALIST.foreign}'::uuid, '926c4444-0000-4000-8000-00000000000f'::uuid, '${FOREIGN_BRANCH}'::uuid, true);

INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
SELECT '${CAPABILITY}'::uuid, c.port, session_user,
       c.target_role, c.context_class, c.purpose, c.function_identity
  FROM app_ext.port_context_capabilities c
 WHERE c.purpose = 'booking.public-catalog.read'
   AND c.function_identity = 'app.read_public_booking_catalog(uuid,uuid,uuid)'::regprocedure
 LIMIT 1;
`;

/** Один вызов двери: принятый контекст под ровно те аргументы, с которыми она будет позвана. */
function call({ label, branch, specialist }) {
  const branchArg = branch ? `'${branch}'::uuid` : 'NULL::uuid';
  const specialistArg = specialist ? `'${specialist}'::uuid` : 'NULL::uuid';
  return `
DELETE FROM app_ext.accepted_port_contexts
 WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
   AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, function_identity, typed_args_hash, organization_id)
SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, c.session_login,
       c.port, c.target_role, c.context_class, c.purpose, c.function_identity,
       app.hash_port_typed_args(ARRAY[
         ROW('uuid@1', pg_catalog.uuid_send(${branchArg}))::app.port_typed_arg,
         ROW('uuid@1', pg_catalog.uuid_send(NULL::uuid))::app.port_typed_arg,
         ROW('uuid@1', pg_catalog.uuid_send(${specialistArg}))::app.port_typed_arg]),
       '${ORG}'::uuid
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database() AND c.capability_id = '${CAPABILITY}'::uuid
 LIMIT 1;
SET LOCAL ROLE app_tenant_service;
SELECT '${label}' || E'\\t' ||
  COALESCE(app.read_public_booking_catalog(${branchArg}, NULL, ${specialistArg})::text, '<NULL>');
RESET ROLE;`;
}

const CASES = [
  { label: 'wide', branch: BRANCH, specialist: null },
  { label: 'published', branch: BRANCH, specialist: SPECIALIST.published },
  { label: 'unpublished', branch: BRANCH, specialist: SPECIALIST.unpublished },
  { label: 'inactive', branch: BRANCH, specialist: SPECIALIST.inactive },
  { label: 'foreign', branch: BRANCH, specialist: SPECIALIST.foreign },
  { label: 'missing', branch: BRANCH, specialist: SPECIALIST.missing },
  { label: 'foreignBranch', branch: FOREIGN_BRANCH, specialist: SPECIALIST.published },
  { label: 'firstScreen', branch: null, specialist: SPECIALIST.published },
];

let cached = null;

/** Один прогон транзакции на весь файл: фикстура, все вызовы двери, самотест шва, ROLLBACK. */
function readDoor() {
  if (cached) return cached;
  const out = psql(`
BEGIN;
${FIXTURE}
${CASES.map(call).join('\n')}
-- Самотест: не дотягивайся владелец шва до скрытых, неактивных и чужих строк — утверждения ниже
-- зеленели бы независимо от предикатов двери, то есть не проверяли бы ничего.
SET LOCAL ROLE app_seam_public_booking_owner;
SELECT 'seam' || E'\\t' || (
  (SELECT count(*)::text FROM public.be_specialists
    WHERE id IN ('${SPECIALIST.unpublished}'::uuid, '${SPECIALIST.inactive}'::uuid, '${SPECIALIST.foreign}'::uuid))
  || '/' ||
  (SELECT count(*)::text FROM public.be_specialist_service_availability
    WHERE specialist_id IN ('${SPECIALIST.unpublished}'::uuid, '${SPECIALIST.inactive}'::uuid, '${SPECIALIST.foreign}'::uuid)
      AND is_active));
RESET ROLE;
ROLLBACK;`);

  const byLabel = new Map();
  for (const line of out.split('\n')) {
    const [label, payload] = line.split('\t');
    if (label) byLabel.set(label, payload);
  }
  assert.equal(
    byLabel.get('seam'),
    '3/3',
    'самотест: владелец шва обязан видеть и скрытого, и неактивного, и чужого — иначе проверять нечего',
  );
  cached = byLabel;
  return cached;
}

const parse = (label) => {
  const raw = readDoor().get(label);
  assert.ok(raw && raw !== '<NULL>', `фикстура: случай '${label}' обязан прочитаться дверью`);
  return JSON.parse(raw);
};
const titles = (catalog) => catalog.services.map((service) => service.title).sort();

test('ссылка со специалистом сужает каталог до ЕГО услуг, а не отдаёт весь филиал', { skip: !ENABLED }, () => {
  const wide = parse('wide');
  const narrowed = parse('published');

  // Самотест сужения: без специалиста в том же филиале записываются ДВЕ услуги. Не будь второй,
  // «сузилось» было бы неотличимо от «в филиале одна услуга».
  assert.deepEqual(
    titles(wide),
    [SERVICE_OF_PUBLISHED, SERVICE_OF_UNPUBLISHED].sort(),
    'фикстура: без сужения филиал обязан отдавать обе услуги',
  );

  assert.equal(narrowed.specialist?.id, SPECIALIST.published, 'дверь не назвала специалиста из ссылки');
  assert.deepEqual(
    titles(narrowed),
    [SERVICE_OF_PUBLISHED],
    'ссылка «к этому специалисту» отдала услуги, которых он не ведёт — человек запишется не к тому',
  );
  assert.deepEqual(
    parse('firstScreen').specialist?.branchIds,
    [BRANCH],
    'первый экран обязан знать филиалы, где он ДЕЙСТВИТЕЛЬНО принимает (план §6.2)',
  );
});

test('неопубликованный, неактивный, чужой и несуществующий специалист неразличимы по ответу', { skip: !ENABLED }, () => {
  const refusals = ['unpublished', 'inactive', 'foreign', 'missing'].map((label) => readDoor().get(label));

  // Самотест против «доказано пустотой»: услуга скрытого специалиста в этом филиале ЖИВАЯ и
  // записывается — значит его отказ дан предикатом двери, а не отсутствием данных.
  assert.ok(
    titles(parse('wide')).includes(SERVICE_OF_UNPUBLISHED),
    'фикстура: у скрытого специалиста обязана быть живая услуга в этом филиале',
  );

  assert.equal(
    new Set(refusals).size,
    1,
    'ответы четырёх отказов различаются — по форме ответа аноним перечисляет людей клиники',
  );
  const refusal = JSON.parse(refusals[0]);
  assert.equal(refusal.specialist, null, 'отказ назвал специалиста');
  assert.deepEqual(refusal.services, [], 'отказ отдал услуги — сужение обошли неверным идентификатором');
  // Пустого списка не показываем: экран «больше не принимает» обязан тут же дать живые филиалы.
  assert.equal(refusal.branches.length, 2, 'отказ обязан оставить действующие филиалы клиники (план §6.3)');
});

test('чужая клиника не выходит наружу ни специалистом, ни филиалом, ни услугой', { skip: !ENABLED }, () => {
  const foreignSpecialist = parse('foreign');
  const foreignBranch = parse('foreignBranch');

  const branchOrgs = new Set(
    [...foreignSpecialist.branches, ...foreignBranch.branches].map((branch) => branch.organizationId),
  );
  assert.deepEqual([...branchOrgs], [ORG], 'в ответ попал филиал ЧУЖОЙ организации');
  assert.equal(foreignBranch.branch, null, 'филиал чужой клиники открылся под слагом этой');
  assert.deepEqual(foreignBranch.services, [], 'под чужим филиалом отдались услуги');
  assert.equal(
    foreignSpecialist.specialist,
    null,
    'специалист ЧУЖОЙ клиники опознан по ссылке — это перебор людей через границу арендатора',
  );
});
