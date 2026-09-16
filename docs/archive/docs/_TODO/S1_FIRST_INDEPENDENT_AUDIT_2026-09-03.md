# S1 — первый независимый аудит приёмки, 03.09.2026

Основание: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, волна 03.09, пункты R1 и S1.
Аудитор ничего в продукте не чинил: права не выдавались, SQL не перегенерировался, живых мутаций в БД не было.
Здесь записано только то, что не выражается коммитнутым гейтом.

Гейт: `deploy/postgres/privileges/drizzle-insert-grant-completeness.test.mjs`
Хелпер (только для теста): `apps/webapp/scripts/print-drizzle-insert-columns.ts`

## 1. Красное состояние воспроизведено из коммитнутого кода

```
$ pnpm test:db-privileges
# [S1] column INSERT (role, table) pairs with a live Drizzle .insert() callsite and a webapp
#      relation capability: 127 per database (254 across 2 managed databases)
not ok 52 - column-level INSERT grants name every column Drizzle names
# tests 325 / pass 176 / fail 1 / skipped 148
```

Падает ровно один тест — новый гейт. Первая строка отказа:

```
bcb_webapp_dev app_staff public.be_patient_package_items: not granted id
  (first callsite apps/webapp/src/infra/repos/pgMemberships.ts:501)
```

Это тот самый живой `42501` из журнала TEST. Всего гейт называет **44 пары (роль, таблица) в каждой из двух
управляемых баз** — 88 строк отказа. Это измеренное число, а не оценка: прежние отчёты давали 31, 30 и 78,
ни одно из них не воспроизводится.

## 2. Семантика Drizzle 0.45.2 проверена по установленному коду, не по фразе из отчёта

`apps/webapp/node_modules/drizzle-orm` — версия `0.45.2`.

- `pg-core/dialect.cjs`, `buildInsertQuery`:
  `const colEntries = Object.entries(columns).filter(([_, col]) => !col.shouldDisableInsert())`,
  затем `insertOrder = colEntries.map(...)` — в `INSERT INTO t (...)` попадает **весь** этот список
  безусловно; отсутствующим в `.values({})` ключам подставляется `sql\`default\``.
- `column.cjs`: `shouldDisableInsert()` возвращает истину только при
  `config.generated !== undefined && config.generated.type !== 'byDefault'` — то есть только
  `generatedAlwaysAs` и `generatedAlwaysAsIdentity`.
- `casing` в приложении не настроен (`drizzle()` вызывается без опций), поэтому имя в SQL равно `column.name`.

Следствие: требуемый набор = все колонки схемы, кроме generated-always. `defaultRandom()`-первичный ключ
входит в него всегда.

## 3. Оракул и его единственный источник истины

Ни одного рукописного списка таблиц и ни одного снимка текста исходника. Четыре стороны, каждая выводится:

| сторона | откуда берётся |
| --- | --- |
| требуемые колонки | живые метаданные Drizzle (`getTableColumns` + предикат `shouldDisableInsert`) |
| достижимые таблицы | каждый `.insert(<таблица>)` в `apps/webapp/src`, разобранный по AST TypeScript и графу импортов до точного экспорта `db/schema/*.ts` (псевдонимы прослеживаются) |
| достижимые роли | `declaration.portContext.capabilities`: `targetRole` каждой webapp-возможности с `purpose: 'relation'` |
| выданные колонки | сам `declaration` — то, что генератор пишет в SQL, по каждой управляемой базе |

Разбор «callsite → таблица» оказался выполнимым точно: 0 неразрешённых `.insert(...)` на всём
`apps/webapp/src`, и гейт падает, если появится хоть один неразрешённый.

Разбор «callsite → принципал» статически невыполним: роль приходит из `AsyncLocalStorage`
(`getCurrentDbPrincipal()`), то есть из HTTP-контекста запроса. Возвращать FAIL, однако, не потребовалось,
потому что для этого класса он и не нужен: Drizzle называет один и тот же список колонок независимо от роли,
поэтому достаточно ограничить проверку ролями, которые вообще способны исполнить webapp-реляционный
стейтмент. Этот список тоже объявлен, а не угадан — `purpose: 'relation'` + `port: 'webapp'`:
`app_staff`, `app_patient`, `app_clinic_billing`, `app_platform_settings`, `app_platform_admin`, `app_worker`,
`app_operational_media_worker`, `app_operational_maintenance`, `saas_telemetry_operator`.

Побочно это независимо подтверждает R2: **`app_tenant_service` в списке webapp отсутствует** — у webapp нет
возможности порта с `purpose: 'relation'` для организационного принципала.

## 4. Слепой список поломок (составлен ДО чтения существующих privilege-тестов) и его закрытие

| # | поломка | как убита | доказательство |
| --- | --- | --- | --- |
| K1 | пропущен `id` | гейт красный | `app_staff public.be_patient_package_items: not granted id` |
| K2 | пропущена другая колонка с DEFAULT | гейт красный на реальных находках | `be_refunds: created_at`, `be_payment_history_events: occurred_at`, `comments: created_at, updated_at`, `patient_home_block_items: created_at, organization_id, updated_at` |
| K3 | generated-always ошибочно требуется | отдельный тест | инъекция: убрать фильтр `shouldDisableInsert` в хелпере → тест 2 краснеет `media_folders: name_normalized`; вернуть → зелёный |
| K4 | рукописный allowlist молча исключает новое отношение | allowlist отсутствует | инъекция: временный файл с `db.insert(lfkComplexes)` → появилось `public.lfk_complexes: not granted created_at, id`; файл удалён → строка исчезла, ничего не правилось |
| K5 | таблица с колоночным INSERT, но без Drizzle-callsite расширяется без доказательства | такие пары в область не входят | 0 строк с `app_tenant_service` в отказе, при том что у `app_tenant_service public.specialist_tasks` грант неполон против Drizzle; исключены также 39 пар «webapp-роль без Drizzle-callsite» |

Дополнительно (требование S1 «убрать колонку из декларации → красный, вернуть → зелёный»):
убрал `display_number` у `app_staff public.be_patient_packages` → появилась строка
`not granted display_number (first callsite apps/webapp/src/infra/repos/pgMemberships.ts:475)`; вернул → строка
исчезла. Обратная инъекция: добавил `id` в грант `be_patient_package_items` → эта строка исчезла, то есть после
исправления S1 гейт зеленеет по этой паре. Дерево после инъекций восстановлено побайтно (`git diff` пуст).

## 5. Совместимость конструкции S1 с текущими границами — четыре замечания к плану

Продуктовый фикс не делался. План S1 предлагает: «в `relation-access.ts` для роли с колоночным `INSERT`
хранится ссылка на Drizzle-экспорт; генератор раскрывает `getTableColumns()` в полный список, вычитая
`generatedAlwaysAs`». Проверено против дерева — идея верна, но в лоб не собирается:

1. **Генератор физически не может импортировать схему.** `generate.mjs` — обычный Node-модуль, который
   хосты запускают напрямую (`deploy/host/deploy-test.sh:275`, `migrate-dev.sh:200`,
   `refresh-dev-from-test.sh:89`, `cutover-postgres-port-context.sh:82`). Два препятствия, оба проверены:
   `drizzle-orm` не разрешается из корня репозитория (это зависимость только `apps/webapp`), а модули
   `apps/webapp/db/schema/*.ts` импортируют друг друга без расширения (`from './schema'`), что ESM-резолвер
   Node отвергает — работает только bundler-резолвер (`tsx`/Next). Плюс `db/schema/operatorHealth.ts` требует
   собранный `packages/operator-db-schema/dist`.
   Прямое следствие: раскрытие `getTableColumns()` **внутри генератора** делает генерацию прав зависимой от
   установленного и собранного webapp-workspace на деплой-хосте и ломает объявленное свойство генератора
   «чистая функция, побайтно тот же выход» (`generate.mjs`, шапка).
   **Минимальная коррекция плана:** оставить генератор чистым, а метаданные Drizzle внести как
   **сгенерированный и закоммиченный артефакт** (`таблица → список названных колонок`), который производит
   webapp-workspace — ровно то, что печатает `apps/webapp/scripts/print-drizzle-insert-columns.ts`.
   Второго рукописного авторитета при этом не появляется: артефакт машинный, а этот гейт сверяет его с живыми
   метаданными Drizzle. Альтернатива — звать `node_modules/.bin/tsx` из генератора — покупает отсутствие
   артефакта ценой потери чистоты и работоспособности на хосте; не рекомендую.
2. **`shouldDisableInsert()` нельзя вызывать из типизированного кода.** Метод помечен `@internal` и
   отсутствует в опубликованном `drizzle-orm/column.d.ts` — `pnpm --dir apps/webapp typecheck` на нём падает.
   Публично типизировано поле `Column.generated` (`GeneratedColumnConfig | undefined` с `type?`), которому
   метод и делегирует. В хелпере предикат написан через публичное поле и **приколот** к методу библиотеки
   в рантайме: расхождение будущей версии drizzle роняет хелпер громко, а не сужает требуемый набор молча.
3. **Два отношения не имеют Drizzle-модели вовсе**, а колоночный `INSERT` у webapp-роли имеют:
   `public.broadcast_drafts` и `public.system_settings_audit` (обе — `app_staff`). Ссылки на Drizzle-экспорт
   для них не существует, писать её некуда; их списки колонок обязаны остаться рукописными, и план должен это
   назвать явно, иначе исполнитель либо застрянет, либо заведёт фиктивную модель.
4. **`public.platform_users` у `app_staff` содержит колонку, которой в Drizzle-модели нет:** `session_epoch`.
   Механическая замена списка на `getTableColumns()` **удалит** её из гранта. По дереву `session_epoch`
   пишется только в `UPDATE` (`pgUserProjection.ts:184`) и читается в `SELECT`; единственный сырой
   `INSERT INTO platform_users` (`pgUserByPhone.ts:595`) называет только `display_name, role`. То есть удаление
   выглядит безопасным — но это решение, а не побочный эффект генератора, и оно должно быть принято
   осознанно. Заодно это живой дрейф между каталогом БД и моделью Drizzle: модель отстаёт от таблицы.

## 6. Что осталось за границей гейта — названо, а не умолчано

- **Пары с колоночным `INSERT` и без Drizzle-callsite (39 у webapp-ролей) не проверяются на полноту.** Их
  гранты обслуживают сырой SQL или тело SECURITY DEFINER, которое само называет колонки; расширять их из
  метаданных ORM — недоказанное расширение прав.
- **Роли без webapp-возможности `purpose: 'relation'`** (`app_tenant_service`, владельцы `app_seam_*`,
  интеграторские роли) не проверяются — по той же причине с другой стороны.
- **Колонки, выданные сверх набора Drizzle, не считаются отказом.** Такая пара сегодня ровно одна —
  `app_staff public.platform_users` / `session_epoch` (см. §5.4). Это класс «избыточный грант», а не `42501`;
  волна 03.09 его явно не берёт.
- **Интеграторская сторона гейтом не покрыта** (у `apps/integrator` свои Drizzle-схема и `node_modules`).
  Проверено, что дыры это не оставляет: ни одна пара с колоночным `INSERT` в декларации не принадлежит роли с
  интеграторской возможностью `purpose: 'relation'` (0 из 317 колоночных INSERT-грантов базы), а единственный `.insert()` в
  `apps/integrator/src` (`repos/reminders.ts:332`, `content_access_grants`) колоночного `INSERT`-гранта в
  `REV10_CLINICAL_ACCESS` не имеет.
- **Предпосылка запуска:** гейт требует собранного `packages/operator-db-schema` — ровно та же предпосылка,
  что уже есть у `pnpm typecheck`, который в цепочке CI (`ci:resume:after-lint`) идёт до `test:db-privileges`.

## 7. Статус

Гейт остаётся **красным** на текущей реализации — это первая передача аудитора (§24.5), продуктовый фикс S1
ещё не сделан. Зелёным он станет ровно тогда, когда колоночные `INSERT`-гранты покроют то, что Drizzle
называет.
