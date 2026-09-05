# `deploy/postgres/privileges/` — единая декларация прав БД

## Что является источником истины

[`declaration.ts`](./declaration.ts) — исполняемый источник DEV/TEST для:

- общих capability/seam-owner ролей;
- четырёх login на среду: webapp staff, patient, global admin и integrator;
- точных memberships, CONNECT и schema usage;
- ACL таблиц, колонок, последовательностей и функций;
- FORCE RLS и точных policy;
- transaction-bound port context и каталога допустимых вызовов.

`declaration.ts` — единственный файл, который человек правит руками для этих решений. `relation-access.ts` и
`function-census.ts` физически пусты: с #1069 (2026-09-05) обе бывшие независимые ручные карты
(`REV10_CLINICAL_ACCESS`, `BUSINESS_SEAM_FUNCTIONS` и её компаньоны) перенесены внутрь `declaration.ts`
(SECTION -1), а эти два файла остались только тонкими `export { X } from './declaration.ts'` — только чтобы не
ломать существующие импорты. Причина: до #1069 колоночные решения для 51 пересекающегося отношения жили
одновременно в `declaration.ts` и в `relation-access.ts`, объединялись `revision10RelationAccess` во время
генерации, и правка одного файла без второго не красила ничего — ровно так SaaS billing-period ship добавил
новые колонки в `declaration.ts`, не тронул `relation-access.ts`, и получил живой `42501` при первой же записи.

Обычный deploy/migrate после schema/data migrations запускает
[`reconcile-access.mjs`](./reconcile-access.mjs). Он одной транзакцией приводит target к декларации и затем
двусторонне проверяет каталог. Schema migrations не выдают и не отзывают права.

Верхняя часть `declaration.ts` хранит нейтральный инвентарь объектов, из которого Revision 10 строит текущую
модель. Исторические `revoke`, старые owner-gates, прежняя очередь `CODE_MUST_CHANGE`, старые login и роли в
исполняемый объект не переносятся. `zeroState.legacyRoles` пуст: DEV/TEST не сохраняют карантинные роли.

PROD не входит в текущий объект декларации. Его переход из старого снимка A в B0 — отдельная атомарная миграция
с rollback после явного разрешения владельца; DEV/TEST-конфигурацию нельзя молча выдать за PROD target.

## Колоночный `INSERT` выводится из схемы Drizzle, а не пишется руками

Drizzle перечисляет в `INSERT INTO t (...)` **каждую** колонку схемы: ключ, отсутствующий в `.values({...})`,
всё равно попадает в список со значением `DEFAULT`. Postgres требует колоночного `INSERT`-права на каждую
НАЗВАННУЮ колонку, включая `DEFAULT`, поэтому грант, написанный по «бизнес-колонкам», роняет весь стейтмент
через `42501` — так и ломалась продажа абонемента на `be_patient_package_items.id`.

Генератор при этом обязан остаться чистым Node-модулем: `drizzle-orm` не разрешается из корня репозитория, а
`apps/webapp/db/schema/*.ts` резолвится только бандлером. Поэтому метаданные приходят машинным закоммиченным
артефактом [`drizzle-insert-surface.ts`](./drizzle-insert-surface.ts) — «отношение → колонки, которые ORM
называет в `INSERT`» плюс каждый прямой `.insert()`-callsite в `apps/webapp/src`. Артефакт производит
workspace webapp:

```bash
pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-insert-surface.ts          # перегенерировать
pnpm run check:drizzle-insert-surface                                              # побайтный гейт
```

Побайтный гейт идёт первым шагом `pnpm run test:db-privileges`, поэтому правка схемы, не перегенерировавшая
артефакт, краснеет раньше любого privilege-теста.

`declaration.ts` читает артефакт как данные и расширяет **только** колоночный `INSERT` и **только** там, где
есть и прямой `.insert()`-callsite, и роль с webapp-возможностью `purpose: 'relation'`. Объявленные колонки
никогда не удаляются: отношения без Drizzle-модели (`public.broadcast_drafts`, `public.system_settings_audit`)
и `public.platform_users.session_epoch`, которой модель не знает, остаются как объявлены.

Приёмочный гейт [`drizzle-insert-grant-completeness.test.mjs`](./drizzle-insert-grant-completeness.test.mjs)
выводит обе стороны независимо — сам зовёт печать метаданных и сам разбирает callsites по AST — и сверяет их с
грантами, которые генератор реально пишет.

## Колоночный `UPDATE` сверяется с наблюдаемой Drizzle-поверхностью, а не выводится

В отличие от `INSERT`, Postgres не требует называть в `UPDATE` каждую колонку схемы — только те, что реально
пишет `.set({...})` — поэтому здесь нет аналога «DEFAULT-колонки», которую можно домыслить. Вместо
авто-расширения (как для `INSERT`) `declaration.ts` только **отказывает при загрузке**, если наблюдаемая запись
не покрыта НИКАКИМ объявленным грантом (#1069, класс дефекта F-1: `saas_billing_subscriptions.billing_period_code`
писался через `.update()`, но не был объявлен ни в одном гранте `UPDATE`, и ничего не покраснело). Проверка
целиком по отношению, не по роли: у разных ролей на одной таблице законно разные подмножества колонок
(`public.be_organizations`: `app_staff` пишет `title`/`is_active`/`sort_order`, `app_platform_settings` —
только `tariff_id`), а per-grant привязки колонки к ролевому callsite в декларации нет — поэтому гейт доказывает
только «эту колонку объявляет ХОТЬ КТО-ТО», не «каждая роль объявляет ровно то, что пишет её код». Он никогда не
добавляет колонку в грант — только называет отношение и колонку и останавливает генерацию.

Машинный артефакт [`drizzle-update-surface.ts`](./drizzle-update-surface.ts) — лексическая НИЖНЯЯ граница:
только `.update(<table>).set({...})` с object-literal без spread/computed-ключей резолвится в SQL-колонки;
остальное честно попадает в `DRIZZLE_UPDATE_UNRESOLVED_CALLSITES`, не отбрасывается молча. Регенерация:

```bash
pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-update-surface.ts          # перегенерировать
pnpm run check:drizzle-update-surface                                             # побайтный гейт
```

`pnpm run test:db-privileges` гоняет оба побайтных гейта (`insert` и `update`) перед privilege-тестами.

## Проверки

Типы:

```bash
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
```

Синхронизация закоммиченных артефактов:

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
```

Перепись production callsites против объявленных relation surfaces:

```bash
node deploy/postgres/privileges/generate-cli.mjs --census
```

Полная быстрая группа DB-гейтов:

```bash
pnpm run test:db-privileges
```

Генерация после намеренной правки декларации:

```bash
node deploy/postgres/privileges/generate-cli.mjs --all
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
```

Генератор пишет только в [`deploy/postgres/generated`](../generated). Пароли и приватные ключи туда не попадают:
login-render получает их из env во время применения.

## Текущая форма

На обеих управляемых базах объявлено 221 физическое отношение: 208 активных, 10 ожидающих удаления и три уже
снятых записи инвентаря. Текущая Revision 10 содержит:

- 0 табличных `revoke` из старого снимка;
- 0 `grantMatrix: G2-pending`;
- 0 открытых owner-gates;
- 0 пунктов старой очереди `CODE_MUST_CHANGE`;
- 0 карантинных legacy-ролей.

Сами числа экспортирует `DECLARATION_STATS`, поэтому документация не должна поддерживать второй ручной счётчик.

## Границы

- `saas_telemetry_operator` — действующая узкая SET-role внутри общего webapp staff pool, не отдельный login.
- `app_seam_public_clinic_card_owner` — отдельный владелец шва карточки клиники; он не объединяется с владельцем
  slug, потому что это расширило бы права.
- Исторические migrations и evidence не переписываются. Они объясняют переход, но не являются ordinary deploy.
- Новый доступ добавляется только от доказанной потребности человека к точному relation/function surface.
- Неизвестный relation, login, membership, ACL или policy должен красить генератор/каталожный verifier, а не
  приниматься как совместимость.

## Связанные документы

- [`SCHEME.md`](../../../docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md) — действующая архитектура слоя;
- [`PLAN.md`](../../../docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md) — актуальный статус и внешние live-гейты.

Промежуточные модели, findings и audit logs удалены из checkout; история остаётся в Git.
