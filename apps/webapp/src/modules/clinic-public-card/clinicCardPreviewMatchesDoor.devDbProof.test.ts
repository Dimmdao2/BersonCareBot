/**
 * СЦЕПКА двух копий правила «что показывать на визитке» (#926 §17.M), живая DEV-база, opt-in.
 *
 * Почему копий две и почему их нельзя свести в одну. Публичная дверь
 * `app.read_public_clinic_card(text)` отбирает и сортирует в SQL — там копия является ЗАЩИТОЙ.
 * Предпросмотр в кабинете отбирает в TS (`cabinetPreviewSelection`) — и он нужен ИМЕННО ТОГДА,
 * когда визитка выключена, а дверь в этот момент по построению возвращает `null` и источником
 * быть не может. Решение ведущего 11.09: структуру не трогаем, ставим одну сцепку.
 *
 * **Оракул — не реализация, а требование:** владелец видит в предпросмотре ровно то же, что
 * посетитель видит на странице. Поэтому здесь сравнивается не «дверь делает то, что написано в
 * двери», а два независимо написанных отбора между собой НА ОДНИХ И ТЕХ ЖЕ ДАННЫХ. Поправят одну
 * сторону — покраснеет; ни компилятор, ни типы, ни один тест с подставным репозиторием такого
 * расхождения не видят, а на экране оно выглядит как исправная страница с другим содержимым.
 *
 * Накрыты ВСЕ ТРИ списка, у которых правило записано дважды: специалисты (исходная находка §17.M),
 * УСЛУГИ (третья копия, появилась вместе с этапом 2b) и адреса филиалов (тот же класс, найден при
 * написании этой сцепки — кабинет сортировал `localeCompare`, а дверь сортирует в коллации базы
 * `C.UTF-8`, то есть при разном регистре порядок расходился молча).
 *
 * Механика — та же, что у соседних живых доказательств визитки: фикстура, принятый контекст порта
 * и чтение НАСТОЯЩЕЙ анонимной ролью `app_pre_session` внутри ОДНОЙ транзакции, которая кончается
 * ROLLBACK. Постоянных следов на DEV не остаётся. Строки каталога для кабинетной стороны читаются
 * из той же транзакции: `listSpecialists`/`listServices`/`listBranches` отдают строки организации
 * целиком, отбора в них нет — весь отбор живёт в проверяемых функциях.
 *
 * Запуск:
 *   RUN_CLINIC_CARD_PREVIEW_COUPLING_DB=1 \
 *   pnpm exec vitest run src/modules/clinic-public-card/clinicCardPreviewMatchesDoor.devDbProof.test.ts
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  selectCardLocationsForPreview,
  selectCardServicesForPreview,
  selectCardSpecialistsForPreview,
  type PreviewBranchRow,
  type PreviewServiceRow,
  type PreviewSpecialistRow,
} from './cabinetPreviewSelection';

const ENABLED = process.env.RUN_CLINIC_CARD_PREVIEW_COUPLING_DB === '1';
const DATABASE = process.env.CLINIC_CARD_PREVIEW_COUPLING_DB ?? 'bcb_webapp_dev';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) throw new Error(`unsafe database '${DATABASE}'`);

const ORG = '926c0000-0000-4000-8000-00000000000a';
const SLUG = 'coupling926-own';
const CAPABILITY = '00000000-0000-4000-8000-00000000926d';

/**
 * Фикстура нарочно неудобная: на КАЖДОМ списке есть ничья по `sort_order`, разный регистр и
 * латиница рядом с кириллицей. Ровно на таких строках две сортировки и расходятся — на данных,
 * где порядок задан только `sort_order`, сцепка зеленела бы, ничего не проверяя.
 */
const FIXTURE = `
SET LOCAL session_replication_role = replica;
INSERT INTO public.be_organizations (id, title) VALUES ('${ORG}'::uuid, 'COUPLING926 Клиника');
SET LOCAL session_replication_role = origin;

INSERT INTO public.organization_slug_claims (slug, kind, organization_id)
VALUES ('${SLUG}', 'current', '${ORG}'::uuid);

INSERT INTO public.clinic_public_directory_entries
  (organization_id, slug, display_name, is_published, card_is_published)
VALUES ('${ORG}'::uuid, '${SLUG}', 'COUPLING926 Клиника', true, true);

INSERT INTO public.be_specialists
  (organization_id, full_name, description, is_active, card_is_published, sort_order) VALUES
  ('${ORG}'::uuid, 'Zoe Latin',  'строка', true,  true,  10),
  ('${ORG}'::uuid, 'анна нижний','строка', true,  true,  10),
  ('${ORG}'::uuid, 'Анна Верх',  'строка', true,  true,  10),
  ('${ORG}'::uuid, 'Не опубликован', null, true,  false, 5),
  ('${ORG}'::uuid, 'Не активен',     null, false, true,  5);

INSERT INTO public.be_clinic_services
  (organization_id, title, description, duration_minutes, price_minor, is_active,
   public_widget_visible, admin_manual_only, sort_order) VALUES
  ('${ORG}'::uuid, 'Zoe услуга',   null,     30, 100000, true,  true,  false, 10),
  ('${ORG}'::uuid, 'массаж',       'описание',40, 200000, true,  true,  false, 10),
  ('${ORG}'::uuid, 'Массаж Верх',  null,     40, 0,      true,  true,  false, 10),
  ('${ORG}'::uuid, 'Неактивная',   null,     40, 200000, false, true,  false, 5),
  ('${ORG}'::uuid, 'Не в виджете', null,     40, 200000, true,  false, false, 5),
  ('${ORG}'::uuid, 'Ручная',       null,     40, 200000, true,  true,  true,  5);

INSERT INTO public.be_branches
  (organization_id, title, city_code, address, timezone, is_active, sort_order) VALUES
  ('${ORG}'::uuid, 'Zoe филиал',  'moscow', 'адрес 1', 'Europe/Moscow', true,  10),
  ('${ORG}'::uuid, 'центр',       'moscow', 'адрес 2', 'Europe/Moscow', true,  10),
  ('${ORG}'::uuid, 'Центр Верх',  'moscow', 'адрес 3', 'Europe/Moscow', true,  10),
  ('${ORG}'::uuid, 'Закрытый',    'moscow', 'адрес 4', 'Europe/Moscow', false, 5);

INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
SELECT '${CAPABILITY}'::uuid, c.port, session_user, c.target_role, c.context_class, c.purpose,
       c.function_identity
  FROM app_ext.port_context_capabilities c
 WHERE c.purpose = 'clinic.public-card.read'
   AND c.function_identity = 'app.read_public_clinic_card(text)'::regprocedure
 LIMIT 1;
INSERT INTO app_ext.accepted_port_contexts (
  database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
  context_class, purpose, function_identity, typed_args_hash)
SELECT d.oid, pg_backend_pid(), pg_current_xact_id(), c.capability_id, c.session_login,
       c.port, c.target_role, c.context_class, c.purpose, c.function_identity,
       app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend('${SLUG}'))::app.port_typed_arg])
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database() AND c.capability_id = '${CAPABILITY}'::uuid
 LIMIT 1;`;

/** Строки организации целиком — то, что кабинетный каталог отдаёт странице настроек без отбора. */
const CABINET_ROWS = `
SELECT jsonb_build_object(
  'specialists', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'id', s.id, 'fullName', s.full_name, 'description', s.description,
       'avatarMediaId', s.avatar_media_id, 'isActive', s.is_active,
       'cardIsPublished', s.card_is_published, 'sortOrder', s.sort_order)), '[]'::jsonb)
     FROM public.be_specialists s WHERE s.organization_id = '${ORG}'::uuid),
  'services', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'title', v.title, 'description', v.description, 'durationMinutes', v.duration_minutes,
       'priceMinor', v.price_minor, 'isActive', v.is_active,
       'publicWidgetVisible', v.public_widget_visible, 'adminManualOnly', v.admin_manual_only,
       'sortOrder', v.sort_order)), '[]'::jsonb)
     FROM public.be_clinic_services v WHERE v.organization_id = '${ORG}'::uuid),
  'branches', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'title', b.title, 'cityCode', b.city_code, 'address', b.address, 'isActive', b.is_active,
       'sortOrder', b.sort_order)), '[]'::jsonb)
     FROM public.be_branches b WHERE b.organization_id = '${ORG}'::uuid))::text`;

type DoorCard = {
  specialists: { id: string; fullName: string; shortDescription: string | null; avatarMediaId: string | null }[];
  services: { title: string; description: string | null; durationMinutes: number; priceMinor: number }[];
  locations: { title: string; cityCode: string | null; address: string | null }[];
};

type CabinetRows = {
  specialists: PreviewSpecialistRow[];
  services: PreviewServiceRow[];
  branches: PreviewBranchRow[];
};

function readBothSides(): { door: DoorCard; cabinet: CabinetRows } {
  const out = execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q', '-h', '/var/run/postgresql',
      '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    {
      input: `BEGIN;
${FIXTURE}
SET LOCAL ROLE app_pre_session;
DO $c$ BEGIN PERFORM set_config('bcb.door_926d',
  COALESCE(app.read_public_clinic_card('${SLUG}')::text, '<null>'), false); END $c$;
RESET ROLE;
DO $r$ BEGIN PERFORM set_config('bcb.rows_926d', (${CABINET_ROWS}), false); END $r$;
SELECT current_setting('bcb.door_926d') || E'\\n@@\\n' || current_setting('bcb.rows_926d');
ROLLBACK;`,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  ).trim();
  const [door, rows] = out.split('\n@@\n');
  // Пустая дверь сравнялась бы с пустым предпросмотром и зеленела, ничего не проверив.
  expect(door, 'фикстура: опубликованная визитка обязана прочитаться').not.toBe('<null>');
  return { door: JSON.parse(door!) as DoorCard, cabinet: JSON.parse(rows!) as CabinetRows };
}

describe.skipIf(!ENABLED)('визитка: кабинет показывает ровно то же, что посетитель (§17.M)', () => {
  it('специалисты, услуги и адреса совпадают множеством И порядком', () => {
    const { door, cabinet } = readBothSides();

    // Самотест фикстуры: если бы дверь возвращала пусто, все три сравнения ниже прошли бы.
    expect(door.specialists.length).toBe(3);
    expect(door.services.length).toBe(3);
    expect(door.locations.length).toBe(3);

    expect(selectCardSpecialistsForPreview(cabinet.specialists)).toEqual(
      door.specialists.map((person) => ({
        id: person.id,
        fullName: person.fullName,
        shortDescription: person.shortDescription,
        avatarMediaId: person.avatarMediaId,
      })),
    );
    expect(selectCardServicesForPreview(cabinet.services)).toEqual(door.services);
    expect(selectCardLocationsForPreview(cabinet.branches)).toEqual(door.locations);
  });
});
