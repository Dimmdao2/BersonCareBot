/**
 * Живое доказательство #926 §17.F на именованной DEV-базе. Opt-in: без
 * `RUN_CLINIC_ROOT_DEGENERATE_DB=1` файл пропускается, в CI в базу не ходит.
 *
 * Предмет — граница, которую проводит тело `app.read_public_clinic_card(text)`: КОМУ корневой
 * адрес отвечает строкой, а кому не отвечает вовсе. Ни сборка, ни типы, ни тест с подставным
 * репозиторием этого не видят: подставной репозиторий отдаёт то, что ему велел автор теста.
 *
 * РЕШЕНИЕ ВЛАДЕЛЬЦА 11.09, дословно (план §17.F): «корень клиники должен стать входом в кабинет.
 * Не должно быть исчезнувшего адреса, то есть там будет вход в кабинет, там название клиники, и
 * что это на платформе Therapysto работает». Это и есть независимый оракул обоих утверждений
 * ниже — вместе с §3.3 («клиники нет / не опубликована / организация неактивна → одинаковый 404,
 * иначе анонимный запрос перечисляет клиники») и §3.5 («набор медиа двери И ЕСТЬ авторизация
 * анонимной отдачи файла»).
 *
 * Два независимых класса поломки, оба дорогие и оба молчаливые.
 *
 *   1. **Граница уезжает с `is_published` каталога на `card_is_published` визитки.** В одну
 *      сторону это возвращает 404 на собственном адресе клиники — человек набирает адрес, видит
 *      «страница не найдена» и уходит, хотя запись у клиники в это же время открыта; клиника об
 *      этом не узнаёт никогда, потому что в кабинете у неё всё цело. В другую сторону — хуже:
 *      корень начинает отвечать клинике, которой НЕТ в публичном каталоге, и аноним перебором
 *      слагов отличает «есть, но скрыта» от «нет вовсе», то есть перечисляет клиники платформы.
 *      На экране в обоих случаях всё выглядит исправным.
 *
 *   2. **Галка визитки снова начинает что-то закрывать.** Утверждение этого файла ПЕРЕВЁРНУТО
 *      этапом 2d: раньше оно требовало, чтобы выключенная визитка сужала набор медиа до логотипа,
 *      и владелец 11.09 отверг это дословно — «выключение визитки закрывает заодно страницы
 *      специалистов этой клиники и отдачу её фотографий — НЕ ВЕРНО… нам не надо сейчас пытаться
 *      что-то от кого-то здесь закрыть». Галка решает ВИД корневого экрана, и только.
 *
 *      Почему поломка дорогая и молчаливая именно здесь. Набор медиа, который вернула дверь, И ЕСТЬ
 *      право на анонимную отдачу `/{clinic}/media/{uuid}`: маршрут отдаёт ровно то, что в наборе, и
 *      больше ничего не проверяет. Страница специалиста точно так же ищет человека в списке ЭТОЙ
 *      двери и второго запроса не делает. Значит стоит кому-нибудь вернуть предикат `card_is_published`
 *      обратно (а это ровно один `AND`, и выглядит он как «навели порядок»), и у клиники, снявшей
 *      галку «Показывать страницу организации», молча гаснут фотографии, файлы её материалов,
 *      аватары и целые страницы её специалистов — везде, куда она успела дать ссылки. В кабинете у
 *      неё при этом всё цело, посетителю показывать некому: узнать об этом ей неоткуда.
 *
 *      Оракул независим от кода: уточнение владельца 11.09 в §17.F плана, три его следствия.
 *
 * Чего здесь НЕТ намеренно. Разметка вырожденного экрана (имя, кнопка входа, отметка платформы)
 * проверяется живым взглядом, а не тестом (§10a: автоматизированные UI-тесты запрещены).
 *
 * Запуск (ведущий, на боксе):
 *   RUN_CLINIC_ROOT_DEGENERATE_DB=1 node --test \
 *     deploy/postgres/privileges/clinic-root-degenerate-entry.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_CLINIC_ROOT_DEGENERATE_DB === '1';
const DATABASE = process.env.CLINIC_ROOT_DEGENERATE_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const CAPABILITY = '00000000-0000-4000-8000-00000000926c';

/** Четыре сочетания двух флагов плюс неактивная организация — по одной клинике на случай. */
const CLINIC = {
  listedCardOn: { org: '926c0000-0000-4000-8000-00000000010a', slug: 'audit926f-listed-card-on' },
  listedCardOff: { org: '926c0000-0000-4000-8000-00000000010b', slug: 'audit926f-listed-card-off' },
  unlistedCardOn: { org: '926c0000-0000-4000-8000-00000000010c', slug: 'audit926f-unlisted-card-on' },
  unlistedCardOff: { org: '926c0000-0000-4000-8000-00000000010d', slug: 'audit926f-unlisted-card-off' },
  inactiveOrg: { org: '926c0000-0000-4000-8000-00000000010e', slug: 'audit926f-inactive-org' },
};
const MISSING_SLUG = 'audit926f-no-such-clinic';

const MEDIA = {
  logoOn: '926c1111-0000-4000-8000-00000000010a',
  photoOn: '926c1111-0000-4000-8000-00000000020a',
  avatarOn: '926c1111-0000-4000-8000-00000000030a',
  logoOff: '926c1111-0000-4000-8000-00000000010b',
  photoOff: '926c1111-0000-4000-8000-00000000020b',
  avatarOff: '926c1111-0000-4000-8000-00000000030b',
  materialOff: '926c1111-0000-4000-8000-00000000040b',
};

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/**
 * Обе клиники наполнены ОДИНАКОВО — логотип, фотография, опубликованный специалист с аватаром,
 * услуга, филиал, описание и контакт. Разница ровно в одной галке: иначе «у выключенной ничего не
 * вышло» доказывалось бы тем, что у неё ничего и не было.
 */
const FIXTURE = `
SET LOCAL session_replication_role = replica;
INSERT INTO public.be_organizations (id, title, is_active) VALUES
  ('${CLINIC.listedCardOn.org}'::uuid,    'AUDIT926F В каталоге, витрина включена',  true),
  ('${CLINIC.listedCardOff.org}'::uuid,   'AUDIT926F В каталоге, витрина выключена', true),
  ('${CLINIC.unlistedCardOn.org}'::uuid,  'AUDIT926F Вне каталога, витрина включена', true),
  ('${CLINIC.unlistedCardOff.org}'::uuid, 'AUDIT926F Вне каталога, витрина выключена', true),
  ('${CLINIC.inactiveOrg.org}'::uuid,     'AUDIT926F Неактивная организация', false);
SET LOCAL session_replication_role = origin;

INSERT INTO public.organization_slug_claims (slug, kind, organization_id) VALUES
  ('${CLINIC.listedCardOn.slug}', 'current', '${CLINIC.listedCardOn.org}'::uuid),
  ('${CLINIC.listedCardOff.slug}', 'current', '${CLINIC.listedCardOff.org}'::uuid),
  ('${CLINIC.unlistedCardOn.slug}', 'current', '${CLINIC.unlistedCardOn.org}'::uuid),
  ('${CLINIC.unlistedCardOff.slug}', 'current', '${CLINIC.unlistedCardOff.org}'::uuid),
  ('${CLINIC.inactiveOrg.slug}', 'current', '${CLINIC.inactiveOrg.org}'::uuid);

INSERT INTO public.media_files
  (id, original_name, stored_path, mime_type, size_bytes, status, owner_kind, organization_id, storage_target, s3_key) VALUES
  ('${MEDIA.logoOn}'::uuid,      'logo.png',   'a926f/1.png', 'image/png', 10, 'ready', 'organization', '${CLINIC.listedCardOn.org}'::uuid,  'library', 'a926f/1.png'),
  ('${MEDIA.photoOn}'::uuid,     'photo.png',  'a926f/2.png', 'image/png', 10, 'ready', 'organization', '${CLINIC.listedCardOn.org}'::uuid,  'library', 'a926f/2.png'),
  ('${MEDIA.avatarOn}'::uuid,    'avatar.png', 'a926f/3.png', 'image/png', 10, 'ready', 'organization', '${CLINIC.listedCardOn.org}'::uuid,  'library', 'a926f/3.png'),
  ('${MEDIA.logoOff}'::uuid,     'logo.png',   'a926f/4.png', 'image/png', 10, 'ready', 'organization', '${CLINIC.listedCardOff.org}'::uuid, 'library', 'a926f/4.png'),
  ('${MEDIA.photoOff}'::uuid,    'photo.png',  'a926f/5.png', 'image/png', 10, 'ready', 'organization', '${CLINIC.listedCardOff.org}'::uuid, 'library', 'a926f/5.png'),
  ('${MEDIA.avatarOff}'::uuid,   'avatar.png', 'a926f/6.png', 'image/png', 10, 'ready', 'organization', '${CLINIC.listedCardOff.org}'::uuid, 'library', 'a926f/6.png'),
  ('${MEDIA.materialOff}'::uuid, 'clip.mp4',   'a926f/7.mp4', 'video/mp4', 10, 'ready', 'organization', '${CLINIC.listedCardOff.org}'::uuid, 'library', 'a926f/7.mp4');

INSERT INTO public.clinic_public_directory_entries
  (organization_id, slug, display_name, is_published, card_is_published, description,
   public_contact_phone, logo_media_id, photo_media_ids, full_description_markdown) VALUES
  ('${CLINIC.listedCardOn.org}'::uuid, '${CLINIC.listedCardOn.slug}', 'AUDIT926F Витрина включена', true, true,
   'рекламный текст', '+7 900 000-00-01', '${MEDIA.logoOn}'::uuid, ARRAY['${MEDIA.photoOn}'::uuid], NULL),
  ('${CLINIC.listedCardOff.org}'::uuid, '${CLINIC.listedCardOff.slug}', 'AUDIT926F Витрина выключена', true, false,
   'рекламный текст', '+7 900 000-00-02', '${MEDIA.logoOff}'::uuid, ARRAY['${MEDIA.photoOff}'::uuid],
   '![материал](/api/media/${MEDIA.materialOff})'),
  ('${CLINIC.unlistedCardOn.org}'::uuid, '${CLINIC.unlistedCardOn.slug}', 'AUDIT926F Вне каталога, витрина вкл', false, true, NULL, NULL, NULL, '{}'::uuid[], NULL),
  ('${CLINIC.unlistedCardOff.org}'::uuid, '${CLINIC.unlistedCardOff.slug}', 'AUDIT926F Вне каталога, витрина выкл', false, false, NULL, NULL, NULL, '{}'::uuid[], NULL),
  ('${CLINIC.inactiveOrg.org}'::uuid, '${CLINIC.inactiveOrg.slug}', 'AUDIT926F Неактивная организация', true, true, NULL, NULL, NULL, '{}'::uuid[], NULL);

INSERT INTO public.be_branches (organization_id, title, city_code, address, is_active, sort_order) VALUES
  ('${CLINIC.listedCardOn.org}'::uuid,  'AUDIT926F Филиал включённой', 'msk', 'ул. 1', true, 10),
  ('${CLINIC.listedCardOff.org}'::uuid, 'AUDIT926F Филиал выключенной', 'msk', 'ул. 2', true, 10);

INSERT INTO public.be_specialists
  (organization_id, full_name, description, is_active, card_is_published, avatar_media_id, sort_order) VALUES
  ('${CLINIC.listedCardOn.org}'::uuid,  'AUDIT926F Человек включённой', 'короткая', true, true, '${MEDIA.avatarOn}'::uuid, 10),
  ('${CLINIC.listedCardOff.org}'::uuid, 'AUDIT926F Человек выключенной', 'короткая', true, true, '${MEDIA.avatarOff}'::uuid, 10);

INSERT INTO public.be_clinic_services
  (organization_id, title, duration_minutes, price_minor, is_active, public_widget_visible, admin_manual_only, sort_order) VALUES
  ('${CLINIC.listedCardOn.org}'::uuid,  'AUDIT926F Услуга включённой', 60, 100000, true, true, false, 10),
  ('${CLINIC.listedCardOff.org}'::uuid, 'AUDIT926F Услуга выключенной', 60, 100000, true, true, false, 10);

INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
SELECT '${CAPABILITY}'::uuid, c.port, session_user,
       c.target_role, c.context_class, c.purpose, c.function_identity
  FROM app_ext.port_context_capabilities c
 WHERE c.purpose = 'clinic.public-card.read'
   AND c.function_identity = 'app.read_public_clinic_card(text)'::regprocedure
 LIMIT 1;
`;

/** Одно чтение корня настоящей анонимной ролью — ровно так его читает страница `/{clinic}`. */
function read(slug) {
  return `
DELETE FROM app_ext.accepted_port_contexts
 WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
   AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, function_identity, typed_args_hash)
SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, c.session_login,
       c.port, c.target_role, c.context_class, c.purpose, c.function_identity,
       app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend('${slug}'))::app.port_typed_arg])
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database() AND c.capability_id = '${CAPABILITY}'::uuid
 LIMIT 1;
SET LOCAL ROLE app_pre_session;
SELECT '${slug}' || E'\\t' || COALESCE(app.read_public_clinic_card('${slug}')::text, '<NULL>');
RESET ROLE;`;
}

const SLUGS = [
  CLINIC.listedCardOn.slug,
  CLINIC.listedCardOff.slug,
  CLINIC.unlistedCardOn.slug,
  CLINIC.unlistedCardOff.slug,
  CLINIC.inactiveOrg.slug,
  MISSING_SLUG,
];

let cached = null;

function readRoots() {
  if (cached) return cached;
  const out = psql(`
BEGIN;
${FIXTURE}
${SLUGS.map(read).join('\n')}
-- Самотест: не дотягивайся владелец шва до скрытых клиник и их файлов — утверждения ниже зеленели
-- бы независимо от предикатов двери, то есть не проверяли бы ничего.
SET LOCAL ROLE app_seam_public_clinic_card_owner;
SELECT 'seam' || E'\\t' || (
  (SELECT count(*)::text FROM public.clinic_public_directory_entries
    WHERE organization_id IN ('${CLINIC.unlistedCardOn.org}'::uuid, '${CLINIC.unlistedCardOff.org}'::uuid,
                              '${CLINIC.inactiveOrg.org}'::uuid))
  || '/' ||
  (SELECT count(*)::text FROM public.media_files
    WHERE id IN ('${MEDIA.photoOff}'::uuid, '${MEDIA.avatarOff}'::uuid, '${MEDIA.materialOff}'::uuid)));
RESET ROLE;
ROLLBACK;`);

  const bySlug = new Map();
  for (const line of out.split('\n')) {
    const [slug, payload] = line.split('\t');
    if (slug) bySlug.set(slug, payload);
  }
  assert.equal(
    bySlug.get('seam'),
    '3/3',
    'самотест: владелец шва обязан видеть и скрытые клиники, и их непубличные файлы',
  );
  cached = bySlug;
  return cached;
}

const card = (slug) => {
  const raw = readRoots().get(slug);
  assert.ok(raw && raw !== '<NULL>', `корень '${slug}' обязан отвечать строкой, а отдал 404`);
  return JSON.parse(raw);
};

test('корень отвечает ровно одному из четырёх сочетаний сверх обычной визитки', { skip: !ENABLED }, () => {
  // Решение владельца: выключенная визитка НИКОГДА не даёт 404 на собственном адресе клиники.
  const degenerate = card(CLINIC.listedCardOff.slug);
  assert.equal(degenerate.cardIsPublished, false, 'дверь не сказала странице, что визитка выключена');
  assert.equal(
    degenerate.displayName,
    'AUDIT926F Витрина выключена',
    'вырожденный корень обязан нести имя клиники — иначе показывать нечего',
  );
  assert.equal(card(CLINIC.listedCardOn.slug).cardIsPublished, true, 'обычная визитка перестала быть визиткой');

  // Граница §3.3: всё, чего нет в публичном каталоге, по-прежнему неразличимо с несуществующим.
  const refusals = [
    CLINIC.unlistedCardOn.slug,
    CLINIC.unlistedCardOff.slug,
    CLINIC.inactiveOrg.slug,
    MISSING_SLUG,
  ].map((slug) => readRoots().get(slug));
  assert.deepEqual(
    refusals,
    ['<NULL>', '<NULL>', '<NULL>', '<NULL>'],
    'корень ответил клинике, которой нет в публичном каталоге, — аноним перебором слагов перечисляет клиники',
  );
});

/**
 * Зеркало снятого закрытия. Обе клиники фикстуры наполнены ОДИНАКОВО и различаются ровно одной
 * галкой, поэтому «у выключенной всё на месте» здесь не может быть доказано пустотой: рядом стоит
 * включённая с тем же набором, и обе проверяются одним и тем же перечнем.
 */
test('выключенная визитка не закрывает ни одного файла и ни одного человека', { skip: !ENABLED }, () => {
  const off = card(CLINIC.listedCardOff.slug);

  assert.deepEqual(
    off.media.map((asset) => asset.id).sort(),
    [MEDIA.logoOff, MEDIA.photoOff, MEDIA.avatarOff, MEDIA.materialOff].sort(),
    'из набора выключенной визитки пропал файл — по его ссылке у клиники теперь 404, и она об этом не узнает',
  );
  assert.equal(
    off.specialists.length,
    1,
    'выключенная визитка опустошила список людей — страница специалиста ищет человека В ЭТОМ списке, то есть она закрылась вместе с галкой',
  );
  assert.equal(off.services.length, 1, 'выключенная визитка перестала отдавать услуги');
  assert.equal(off.locations.length, 1, 'выключенная визитка перестала отдавать адрес филиала');
  assert.ok(off.description, 'выключенная визитка обнулила рекламный текст');
  assert.ok(off.fullDescriptionMarkdown, 'выключенная визитка обнулила полное описание');
  assert.ok(off.publicContactPhone, 'выключенная визитка обнулила контакт клиники');

  // Зеркальная половина: у клиники с ВКЛЮЧЁННОЙ визиткой ничего из этого не закрылось. Она же
  // ловит обратную ошибку — «починку», которая снесла бы набор у обеих сразу.
  const on = card(CLINIC.listedCardOn.slug);
  assert.deepEqual(
    on.media.map((asset) => asset.id).sort(),
    [MEDIA.logoOn, MEDIA.photoOn, MEDIA.avatarOn].sort(),
    'у включённой визитки пропала фотография или аватар — на живой странице битые картинки',
  );
  assert.equal(on.specialists.length, 1, 'у включённой визитки пропал опубликованный специалист');
  assert.equal(on.services.length, 1, 'у включённой визитки пропала услуга');
  assert.equal(on.locations.length, 1, 'у включённой визитки пропал адрес филиала');
});
