/**
 * Живое доказательство #926 §17.G/§17.B(специалисты)/§17.H на именованной DEV-базе. Opt-in: без
 * `RUN_CLINIC_PUBLIC_CARD_SPECIALISTS_DB=1` файл пропускается, в CI в базу не ходит.
 *
 * Здесь убиты ДВА независимых класса поломки. Оба живут в теле SECURITY DEFINER-функции
 * `app.read_public_clinic_card(text)`, поэтому их не видит ни сборка, ни типы, ни один тест с
 * подставным репозиторием: подставной репозиторий возвращает то, что ему велел автор теста, а
 * предмет проверки — то, что возвращает НАСТОЯЩАЯ дверь настоящей анонимной роли.
 *
 *   1. **Наружу выходит человек, которого клиника не публиковала.** Решение владельца 11.09
 *      (план §17.G): «что именно публикуется — решает клиника, а не платформа», «неактивный или
 *      удалённый специалист даёт тот же отказ, что и выключенная визитка». ФИО сотрудника —
 *      персональные данные. Потеряй дверь `card_is_published` или `is_active` — визитка и страница
 *      специалиста продолжат отвечать 200 и выглядеть исправными, просто на них появятся люди,
 *      которых клиника наружу не отдавала. Отказ дорогой и абсолютно молчаливый.
 *
 *   2. **В набор медиа попадает файл, которого клиника не публиковала.** Набор, который вернула
 *      дверь, И ЕСТЬ авторизация анонимной отдачи `/{clinic}/media/{uuid}` (план §3.5): маршрут
 *      отдаёт ровно то, что в наборе лежит, и больше ничего не проверяет — проверять нечем и
 *      незачем, в этом вся конструкция. Значит цена ошибки целиком перенесена в СОСТАВ набора.
 *      Лишний id в наборе — это файл организации (или, того хуже, чужой организации), выданный
 *      анониму по прямой ссылке. На экране при этом не меняется ничего.
 *
 * Оракул независим от реализации: решение владельца 11.09, записанное дословно в
 * `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §17.G и §17.H, и требование §3.5
 * «снимок публичного медиа отдаётся анониму, а любой другой файл той же клиники — нет».
 *
 * Чего здесь НЕТ намеренно. Отказ страницы специалиста (`/{clinic}/specialist/{id}` → тот же 404,
 * что у выключенной визитки) отдельно не проверяется: `readPublicSpecialist` ищет человека В УЖЕ
 * ПРОЧИТАННОМ ответе этой самой двери и второго запроса не делает, поэтому «его нет в ответе» и
 * «страница отказала» — одно и то же утверждение, а не два. Проверять второй раз тот же предикат
 * через подставной порт значило бы проверить `Array.prototype.find`.
 *
 * Механика та же, что у соседнего `clinic-public-card-live-branches.devDbProof.test.mjs`: контекст
 * порта ставится строкой в `app_ext.accepted_port_contexts` от имени администратора
 * (`app.begin_port_context` выдан только mTLS-логинам, а доказывать надо правило двери, а не
 * сертификаты), чтение идёт настоящей анонимной ролью `app_pre_session`, вся работа — в одной
 * транзакции, которая кончается ROLLBACK. Постоянных следов на DEV не остаётся.
 *
 * Запуск (ведущий, на боксе):
 *   RUN_CLINIC_PUBLIC_CARD_SPECIALISTS_DB=1 node --test \
 *     deploy/postgres/privileges/clinic-public-card-specialists.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_CLINIC_PUBLIC_CARD_SPECIALISTS_DB === '1';
const DATABASE = process.env.CLINIC_PUBLIC_CARD_SPECIALISTS_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const OWN_ORG = '926a0000-0000-4000-8000-00000000000a';
const FOREIGN_ORG = '926a0000-0000-4000-8000-00000000000b';
const OWN_SLUG = 'audit926-own';

/** Файлы фикстуры. Публичными обязаны стать РОВНО два первых. */
const MEDIA = {
  avatarOfPublished: '926a1111-0000-4000-8000-000000000001',
  embeddedInPublished: '926a1111-0000-4000-8000-000000000005',
  avatarOfUnpublished: '926a1111-0000-4000-8000-000000000002',
  embeddedInUnpublished: '926a1111-0000-4000-8000-000000000006',
  avatarOfInactive: '926a1111-0000-4000-8000-000000000003',
  neverReferenced: '926a1111-0000-4000-8000-000000000004',
  embeddedButNotReady: '926a1111-0000-4000-8000-000000000007',
  foreignOrganization: '926a2222-0000-4000-8000-000000000001',
};

const PUBLISHED = 'AUDIT926 Опубликованный';
const UNPUBLISHED = 'AUDIT926 Неопубликованный';
const INACTIVE = 'AUDIT926 Неактивный';
const FOREIGN_PERSON = 'AUDIT926 Чужой специалист';
const FOREIGN_AVATAR_PERSON = 'AUDIT926 Аватар чужой';

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/**
 * Фикстура целиком внутри транзакции. Триггер засева справочника падает на пустом
 * `reference_catalog_baselines` DEV (посторонняя дыра в данных, см. 17.L, не предмет проверки),
 * поэтому организации ставятся в обход триггеров; транзакция всё равно откатывается.
 */
const FIXTURE = `
SET LOCAL session_replication_role = replica;
INSERT INTO public.be_organizations (id, title) VALUES
  ('${OWN_ORG}'::uuid, 'AUDIT926 Своя клиника'),
  ('${FOREIGN_ORG}'::uuid, 'AUDIT926 Чужая клиника');
SET LOCAL session_replication_role = origin;

INSERT INTO public.organization_slug_claims (slug, kind, organization_id) VALUES
  ('${OWN_SLUG}', 'current', '${OWN_ORG}'::uuid),
  ('audit926-foreign', 'current', '${FOREIGN_ORG}'::uuid);

INSERT INTO public.clinic_public_directory_entries
  (organization_id, slug, display_name, is_published, card_is_published) VALUES
  ('${OWN_ORG}'::uuid, '${OWN_SLUG}', 'AUDIT926 Своя клиника', true, true),
  ('${FOREIGN_ORG}'::uuid, 'audit926-foreign', 'AUDIT926 Чужая клиника', true, true);

INSERT INTO public.media_files
  (id, original_name, stored_path, mime_type, size_bytes, status, owner_kind, organization_id,
   storage_target, s3_key) VALUES
  ('${MEDIA.avatarOfPublished}'::uuid,   'a.png', 'audit926/a.png', 'image/png', 10, 'ready',          'organization', '${OWN_ORG}'::uuid,     'library', 'audit926/a.png'),
  ('${MEDIA.avatarOfUnpublished}'::uuid, 'b.png', 'audit926/b.png', 'image/png', 10, 'ready',          'organization', '${OWN_ORG}'::uuid,     'library', 'audit926/b.png'),
  ('${MEDIA.avatarOfInactive}'::uuid,    'c.png', 'audit926/c.png', 'image/png', 10, 'ready',          'organization', '${OWN_ORG}'::uuid,     'library', 'audit926/c.png'),
  ('${MEDIA.neverReferenced}'::uuid,     'd.png', 'audit926/d.png', 'image/png', 10, 'ready',          'organization', '${OWN_ORG}'::uuid,     'library', 'audit926/d.png'),
  ('${MEDIA.embeddedInPublished}'::uuid, 'e.mp4', 'audit926/e.mp4', 'video/mp4', 10, 'ready',          'organization', '${OWN_ORG}'::uuid,     'library', 'audit926/e.mp4'),
  ('${MEDIA.embeddedButNotReady}'::uuid, 'f.png', 'audit926/f.png', 'image/png', 10, 'pending_delete', 'organization', '${OWN_ORG}'::uuid,     'library', 'audit926/f.png'),
  ('${MEDIA.embeddedInUnpublished}'::uuid,'h.png', 'audit926/h.png', 'image/png', 10, 'ready',          'organization', '${OWN_ORG}'::uuid,     'library', 'audit926/h.png'),
  ('${MEDIA.foreignOrganization}'::uuid, 'g.png', 'audit926/g.png', 'image/png', 10, 'ready',          'organization', '${FOREIGN_ORG}'::uuid, 'library', 'audit926/g.png');

INSERT INTO public.be_specialists
  (organization_id, full_name, description, is_active, card_is_published, avatar_media_id,
   full_description_markdown, sort_order) VALUES
  -- Единственный, кого клиника опубликовала. Его материал ссылается и на свой готовый файл, и на
  -- неготовый свой, и на ЧУЖОЙ — вписать чужой uuid в markdown может кто угодно с доступом к форме.
  ('${OWN_ORG}'::uuid, '${PUBLISHED}', 'короткая строка', true, true,
   '${MEDIA.avatarOfPublished}'::uuid,
   '[видео](/api/media/${MEDIA.embeddedInPublished}) ![чужое](/api/media/${MEDIA.foreignOrganization}) ![неготовое](/api/media/${MEDIA.embeddedButNotReady})', 10),
  -- У неопубликованного материал ЕСТЬ и ссылается на готовый свой файл: снимок публикации обязан
  -- убирать из набора и аватар, и всё, на что ссылается его описание.
  ('${OWN_ORG}'::uuid, '${UNPUBLISHED}', 'короткая строка', true, false,
   '${MEDIA.avatarOfUnpublished}'::uuid,
   '![скрытое](/api/media/${MEDIA.embeddedInUnpublished})', 20),
  ('${OWN_ORG}'::uuid, '${INACTIVE}', 'короткая строка', false, true,
   '${MEDIA.avatarOfInactive}'::uuid, null, 30),
  -- Опубликован и активен, но в аватар записан файл ЧУЖОЙ организации: валидации владения в момент
  -- ЗАПИСИ нет по решению исполнителя, стеной обязан быть предикат чтения.
  ('${OWN_ORG}'::uuid, '${FOREIGN_AVATAR_PERSON}', 'короткая строка', true, true,
   '${MEDIA.foreignOrganization}'::uuid, null, 40),
  ('${FOREIGN_ORG}'::uuid, '${FOREIGN_PERSON}', 'короткая строка', true, true,
   '${MEDIA.foreignOrganization}'::uuid, null, 10);
`;

/**
 * Принятый контекст под ровно тот аргумент, с которым дверь будет позвана. Заявка способности
 * пересъёмкается с объявленной строки и отличается только логином: контекст здесь ставит
 * администратор, а `app.require_accepted_context` связывает принятую строку по `session_login`.
 */
const ACCEPTED_CONTEXT = `
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
SELECT '00000000-0000-4000-8000-00000000926b'::uuid, c.port, session_user,
       c.target_role, c.context_class, c.purpose, c.function_identity
  FROM app_ext.port_context_capabilities c
 WHERE c.purpose = 'clinic.public-card.read'
   AND c.function_identity = 'app.read_public_clinic_card(text)'::regprocedure
 LIMIT 1;
INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, function_identity, typed_args_hash)
SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, c.session_login,
       c.port, c.target_role, c.context_class, c.purpose, c.function_identity,
       app.hash_port_typed_args(
         ARRAY[ROW('text@1', pg_catalog.textsend('${OWN_SLUG}'))::app.port_typed_arg])
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database()
   AND c.capability_id = '00000000-0000-4000-8000-00000000926b'::uuid
 LIMIT 1;`;

/** Чтение визитки настоящей анонимной ролью — ровно так её читает публичная страница. */
const READ_CARD = `
SET LOCAL ROLE app_pre_session;
DO $card$ BEGIN PERFORM set_config('bcb.card_926b',
  COALESCE(app.read_public_clinic_card('${OWN_SLUG}')::text, '<null>'), false); END $card$;
RESET ROLE;`;

/** Одно чтение двери + самотест гейта; всё в одной транзакции, которая откатывается. */
function readPublicCard() {
  const out = psql(`
BEGIN;
${FIXTURE}
${ACCEPTED_CONTEXT}
${READ_CARD}
-- Самотест: если бы владелец шва сам не дотягивался до неопубликованных, неактивных и чужих строк,
-- утверждения ниже зеленели бы независимо от предикатов двери, то есть не проверяли бы ничего.
SET LOCAL ROLE app_seam_public_clinic_card_owner;
DO $seam$ BEGIN PERFORM set_config('bcb.seam_926b',
  (SELECT count(*)::text FROM public.be_specialists
    WHERE full_name IN ('${UNPUBLISHED}', '${INACTIVE}', '${FOREIGN_PERSON}'))
  || '/' ||
  (SELECT count(*)::text FROM public.media_files
    WHERE id IN ('${MEDIA.neverReferenced}'::uuid, '${MEDIA.foreignOrganization}'::uuid,
                 '${MEDIA.embeddedInUnpublished}'::uuid)), false); END $seam$;
RESET ROLE;
SELECT current_setting('bcb.card_926b') || E'\\n@@\\n' || current_setting('bcb.seam_926b');
ROLLBACK;`);
  const [card, seam] = out.split('\n@@\n');
  assert.equal(seam, '3/3', 'самотест: владелец шва обязан видеть и скрытых людей, и неопубликованные файлы');
  assert.notEqual(card, '<null>', 'фикстура: опубликованная визитка обязана прочитаться');
  return JSON.parse(card);
}

test('наружу выходит только тот специалист, которого клиника опубликовала', { skip: !ENABLED }, () => {
  const names = readPublicCard().specialists.map((person) => person.fullName);

  assert.ok(names.includes(PUBLISHED), 'опубликованный и активный специалист обязан быть на визитке');
  assert.equal(names.includes(UNPUBLISHED), false, 'клиника не публиковала этого человека, а дверь его отдала');
  assert.equal(names.includes(INACTIVE), false, 'неактивный специалист остался на публичной визитке');
  assert.equal(names.includes(FOREIGN_PERSON), false, 'на визитке клиники оказался специалист ЧУЖОЙ организации');
});

test('в наборе медиа лежит только то, что клиника опубликовала — он и есть право на анонимную отдачу', { skip: !ENABLED }, () => {
  const card = readPublicCard();
  const ids = card.media.map((asset) => asset.id);
  const has = (id) => ids.includes(id);

  // Публичное — обязано быть, иначе на странице битые картинки вместо фотографий и видео.
  assert.ok(has(MEDIA.avatarOfPublished), 'аватар опубликованного специалиста не попал в набор');
  assert.ok(has(MEDIA.embeddedInPublished), 'файл, на который ссылается опубликованный материал, не попал в набор');

  // Всё остальное — файлы, выданные анониму по прямой ссылке, если оно здесь окажется.
  assert.equal(has(MEDIA.neverReferenced), false, 'файл организации, который она нигде не публиковала, попал в публичный набор');
  assert.equal(has(MEDIA.avatarOfUnpublished), false, 'аватар неопубликованного специалиста попал в публичный набор');
  assert.equal(has(MEDIA.embeddedInUnpublished), false, 'файл из описания НЕопубликованного специалиста попал в публичный набор');
  assert.equal(has(MEDIA.avatarOfInactive), false, 'аватар неактивного специалиста попал в публичный набор');
  assert.equal(has(MEDIA.embeddedButNotReady), false, 'неготовый файл попал в публичный набор');
  assert.equal(has(MEDIA.foreignOrganization), false, 'файл ЧУЖОЙ организации попал в публичный набор этой клиники');

  // Владение аватаром в момент ЗАПИСИ не проверяется — стеной обязан быть предикат чтения.
  const withForeignAvatar = card.specialists.find((person) => person.fullName === FOREIGN_AVATAR_PERSON);
  assert.ok(withForeignAvatar, 'фикстура: специалист с чужим аватаром опубликован и обязан быть на визитке');
  assert.equal(withForeignAvatar.avatarMediaId, null, 'дверь отдала аватаром файл ЧУЖОЙ организации');
});
