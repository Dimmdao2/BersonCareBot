/**
 * Живое доказательство #926 §17.A на именованной DEV-базе. Opt-in: без
 * `RUN_CLINIC_PUBLIC_CARD_BRANCHES_DB=1` файл пропускается, в CI в базу не ходит.
 *
 * Какие две поломки здесь убиты — обе дорогие и обе молчаливые, ни одну не видно ни сборкой,
 * ни юнит-тестом, потому что обе живут в теле SECURITY DEFINER-функции:
 *
 *   1. Адрес на визитке протухает. До 11.09 `app.read_public_clinic_card` отдавала снимок
 *      `locations_json`, пересчитываемый ТОЛЬКО когда клиника сохраняла форму карточки. Клиника
 *      переехала, закрыла или открыла филиал — посетитель видел старое и ехал к запертой двери;
 *      замерено на TEST: три активных филиала при `locations_json = []`. Возврат к снимку (или
 *      потеря фильтра `is_active`) выглядит как исправная страница, поэтому ловится только так:
 *      правим филиал, форму НЕ сохраняем, читаем визитку.
 *   2. На визитке клиники появляются филиалы ЧУЖОЙ организации. Замерено на DEV 11.09: RLS этой
 *      стены НЕ держит — политики `rev10_seam_business_28` и `rev10_named_root_owner_gate_28`
 *      пускают владельца шва ко ВСЕМ строкам `be_branches` (проверка «шов видит чужой филиал»
 *      ниже — самотест этого гейта). Единственная стена — предикат `branch.organization_id =
 *      entry.organization_id` в теле функции; исчезнет он — база промолчит, а на публичной
 *      странице окажутся чужие адреса.
 *
 * Оракул — указание владельца 19.08 («визитку с описанием») и план
 * `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §3.2/§17.2 п. 17.A: визитка
 * показывает то, что у клиники есть на самом деле, и только её собственное.
 *
 * Механика та же, что у соседних доказательств дверей: контекст порта ставится строкой в
 * `app_ext.accepted_port_contexts` от имени администратора (`app.begin_port_context` выдан только
 * mTLS-логинам, а доказывать надо правило двери, а не сертификаты), чтение идёт настоящей
 * анонимной ролью `app_pre_session`, вся работа — в транзакции, которая кончается ROLLBACK.
 *
 * Запуск (ведущий, на боксе):
 *   RUN_CLINIC_PUBLIC_CARD_BRANCHES_DB=1 node --test \
 *     deploy/postgres/privileges/clinic-public-card-live-branches.devDbProof.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ENABLED = process.env.RUN_CLINIC_PUBLIC_CARD_BRANCHES_DB === '1';
const DATABASE = process.env.CLINIC_PUBLIC_CARD_BRANCHES_DB ?? 'bcb_webapp_dev';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

const FOREIGN_ORG = 'b0000000-0000-4000-8000-0000009260ff';
const FOREIGN_BRANCH_TITLE = 'ФИЛИАЛ ЧУЖОЙ КЛИНИКИ #926';

function psql(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/** Опубликованная клиника DEV, у которой есть хотя бы два активных филиала. */
function publishedClinic() {
  const row = psql(`
SELECT e.organization_id || '|' || c.slug
  FROM public.clinic_public_directory_entries e
  JOIN public.organization_slug_claims c
    ON c.organization_id = e.organization_id AND c.kind = 'current'
  JOIN public.be_organizations o ON o.id = e.organization_id AND o.is_active
 WHERE e.is_published AND e.card_is_published
   AND (SELECT count(*) FROM public.be_branches b
         WHERE b.organization_id = e.organization_id AND b.is_active) >= 2
 ORDER BY c.slug
 LIMIT 1;`);
  assert.notEqual(row, '', 'DEV-база не содержит опубликованной клиники с двумя активными филиалами');
  const [organizationId, slug] = row.split('|');
  assert.match(slug, /^[a-z0-9-]+$/u);
  return { organizationId, slug };
}

/**
 * Принятый контекст под ровно тот аргумент, с которым дверь будет позвана. Заявка способности
 * пересъёмкается с объявленной строки и отличается только логином: контекст здесь ставит
 * администратор, а `app.require_accepted_context` связывает принятую строку по `session_login`.
 */
function acceptedContext(slug) {
  return `
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
SELECT '00000000-0000-4000-8000-00000000926a'::uuid, c.port, session_user,
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
         ARRAY[ROW('text@1', pg_catalog.textsend('${slug}'))::app.port_typed_arg])
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database()
   AND c.capability_id = '00000000-0000-4000-8000-00000000926a'::uuid
 LIMIT 1;`;
}

/** Чтение визитки настоящей анонимной ролью, как это делает публичная страница. */
function readCard(slug) {
  return `
SET LOCAL ROLE app_pre_session;
DO $card$ BEGIN PERFORM set_config('bcb.card_926',
  COALESCE((app.read_public_clinic_card('${slug}') -> 'locations')::text, '<null>'), false); END $card$;
RESET ROLE;`;
}

test('визитка показывает филиалы клиники в момент чтения, а не снимок прошлого сохранения формы', { skip: !ENABLED }, () => {
  const { organizationId, slug } = publishedClinic();
  const out = psql(`
BEGIN;
${acceptedContext(slug)}
${readCard(slug)}
DO $keep$ BEGIN PERFORM set_config('bcb.before_926', current_setting('bcb.card_926'), false); END $keep$;

-- Ровно то, что клиника делает у себя в кабинете: переехала, закрыла один филиал, открыла новый.
-- Форму публичной карточки при этом НИКТО не сохраняет — в этом вся поломка.
UPDATE public.be_branches SET title = 'ПЕРЕЕХАЛИ #926', address = 'ул. Свежая, 1'
 WHERE id = (SELECT id FROM public.be_branches
              WHERE organization_id = '${organizationId}'::uuid AND is_active
              ORDER BY sort_order, title LIMIT 1);
UPDATE public.be_branches SET is_active = false
 WHERE id = (SELECT id FROM public.be_branches
              WHERE organization_id = '${organizationId}'::uuid AND is_active
              ORDER BY sort_order DESC, title DESC LIMIT 1);
INSERT INTO public.be_branches (organization_id, title, city_code, address, sort_order)
VALUES ('${organizationId}'::uuid, 'ОТКРЫЛИ #926', 'msk', 'ул. Новая, 7', 99);

${readCard(slug)}
SELECT current_setting('bcb.before_926') || E'\\n@@\\n' || current_setting('bcb.card_926')
    || E'\\n@@\\n' || (SELECT locations_json::text FROM public.clinic_public_directory_entries
                        WHERE organization_id = '${organizationId}'::uuid);
ROLLBACK;`);
  const [before, after, snapshot] = out.split('\n@@\n');

  const closedTitle = JSON.parse(before).at(-1).title;
  assert.ok(closedTitle, 'фикстура: у клиники должен быть филиал, который мы закрываем');

  // Переезд и открытие видны немедленно, закрытый филиал со страницы исчез.
  assert.match(after, /ПЕРЕЕХАЛИ #926/u);
  assert.match(after, /ул. Свежая, 1/u);
  assert.match(after, /ОТКРЫЛИ #926/u);
  assert.equal(after.includes(closedTitle), false, 'закрытый филиал остался на визитке');

  // И доказательство, что источник — живые филиалы, а не снимок: снимок не менялся вовсе.
  assert.equal(snapshot, before, 'снимок locations_json изменился — значит читали не филиалы');
});

test('филиал чужой организации на визитку клиники не попадает', { skip: !ENABLED }, () => {
  const { slug } = publishedClinic();
  const out = psql(`
BEGIN;
${acceptedContext(slug)}
-- Триггер засева справочника падает на пустом reference_catalog_baselines DEV — это посторонняя
-- дыра в данных, а не предмет проверки; фикстура ставится в обход триггеров, транзакция всё равно
-- откатывается.
SET LOCAL session_replication_role = replica;
INSERT INTO public.be_organizations (id, title) VALUES ('${FOREIGN_ORG}'::uuid, 'ЧУЖАЯ КЛИНИКА #926');
INSERT INTO public.be_branches (organization_id, title, city_code, address)
VALUES ('${FOREIGN_ORG}'::uuid, '${FOREIGN_BRANCH_TITLE}', 'spb', 'чужой адрес');
SET LOCAL session_replication_role = origin;

${readCard(slug)}
-- Самотест гейта: если чужую строку не видит и сам шов, тест выше зеленел бы независимо от
-- предиката организации, то есть не проверял бы ничего.
SET LOCAL ROLE app_seam_public_clinic_card_owner;
DO $seam$ BEGIN PERFORM set_config('bcb.seam_926',
  (SELECT count(*)::text FROM public.be_branches WHERE organization_id = '${FOREIGN_ORG}'::uuid), false); END $seam$;
RESET ROLE;
SELECT current_setting('bcb.card_926') || E'\\n@@\\n' || current_setting('bcb.seam_926');
ROLLBACK;`);
  const [card, seamSeesForeign] = out.split('\n@@\n');

  assert.equal(seamSeesForeign, '1', 'самотест: владелец шва обязан дотягиваться до чужой строки');
  assert.equal(card.includes(FOREIGN_BRANCH_TITLE), false, 'чужой филиал попал на публичную визитку');
});
