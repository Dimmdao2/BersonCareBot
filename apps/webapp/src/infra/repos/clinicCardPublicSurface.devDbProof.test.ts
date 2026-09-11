/**
 * Живое доказательство против НАСТОЯЩЕЙ базы, opt-in (в CI не идёт). #926 §17.B и §17.H.
 *
 * Здесь проверяются ДВА свойства публичной двери визитки, и оба нельзя увидеть выше по стеку:
 * маршрутный тест `clinicCardMedia.route.test.ts` подменяет карточку целиком, то есть проверяет,
 * что маршрут отдаёт только члена набора, — но НЕ то, кто в этот набор попадает; а сцепка §17.M
 * сравнивает две копии правила между собой внутри ОДНОЙ организации.
 *
 * 1. **Состав набора медиа И ЕСТЬ авторизация анонимной отдачи** (план §3.5, §17.H граница 1).
 *    Файл, на который ссылается опубликованное полное описание клиники, обязан попасть в набор —
 *    иначе картинка внутри материала не откроется анониму. И наоборот: файл ЧУЖОЙ организации и
 *    файл, загрузка которого не завершена, в набор попасть НЕ должны — попавший туда файл
 *    становится анонимно скачиваемым по адресу этой клиники, и никакой проверки ниже уже нет.
 *    Текст описания правит сама клиника, поэтому подстановка чужого `uuid` — не гипотеза.
 * 2. **Стена между арендаторами на услугах и правило «что публикуется — решает клиника»**
 *    (§17.B). Услуга чужой организации на визитке — межарендаторская утечка; неактивная, снятая
 *    с публичного виджета и «только для администратора» — обещание посетителю, которого он не
 *    найдёт. Тот же класс, что 17.K на филиалах: стена живёт в предикате тела двери, FORCE RLS
 *    backstop по организации не даёт, и держит её только поведенческая проверка.
 *
 * Оракул — не реализация: требования плана владельца, перечисленные выше. Ожидания не скопированы
 * ни из SQL двери, ни из её ответа.
 *
 * Механика та же, что у соседних живых доказательств: фикстура двух организаций, принятый контекст
 * порта и чтение НАСТОЯЩЕЙ анонимной ролью `app_pre_session` внутри ОДНОЙ транзакции, которая
 * кончается `ROLLBACK`. Постоянных следов на DEV не остаётся.
 *
 * Запуск:
 *   RUN_CLINIC_CARD_PUBLIC_SURFACE_DB=1 \
 *   pnpm exec vitest run src/infra/repos/clinicCardPublicSurface.devDbProof.test.ts
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const ENABLED = process.env.RUN_CLINIC_CARD_PUBLIC_SURFACE_DB === '1';
const DATABASE = process.env.CLINIC_CARD_PUBLIC_SURFACE_DB ?? 'bcb_webapp_dev';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) throw new Error(`unsafe database '${DATABASE}'`);

const OWN_ORG = '926e0000-0000-4000-8000-00000000000a';
const FOREIGN_ORG = '926e0000-0000-4000-8000-00000000000b';
const OWN_SLUG = 'door926e-own';
const FOREIGN_SLUG = 'door926e-foreign';
const CAPABILITY = '00000000-0000-4000-8000-00000000926e';

/** Готовый файл своей организации — на него ссылается опубликованное описание. */
const OWN_READY = '926e0000-0000-4000-8000-0000000000f1';
/** Файл своей организации, загрузка которого не завершена. */
const OWN_PENDING = '926e0000-0000-4000-8000-0000000000f2';
/** Готовый файл ЧУЖОЙ организации: его `uuid` вписан в описание нашей клиники. */
const FOREIGN_READY = '926e0000-0000-4000-8000-0000000000f3';

/**
 * Описание намеренно ссылается на все три файла сразу: на свой готовый, на свой недогруженный и на
 * чужой. Если бы в тексте был только «правильный» файл, проверка зеленела бы, ничего не отсекая.
 */
const MARKDOWN = [
  `![своё](/api/media/${OWN_READY})`,
  `![неготовое](/api/media/${OWN_PENDING})`,
  `![чужое](/api/media/${FOREIGN_READY})`,
].join('\\n\\n');

const FIXTURE = `
SET LOCAL session_replication_role = replica;
INSERT INTO public.be_organizations (id, title) VALUES
  ('${OWN_ORG}'::uuid, 'DOOR926E своя'),
  ('${FOREIGN_ORG}'::uuid, 'DOOR926E чужая');
SET LOCAL session_replication_role = origin;

INSERT INTO public.organization_slug_claims (slug, kind, organization_id) VALUES
  ('${OWN_SLUG}', 'current', '${OWN_ORG}'::uuid),
  ('${FOREIGN_SLUG}', 'current', '${FOREIGN_ORG}'::uuid);

INSERT INTO public.media_files
  (id, owner_kind, organization_id, original_name, stored_path, mime_type, size_bytes,
   storage_target, status) VALUES
  ('${OWN_READY}'::uuid,    'organization','${OWN_ORG}'::uuid,    'ready.png',  'p/ready.png',  'image/png',10,'library','ready'),
  ('${OWN_PENDING}'::uuid,  'organization','${OWN_ORG}'::uuid,    'pending.png','p/pending.png','image/png',10,'library','pending'),
  ('${FOREIGN_READY}'::uuid,'organization','${FOREIGN_ORG}'::uuid,'foreign.png','p/foreign.png','image/png',10,'library','ready');

INSERT INTO public.clinic_public_directory_entries
  (organization_id, slug, display_name, is_published, card_is_published, full_description_markdown)
VALUES
  ('${OWN_ORG}'::uuid, '${OWN_SLUG}', 'DOOR926E своя', true, true, E'${MARKDOWN}'),
  ('${FOREIGN_ORG}'::uuid, '${FOREIGN_SLUG}', 'DOOR926E чужая', true, true, NULL);

INSERT INTO public.be_clinic_services
  (organization_id, title, duration_minutes, price_minor, is_active, public_widget_visible,
   admin_manual_only, sort_order) VALUES
  ('${OWN_ORG}'::uuid,    'Видимая',      30,100000, true,  true,  false, 10),
  ('${OWN_ORG}'::uuid,    'Скрытая',      30,100000, true,  false, false, 20),
  ('${OWN_ORG}'::uuid,    'Ручная',       30,100000, true,  true,  true,  30),
  ('${OWN_ORG}'::uuid,    'Неактивная',   30,100000, false, true,  false, 40),
  ('${FOREIGN_ORG}'::uuid,'Чужая услуга', 30,100000, true,  true,  false, 10);

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
       app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend('${OWN_SLUG}'))::app.port_typed_arg])
  FROM pg_database d, app_ext.port_context_capabilities c
 WHERE d.datname = current_database() AND c.capability_id = '${CAPABILITY}'::uuid
 LIMIT 1;`;

type Card = {
  media: { id: string; role: string }[];
  services: Record<string, unknown>[];
};

function readCardAsAnonymous(): Card {
  const out = execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q', '-h', '/var/run/postgresql',
      '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    {
      input: `BEGIN;
${FIXTURE}
SET LOCAL ROLE app_pre_session;
DO $c$ BEGIN PERFORM set_config('bcb.card_926e',
  COALESCE(app.read_public_clinic_card('${OWN_SLUG}')::text, '<null>'), false); END $c$;
RESET ROLE;
SELECT current_setting('bcb.card_926e');
ROLLBACK;`,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  ).trim();
  // Пустая карточка прошла бы обе проверки «чужого здесь нет», ничего не доказав.
  expect(out, 'фикстура: опубликованная визитка обязана прочитаться').not.toBe('<null>');
  return JSON.parse(out) as Card;
}

describe.skipIf(!ENABLED)('публичная дверь визитки: что она выпускает наружу (§17.B, §17.H)', () => {
  it('в набор медиа входит файл описания клиники — и только свой готовый', () => {
    const { media } = readCardAsAnonymous();
    const ids = media.map((asset) => asset.id.toLowerCase());

    // Есть: иначе картинка опубликованного материала не откроется анониму — визитка битая.
    expect(ids).toContain(OWN_READY);
    expect(media.find((asset) => asset.id.toLowerCase() === OWN_READY)?.role).toBe(
      'clinicDescription',
    );

    // Нет: набор — единственное, что авторизует анонимную отдачу. Чужой файл в нём означает, что
    // его скачает кто угодно по адресу ЭТОЙ клиники, вписавшей чужой uuid в свой текст.
    expect(ids).not.toContain(FOREIGN_READY);
    // Нет: незавершённая загрузка отдалась бы битым файлом вместо места под него.
    expect(ids).not.toContain(OWN_PENDING);
  });

  it('наружу выходит только услуга, которую клиника опубликовала, и только своя', () => {
    const { services } = readCardAsAnonymous();
    const titles = services.map((service) => service.title);

    expect(titles).toEqual(['Видимая']);
    // Названо отдельно от equal выше: именно это утверждение отличает утечку между арендаторами
    // от обычной ошибки отбора, и в тексте падения оно должно быть видно словами.
    expect(titles, 'услуга чужой организации на визитке — утечка между арендаторами').not.toContain(
      'Чужая услуга',
    );

    // §3.2: ни одного внутреннего идентификатора в публичной проекции. Проверяется по ЗНАЧЕНИЯМ, а
    // не по имени ключа: uuid под любым именем — тот же утёкший идентификатор.
    const leaked = services.flatMap((service) =>
      Object.entries(service).filter(([, value]) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value)),
      ),
    );
    expect(leaked).toEqual([]);
  });
});
