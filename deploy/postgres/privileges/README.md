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

## Колоночные `INSERT`/`UPDATE` — ручное решение, не вывод из скана продукта

До #1069-коррекции (2026-09-05) колоночный `INSERT` домысливался механически: закоммиченный артефакт
`drizzle-insert-surface.ts`, сгенерированный AST-сканом `.insert()`-callsites в `apps/webapp/src` плюс живых
метаданных Drizzle, объединялся с объявленным грантом во время генерации (`withDrizzleInsertColumns`), а второй
такой же артефакт для `UPDATE` только гейтил расхождение. Владелец снял это решение: скан продуктового кода
(«эта роль зовёт `.insert()`/`.update()` на эту таблицу») отвечает на вопрос «что код делает сегодня», а не на
вопрос «должна ли эта роль иметь это право» — и провоцирует незаметное авторасширение гранта при появлении
нового callsite, которое никто не решал явно.

Оба артефакта, их генераторы (`apps/webapp/scripts/generate-drizzle-{insert,update}-surface.ts`) и побайтные
гейты (`check:drizzle-insert-surface`, `check:drizzle-update-surface`) удалены. Каждый грант в
`REV10_CLINICAL_ACCESS`/`REV10_SYSTEM_DIRECT_ACCESS` называет теперь колонки INSERT/UPDATE напрямую и полностью,
включая колонки, которые Postgres требует НАЗВАННЫМИ в `INSERT` даже со значением `DEFAULT`
(`defaultRandom()`-первичные ключи и подобные) — это по-прежнему тот же факт про Drizzle (`pg-core/dialect.js`,
`buildInsertQuery`), но теперь он один раз материализован как объявленное решение, а не выводится заново при
каждой генерации.

Точечный приёмочный гейт [`staff-drizzle-insert-grant-coverage.test.mjs`](./staff-drizzle-insert-grant-coverage.test.mjs)
остаётся: он сам, без какого-либо артефакта, спрашивает у живых метаданных Drizzle колонки двух денежных
INSERT-путей (`patient_payment`, `be_patient_packages`) и сверяет их с объявленным грантом — доказательство
конкретной двери, а не механизм, определяющий права по всей схеме.

## RLS-политики locked-семейства — тоже только декларация, не внешний генератор

До #1069-коррекции (2026-09-05, §B) `declaration.ts` вычислял `REV10_LOCKED_POLICIES` во время каждой генерации,
импортируя `getPhase4LockedPolicyTargets`/`renderPhase4StrictPredicate` из
`docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs` — а тот модуль сам собирал table targets,
policy names и predicates из четырёх P0.8-*-`policy-targets.mjs`-модулей, `rls-descriptor-model.mjs` и
`rls-sql-renderer.mjs`. Это был второй исполняемый источник тех же object-specific решений (какая таблица под
locked-политикой, каким именем, с каким predicate), просто вызываемый изнутри `declaration.ts`.

Теперь `declaration.ts` несёт эти решения сам, литералом: `REV10_LOCKED_POLICY_DATA` (141 отношение) —
`policyName`, `dormantMode` и уже посчитанные `strictPredicate`/`dormantCompatPredicate` на каждую таблицу.
`generate.mjs`/`generate-cli.mjs` по-прежнему не подключаются ни к чему внешнему при генерации emitted SQL —
эта карта такой же литерал в файле, как и остальные ~240 решений.

`phase4-locked-policy-artifact.mjs` остался — он рендерит закоммиченный legacy-артефакт
`deploy/postgres/phase4-locked-helper-rls-policies.sql`, который `test-strict-rls-finalizer.sql` всё ещё
`\ir`-ит как reviewed overlay поверх политик, сгенерированных из `declaration.ts`. Но он больше не независимый
источник: его `getPhase4LockedPolicyTargets`/`renderPhase4StrictPredicate`/`renderPhase4DormantCompatPredicate`
теперь читают ровно `REV10_LOCKED_POLICY_DATA` из `declaration.ts` (динамический `import()` — файл механически
не может разойтись с декларацией; проверено побайтным сравнением до/после переноса). Файл остаётся, потому что
удаление `\ir`-подключения из `test-strict-rls-finalizer.sql` меняет порядок применения RLS-policy на живой
базе, а это требует миграционного/deploy-прогона вне скоупа этого прохода (правки БД тут не делались).

`WALL_TEMPLATES`/`CLASS_DEFAULT_WALL` (какой RLS-режим и требование у каждой стены, какая стена — умолчание для
класса данных) тем же решением перенесены из `types.ts` в `declaration.ts`: это default-decisions, влияющие на
emitted `rls`/`wall` каждой таблицы, не грамматика. `types.ts` несёт только типы (`Wall`, `DataClass`,
`WallTemplateMap`, `ClassDefaultWallMap`) и параметризованный `expandTables(rows, { wallTemplates,
classDefaultWall })`, которому декларация передаёт эти решения явно.

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
