# Экран «Приложение»: именная таблица людей снята, экран живёт на агрегате — 22.08.2026

План-файл: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, решение **Р-АДМИН** (§2.3).
Оракул условия: `docs/_TODO/OWNER_QUESTIONS_2026-07-26.md`, **#1019-Q1**.
Ветка: `wt/product-analytics-table-20260822`. Деплой, запись на TEST, `push`, full CI — не мои.

## Итог одной строкой

Именная таблица «Клиент» и диалог со ссылками на карточки пациентов сняты с вкладки «Приложение»
вместе с чтением `platform_users ⋈ user_identity`; экран остался живым на одном именованном
корне-агрегате `app.read_product_analytics_dashboard`, доказанном на DEV в откаченной транзакции.
Табличных грантов роли `app_platform_settings` не добавлено ни одного — только `EXECUTE`.

## 1. Что именно снято (п.1 брифа)

На вкладке было ДВА места с людьми поимённо, а не одно:

| Что | Где было | Судьба |
|---|---|---|
| Карточка «Пользователи приложения» — таблица с колонкой «Клиент» (ФИО), «Последний визит», заходы, страницы, push, минуты, каналы; плюс раскрывашка «Показать всех» | `ProductAnalyticsSection.tsx:267-310` | удалена |
| Диалог по клику на KPI «Активных пользователей» — список людей, **каждое имя — ссылка `patientCardHref(userId)` на карточку пациента** | `UsageMetricAccountsDialog.tsx` + `onClick` на `DoctorStatCard` | файл удалён, `onClick` снят |
| Наполнение обоих: `clientActivity[]` (`userId`, `displayName`, `lastSeenAt`, `channels[]`) | `types.ts:159-186`, `buildAdminDashboard.ts:362-424`, `pgProductAnalytics.ts:440-458` (`platform_users LEFT JOIN user_identity` ради ФИО) | тип, сборка и запрос удалены целиком |

Диалог — и есть буквальный «переход к пациентам» из условия #1019-Q1: он вёл на карточку пациента
по `userId`. Ни флага, ни «на всякий случай» не оставлено.

**Вызывающих вне этого экрана нет** (проверено): `UsageMetricAccountsDialog` импортировался ровно из
`ProductAnalyticsSection.tsx:4`; `ProductAnalyticsClientActivityRow`/`clientActivity` встречались
только в этих четырёх файлах. Соседний общий `shared/ui/doctor/analytics/MetricAccountsDialog.tsx`
(врачебные экраны) — другой компонент, не тронут.

**Осиротевший код тоже вырезан, а не оставлен:**

- `loadProductAnalyticsAudience()` — единственным потребителем был этот экран; после перехода на
  спецификацию (`loadPlatformAnalyticsAudienceSpec()`) у него не осталось вызывающих;
- вслед за ним стала недостижимой ветка отсева сотрудников в `resolveAnalyticsExcludedUserIds`
  (второй потребитель, `loadDoctorAnalyticsAudience`, всегда передавал `excludeStaffRoles: false`)
  — ветка и сам параметр убраны из drizzle-резолвера и из `loadAnalyticsAudienceContext`.
  Понятие «убрать персонал» никуда не делось: оно живёт в `platformAudienceJson(...,
  { excludeStaffRoles: true })` и применяется телом SQL-корня.

## 2. Почему снятия таблицы не хватило (п.2 брифа)

Хватило бы, если бы 500 давало только чтение ФИО. Замер показал другое: у `app_platform_settings`

- на `public.platform_users` — ровно `SELECT ("calendar_timezone", "id")`,
- на `public.product_analytics_events_recent`, `public.product_analytics_user_hourly`,
  `public.product_push_notifications` — **ничего**

(`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`, версия до правки). То есть 42501 давали
и резолв служебных учёток, и все три чтения телеметрии, из которых и складываются KPI. Экран
остался бы на 500 и без таблицы.

**Существующие корни не подошли, и это проверено, а не предположено:**

- `app.read_platform_user_stats` (соседняя ветка) отдаёт регистрации/слияния/подписчиков — ни одной
  величины этого экрана в нём нет;
- `app.read_platform_analytics_dashboard` берёт из телеметрии только `page_views`
  (`declaration.ts:3606`) — ни заходов, ни push, ни минут активности он не считает.

Поэтому корень новый — **один на экран**, и обоснование выписано в шапке миграции.
Владелец шва **существующий**: `app_seam_platform_analytics_owner` уже владеет обоими соседними
корнями и уже читал `product_analytics_user_hourly`.

### Что отдаёт корень

`app.read_product_analytics_dashboard(timestamptz, timestamptz, text, text, text) RETURNS jsonb`:

- `hourly[]` — почасовой ролап событий и push по измерениям (`user_id` в нём нет вовсе);
- `warmupSloganSamples[]` — тексты слоганов разминки;
- `userAggregates` — **только счёт**: `totalActiveMinutes`, `uniqueActiveUsers`,
  `activeUsersDaily[]`, `pageUniqueUsers[]`, `pageUniqueUsersHourly[]`.

Русские подписи, группировка топ-страниц по видам и лейблы тем остались в TypeScript
(`buildAdminDashboard`) — в SQL они не переезжали.

### Одно инженерное решение, которое стоит назвать вслух

`uniqueUsers` в «Топе страниц» — это `count(DISTINCT user_id)`, и он ОБЯЗАН считаться **после**
схлопывания ключей страниц: человек, открывший `/app/patient/treatment/:id` и
`/app/patient/treatment`, иначе посчитается дважды. На DEV это не теория — три из тридцати восьми
хранимых ключей сходятся именно в эту группу и они же самые частые.

Схлопывание живёт в TypeScript. Копировать его правила в SQL нельзя (две копии разъедутся молча,
AGENTS §5), а считать distinct в приложении больше не из чего — строк пользователей оно не видит.
Решение — тем же приёмом, каким соседние корни получают `p_audience_json`: правила уезжают
**данными**, параметром `p_page_groups_json`. Для этого `groupProductAnalyticsPageKey` переписана из
дерева `if`-ов в список правил `PRODUCT_ANALYTICS_PAGE_GROUP_RULES` + интерпретатор; тело SQL —
второй интерпретатор ТОГО ЖЕ списка, своих правил у него нет. Живая проверка сверяет результат с
независимо написанным `CASE`-оракулом, то есть расхождение интерпретаторов краснеет тестом.

### Разбор прав корня (AGENTS §1)

Тело исполняется `app_seam_platform_analytics_owner`, читает шесть отношений:

| Отношение | Колонки | Было у шва? |
|---|---|---|
| `public.platform_users` | `id`, `role` | да |
| `public.user_contacts` | канонические | да (`CANONICAL_CONTACT_SURFACE_CORRECTIONS`) |
| `public.user_channel_bindings` | `user_id`, `channel_code`, `external_id` | да |
| `public.product_analytics_user_hourly` | `bucket_hour`, `user_id`, `page_key`, `app_opens`, `page_views`, `push_opens`, `active_minutes` | частично — три колонки счётчиков добавлены объявлением |
| `public.product_analytics_events_recent` | `occurred_at`, `event_type`, `entry_channel`, `page_key`, `topic_code`, `push_kind`, `warmup_slogan_key`, `user_id` | **нет — новое отношение шва** |
| `public.product_push_notifications` | `created_at`, `user_id`, `topic_code`, `push_kind`, `warmup_slogan_key`, `warmup_slogan_text` | **нет — новое отношение шва** |

Записи нет, `FOR UPDATE`/`FOR SHARE` нет, новых seam-ролей нет, новых таблиц и колонок нет — значит
и нового индекса на горячую колонку не требуется. Два новых для шва отношения означают не только
колоночный грант, но и **restrictive-политику** `rev10_named_root_owner_gate_157/160`: владельца
шва в неё ставит ГЕНЕРАТОР из декларации, миграция прав не выдаёт и не отзывает.

## 3. Граница: ни одного нового табличного гранта (п.3 брифа)

Дифф `HEAD` → ветка по обеим базам, строки `GRANT … TO "app_platform_settings"`:

```
было 70 строк, стало 71; единственная новая:
GRANT EXECUTE ON FUNCTION app.read_product_analytics_dashboard(...) TO "app_platform_settings";
```

Ровно то же на `bersoncarebot_test`. Остальные строки диффа — колоночные гранты и политики
**владельцу шва**, не роли экрана. Живая проверка того же в откаченной транзакции:
`has_table_privilege(app_platform_settings, …)` = `false` на всех трёх телеметрических таблицах,
`has_column_privilege` на `platform_users.role` = `false`, на `.id` = `true` (как и было).

Права — только `declaration.ts` + генератор; в миграции ни `GRANT`, ни `REVOKE`
(`check-migration-privileges` — OK на 45 файлах).

## 4. Соседний drill-down НЕ включён (п.4 брифа)

Снятие таблицы делает условие #1019-Q1 достижимым по своей половине: перехода к пациентам с вкладки
«Приложение» больше нет. **`/api/admin/doctor-analytics-metric-accounts` оставлен закрытым
fail-closed `409 platform_patient_drilldown_disabled` — я его не трогал.** Включение — отдельное
решение владельца, не следствие моей правки; вторая половина условия (вкладка «Клиенты») мне не
поручена и не проверялась.

## 5. Живое доказательство

`--execute` по DEV не делал.

- `bash deploy/host/migrate-dev.sh --preflight` → **PASS**, `pending=2 total=44`, оба statement
  исполнены от `app_seam_platform_analytics_owner`, транзакция откачена.
  Чтобы preflight запустился из worktree, в него скопированы канонические DEV-env главного дерева
  (`.env`, `apps/webapp/.env.dev`, оба в `.gitignore`) — без них wrapper падает
  `FATAL: DEV API env path guard failed`; это ограничение worktree, а не дефект.
- `RUN_PRODUCT_ANALYTICS_ROOT_DB=1 node --test
  deploy/postgres/privileges/product-analytics-dashboard-root.devDbProof.test.mjs` → **5/5 pass**.
  Внутри одной откаченной транзакции: тело миграции от владельца шва + строки доступа и политики из
  сгенерированного артефакта + строка каталога возможностей, затем настоящий путь порта
  (`SET LOCAL SESSION AUTHORIZATION bcb_dev_webapp_global_admin` → `app.begin_port_context`) и вызов
  корня под `app_platform_settings`.
  - **Числа настоящие и совпали с независимым оракулом от суперпользователя** (окно
    01.05–22.08.2026, `Europe/Moscow`): активных людей **61**, минут активности **6890**, заходов
    (`app_open`) **1300**, отправленных push **2576**; число групп страниц и уникальные по группе
    `/app/patient/treatment/program` — до единицы. Оракул схлопывает ключи `CASE`-цепочкой,
    написанной независимо от списка правил, который получает дверь.
  - **Ловушка пустоты стоит:** проверка сама краснеет, если в окне нет ни активных, ни заходов, ни
    push — «совпадение нулей» не засчитывается.
  - **Утверждение по ответу, а не глазами:** рекурсивный обход ответа двери требует, чтобы в нём не
    было ни ключа `userId`/`displayName`/`firstName`/`lastName`/`phone`/`email`/`lastSeenAt`/
    `clientActivity`/`channels`, ни значения, целиком являющегося идентификатором. Тот же обход
    прогоняется по ответу маршрута (unit-тест) — и там же стоит ловушка: тест с подложенной строкой
    человека доказывает, что обход её ловит.
  - **Две инъекции неисправности красят проверку.** Без `GRANT EXECUTE` вызов падает
    `permission denied for function read_product_analytics_dashboard`. Без пересозданной
    restrictive-политики шва (гранты при этом на месте) телеметрия читается как ноль строк — то
    есть проверка политики не декоративная.
- После прогона DEV чист: всё жило в откаченной транзакции.

**Чего живая проверка НЕ покрывает и почему:** HTTP-200 от самого `/api/admin/product-analytics` не
снят — для этого корню, грантам, политикам и строке каталога надо ФИЗИЧЕСКИ оказаться в DEV, то есть
`--execute`, который бриф запрещает. Покрыто вместо этого: SQL-уровень доказан живьём под тем же
принципалом, а маршрут → загрузчик → сервис → порт → литеральная идентичность двери и форма ответа —
unit-тестами (`pgProductAnalyticsDashboardRoot.unit.test.ts`, 7 тестов). HTTP-подтверждение берётся
на TEST при деплое ведущим.

## 6. Файлы

| Файл | Что |
|---|---|
| `apps/webapp/db/drizzle-migrations/20260822T173000_the_product_analytics_screen_reads_an_aggregate.sql` | корень; `SECURITY DEFINER`, `require_accepted_context` первым исполняемым оператором, `search_path=pg_catalog`; **ни одного `GRANT`/`REVOKE`**; разбор прав в шапке |
| `deploy/postgres/privileges/declaration.ts` | `rev10Function` (owner/execute/relationSurfaces), строка каталога возможностей `webapp_product_analytics_dashboard`, запись в `CANONICAL_CONTACT_SURFACE_CORRECTIONS` |
| `apps/webapp/src/modules/product-analytics/productAnalyticsPageKey.ts` | правила схлопывания стали списком-данными + интерпретатор; `productAnalyticsPageGroupsJson()` |
| `apps/webapp/src/modules/product-analytics/types.ts` | сняты `ProductAnalyticsClientActivityRow`/`…ChannelStatsRow`/`clientActivity`; добавлен `ProductAnalyticsUserAggregates` |
| `apps/webapp/src/modules/product-analytics/buildAdminDashboard.ts` | сборщик принимает СЧЁТ вместо строк пользователей; `aggregateProductAnalyticsUserHourly` для пути без базы |
| `apps/webapp/src/infra/repos/pgProductAnalytics.ts` | четыре отношенческих чтения → один вызов именованного корня |
| `apps/webapp/src/infra/repos/inMemoryProductAnalytics.ts` | приведён к новой форме входа сборщика |
| `apps/webapp/src/modules/product-analytics/{ports,service}.ts` | `includeTestAccounts` → спецификация служебных учёток |
| `apps/webapp/src/app-layer/product-analytics/loadAdminProductAnalytics.ts` | `loadProductAnalyticsAudience()` → `loadPlatformAnalyticsAudienceSpec()` |
| `apps/webapp/src/app-layer/analytics/loadAnalyticsAudience.ts`, `modules/analytics/analyticsAudience.ts`, `infra/repos/pgAnalyticsAudience.ts` | осиротевший загрузчик и недостижимая ветка отсева персонала убраны |
| `apps/webapp/src/app/app/doctor/usage/ProductAnalyticsSection.tsx` | снята карточка «Пользователи приложения» и клик по KPI |
| `apps/webapp/src/app/app/doctor/usage/UsageMetricAccountsDialog.tsx` | **удалён** |
| `apps/webapp/src/app/api/api.md` | контракт ответа: строк людей нет, источник — именованный корень |

Тесты: `apps/webapp/src/infra/repos/pgProductAnalyticsDashboardRoot.unit.test.ts`,
`deploy/postgres/privileges/product-analytics-dashboard-root.devDbProof.test.mjs` (opt-in, живой).

## 7. Проверки

| Проверка | Результат |
|---|---|
| `pnpm test:db-privileges` | 213 тестов, **143 pass / 0 fail** / 70 skip (skip — devDbProof без opt-in) |
| `generate-cli.mjs --all` + `--check` | побайтно совпадает |
| `generate-cli.mjs --all --port-context-only` + `--check --port-context-only` | побайтно совпадает |
| `generate-cli.mjs --census` / `--gaps` | ok, `gaps=0`, `unresolved=0` |
| `migration-order` + `port-context-catalog` | 31 pass / 0 fail |
| `check-no-new-raw-sql` · `check-db-chokepoint` · `check-migration-privileges` · `check-c4-migration-owned-function-bodies` · `check-drizzle-migration-order` | все OK |
| vitest (новый + 9 соседних затронутых суит) | 10 файлов, **42 pass / 0 fail** |
| `tsc --noEmit -p apps/webapp` | чисто |
| `eslint` по изменённым файлам | чисто |
| `tsc --strict -p deploy/postgres/privileges` | 2 ошибки, **обе пред-существующие** — проверено `git stash -u`: на `HEAD` те же две в тех же местах (строки 3689/6781 на HEAD → 3733/6825 после моей вставки). Не мои, не чинил |

## НЕ СДЕЛАНО

1. **HTTP 200 самого маршрута живьём не снят** — требует `--execute` по DEV, запрещённого брифом
   (§5 выше). Снимается на TEST при деплое.
2. **`/api/admin/doctor-analytics-metric-accounts` не включён** — сознательно, это решение владельца
   (§4 выше).
3. **Вкладка «Клиенты»** — вторая половина условия #1019-Q1 — не моя, не смотрел.
4. **Два пред-существующих `tsc`-отказа в `declaration.ts`** не чинил.
5. **`pageViewsHourly[]` в ответе никем не рисуется** — на экране «Приложение» его не читает ни один
   компонент (проверено grep-ом по `pageViewsHourly`). Я его сохранил: удаление поля контракта — не
   то, о чём бриф, а отдельное решение. Называю вслух, чтобы ведущий решил.
6. **Расхождение в определении «служебной учётки»**, унаследованное от соседней ветки (прежний
   drizzle-код отсекал по ПЕРВИЧНОМУ телефону, корень — по любому телефонному контакту), здесь
   осталось прежним: экран теперь идёт через корень, как и два соседних. Сведение двух правил в одно
   — отдельная работа, не делал заодно.
7. `docs/_TODO/.../WORK_ORDER.md` галочки не ставил — их ставит ведущий.
