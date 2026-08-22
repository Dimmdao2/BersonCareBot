# Три админских экрана статистики на агрегаты (Р-АДМИН) — 22.08.2026

План-файл: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, решение **Р-АДМИН** (§2.3).
Ветка: `wt/admin-stats-aggregates-20260822`. Деплой, запись на TEST, `push`, full CI — не мои.

## Итог одной строкой

Два экрана из трёх переведены на именованный корень-агрегат и доказаны живьём на DEV в откаченной
транзакции. **Третий (`/api/admin/product-analytics`) НЕ чинил: это находка и вопрос ведущему** —
экран показывает строки людей поимённо, а бриф на такой случай велит СТОП (п.1), потому что менять
такой экран — решение владельца, а не работа исполнителя.

## 1. Замер: что показывает каждый маршрут и что читает

### `/api/admin/platform-user-registration-stats` — экран «Регистрации и слияния»

Экран: `apps/webapp/src/app/app/doctor/analytics/clients/AdminPlatformRegistrationStatsClient.tsx:84-110`
— три карточки-числа («Регистрации», «Слияния», «Всего событий») и линейный график по дням. **Строк
людей нет.**

Читал сегодня (до правки), всё под платформенным принципалом:

| Что | Где | Отношения |
|---|---|---|
| 4 запроса счётчиков | `pgAdminPlatformUserStats.ts:35-88` (до правки) | `public.platform_users` |
| резолв служебных учёток в id | `pgAnalyticsAudience.ts:25-84` через `loadDoctorAnalyticsAudience` (`route.ts:46` до правки) | `public.platform_users`, `public.user_channel_bindings` |

Нужное человеку у экрана ЧИСЛО: сколько регистраций и сколько слияний за окно, всего и по дням.

### `/api/admin/platform-user-subscriber-stats` — экран «Подписчики приложения»

Экран: `AdminPlatformSubscriberStatsClient.tsx:79-92` — две карточки-числа («На конец периода»,
«Прирост за период») и кумулятивный график. **Строк людей нет.**

Читал: `pgAdminPlatformUserStats.ts:105-152` (до правки) — `public.platform_users` INNER JOIN
`public.user_channel_bindings`; плюс тот же резолв служебных учёток.

Нужное ЧИСЛО: сколько подписчиков накопилось к концу каждого локального дня окна.

Отдельно проверил drill-down: карточки обоих экранов умеют звать диалог со списком учёток, но
во вкладке «Приложение» `onMetricClick` в них не передаётся вовсе
(`RegistrationStatsAppTabWrapper.tsx:8`, `SubscriberStatsAppTabWrapper.tsx:12`), а сам диалог
ходит в `/api/admin/doctor-analytics-metric-accounts`, который уже стоит fail-closed `409
platform_patient_drilldown_disabled`. То есть поимённого списка за этими двумя экранами нет
ни сегодня, ни после правки.

### Почему было 500

`app_platform_settings` имеет на `public.platform_users` ровно
`GRANT SELECT ("calendar_timezone", "id")` и на `public.user_channel_bindings` — **ничего**
(замер: `deploy/postgres/generated/privileges.bcb_webapp_dev.sql`, строка 16558-16559 в версии до
правки). Любой из шести запросов — `42501`.

### `/api/admin/product-analytics` — экран «Приложение» — СТОП, вопрос ведущему

Экран: `ProductAnalyticsSection.tsx:267-310` — помимо KPI-чисел рендерит **таблицу с колонкой
«Клиент»**: `displayName`, `lastSeenAt`, заходы, просмотры, минуты активности по каждому человеку
(тип `ProductAnalyticsClientActivityRow`, `modules/product-analytics/types.ts:159-169`; наполняется
из `pgProductAnalytics.ts:440-458` — `platform_users LEFT JOIN user_identity` ради ФИО).

Это ровно случай из п.1 брифа: **экран показывает строки людей поимённо**. Дверь-агрегат его не
чинит — любой корень, который я напишу, обязан либо отдать имена (и тогда это не агрегат), либо
убрать таблицу с экрана (и тогда это продуктовое решение владельца). Ничего не трогал.

**Вопрос ведущему:** таблица «Клиент» на экране «Приложение» остаётся, уезжает целиком или
заменяется обезличенным срезом (например, распределение активности по корзинам без имён)? После
ответа корень пишется за один заход — форма та же, что у двух готовых.

Побочно: `/api/admin/doctor-analytics-metric-accounts` (диалог по клику на «Активных
пользователей», `ProductAnalyticsSection.tsx:328`) уже стоит fail-closed `409
platform_patient_drilldown_disabled` — то есть по этой же причине его уже однажды закрыли.
Соседняя таблица на том же экране осталась открытой; это не мой скоуп, но выглядит хвостом того же
решения.

`/api/doctor/clients/name-match-hints` не трогал — врачебный маршрут, к админке отношения не имеет
(подтверждено брифом).

## 2. Что сделано

### Один корень на оба экрана, а не один на экран и не один на счётчик

`app.read_platform_user_stats(timestamptz, timestamptz, text, text) RETURNS jsonb` — секции
`registrations` / `merges` / `subscribers`, каждая с `total`/`countBeforeStart` и `byDay`.

Почему ОДИН на два экрана (AGENTS §5, «варианты одного действия — параметры одной точки»): оба
экрана спрашивают одно и то же — сколько людей за окно локальных суток `p_iana` за вычетом
служебных учёток — теми же четырьмя аргументами. Регистрации, слияния и подписчики это секции
одного ответа. Цена: экран регистраций считает и подписчиков тоже (один GROUP BY по
`user_channel_bindings`); на этих объёмах это ничто, а второй объявленной двери, второго ключа
каталога и второго места, где правило разъедется, — нет.

Почему НЕ переиспользован существующий `app.read_platform_analytics_dashboard`: он считает
девятнадцать отношений ради другого экрана и ни одной из этих трёх величин не отдаёт (его
`patients` — другой фильтр: без учёта слияния внутри окна и без архивных). Переиспользован его
**владелец шва** — `app_seam_platform_analytics_owner` уже читает все три отношения этого тела,
второго владельца заводить не пришлось.

### Файлы

| Файл | Что |
|---|---|
| `apps/webapp/db/drizzle-migrations/20260822T161000_the_platform_user_stats_screens_read_an_aggregate.sql` | корень; `SECURITY DEFINER`, `require_accepted_context` первым исполняемым оператором, `search_path=pg_catalog`; **ни одного `GRANT`/`REVOKE`**; разбор прав в шапке |
| `deploy/postgres/privileges/declaration.ts` | `rev10Function` (owner/execute/relationSurfaces), запись в `CANONICAL_CONTACT_SURFACE_CORRECTIONS`, строка каталога возможностей `webapp_platform_user_stats` |
| `apps/webapp/src/infra/repos/pgAdminPlatformUserStats.ts` | шесть отношенческих запросов → один вызов именованного корня |
| `apps/webapp/src/infra/repos/pgAnalyticsAudience.ts` | `platformAudienceJson(...)` — ОДНА сборка `p_audience_json` на все платформенные двери, `excludeStaffRoles` параметром |
| `apps/webapp/src/infra/repos/pgPlatformAnalytics.ts` | приватная копия сборки заменена на общую |
| `apps/webapp/src/modules/analytics/analyticsAudience.ts` | тип `AnalyticsTestAccountSpec` — один на все поверхности |
| `apps/webapp/src/modules/platform-analytics/ports.ts` | `PlatformAnalyticsAudienceSpec` — псевдоним общего типа, а не вторая копия формы |
| `apps/webapp/src/modules/admin-platform-stats/{ports,service}.ts` | порт: два метода → один `readStats`; сервис раздаёт секции экранам |
| `apps/webapp/src/infra/repos/inMemoryAdminPlatformUserStats.ts` | приведён к новому порту |
| оба `route.ts` | `loadDoctorAnalyticsAudience()` → `loadPlatformAnalyticsAudienceSpec()`: спецификация служебных учёток вместо списка их id |
| `apps/webapp/src/app/api/api.md` | указан источник чисел |

Тесты: `pgAdminPlatformUserStatsRoot.unit.test.ts`, `modules/admin-platform-stats/service.unit.test.ts`,
`deploy/postgres/privileges/platform-user-stats-root.devDbProof.test.mjs` (opt-in, живой).

### Разбор прав корня (AGENTS §1 «Перед приземлением миграции»)

Тело исполняется владельцем шва `app_seam_platform_analytics_owner` (существующим). Читает:

1. `public.platform_users` — SELECT (`id`, `role`, `created_at`, `merged_at`, `merged_into_id`,
   `is_archived`). У шва уже были все, кроме `merged_at`; он добавлен объявлением в этой ветке.
2. `public.user_channel_bindings` — SELECT (`user_id`, `channel_code`, `external_id`, `created_at`,
   `bot_blocked_at`). У шва были первые три; `created_at` и `bot_blocked_at` добавлены объявлением.
3. `public.user_contacts` — SELECT канонических колонок; у шва уже есть через
   `CANONICAL_CONTACT_SURFACE_CORRECTIONS`.

Записи нет, `FOR UPDATE`/`FOR SHARE` нет, новых отношений и новых seam-ролей нет. Индексов на
горячую колонку не требуется: новых колонок и таблиц миграция не заводит.

## 3. Проверка границы (п.4 брифа)

Дифф грантов между `HEAD` и веткой по обеим базам — единственная новая строка для платформенной
роли:

```
GRANT EXECUTE ON FUNCTION app.read_platform_user_stats(...) TO "app_platform_settings";
```

Ни одного нового **табличного** гранта `app_platform_settings` (было 69 строк, стало 70 — плюс
только EXECUTE). Остальные две новые строки диффа — колоночные гранты **владельцу шва**, не роли
экрана. Живая проверка того же в откаченной транзакции: `has_table_privilege` на
`user_channel_bindings` = `false`, `has_column_privilege` на `platform_users.role`/`.created_at` =
`false`, на `.id` = `true` (как и было).

## 4. Живое доказательство

`--execute` по DEV не делал (базу ведёт соседняя ветка).

- `bash deploy/host/migrate-dev.sh --preflight` → **PASS**, `pending=1`, функция создана от
  `app_seam_platform_analytics_owner`, транзакция откачена.
- `RUN_PLATFORM_USER_STATS_ROOT_DB=1 node --test
  deploy/postgres/privileges/platform-user-stats-root.devDbProof.test.mjs` → **3/3 pass**. Внутри
  одной откаченной транзакции: тело миграции + строки доступа из сгенерированного артефакта +
  строка каталога возможностей, затем настоящий путь порта (`SET LOCAL SESSION AUTHORIZATION
  bcb_dev_webapp_global_admin` → `app.begin_port_context`) и вызов корня под
  `app_platform_settings`.
  - **числа настоящие и те же, что считал прежний код**: окно 01.07–22.08 в `Europe/Moscow` —
    регистрации **24**, слияния **4**, подписчиков до начала окна **101**; оракул (прежний SQL кода,
    слово в слово, от суперпользователя) даёт `24|4|101`. Разбивка по дням непустая.
  - **инъекция неисправности красит проверку**: тот же сценарий без `GRANT EXECUTE` падает
    `permission denied for function read_platform_user_stats`.
  - **граница держится** (см. §3).
- После прогона DEV чист: `to_regprocedure(...)` = NULL, строк
  `analytics.platform-user-stats.read` в `app_ext.port_context_capabilities` — 0 (всего 265, как до),
  колоночный грант владельцу шва отсутствует.

**Чего живая проверка НЕ покрывает и почему:** HTTP-код 200 от самих двух маршрутов не снят —
для этого корню, грантам и строке каталога надо ФИЗИЧЕСКИ оказаться в DEV, то есть `--execute`,
который бриф запрещает. Покрыто вместо этого: SQL-уровень доказан живьём под тем же принципалом,
а маршрут→сервис→порт→литеральная идентичность двери — unit-тестами. HTTP-подтверждение возьмётся
на TEST при деплое ведущим.

## 5. Проверки

| Проверка | Результат |
|---|---|
| `pnpm test:db-privileges` | 208 тестов, **143 pass / 0 fail** / 65 skip (skip — devDbProof без opt-in) |
| `generate-cli.mjs --all` + `--check` | побайтно совпадает |
| `generate-cli.mjs --all --port-context-only` + `--check --port-context-only` | побайтно совпадает |
| `generate-cli.mjs --census` / `--gaps` | ok, `gaps=0`, `unresolved=0` |
| `migration-order` / `port-context-catalog` / `named-root-column-mapping` | 22 / 9 / 2 pass |
| vitest (новые + соседние затронутые суиты) | 8 файлов, **21 pass / 0 fail** (6 skip — devDbProof) |
| `tsc --noEmit -p apps/webapp` | чисто |
| `eslint` по изменённым файлам | чисто |
| `tsc --strict -p deploy/postgres/privileges` | 2 ошибки, **обе были на `HEAD` до моей правки** (`declaration.ts` строки 3642/6731 в версии HEAD: два `evidence`-литерала не из объединения типов). Мою правку не касаются, не чинил — не мой скоуп |

## НЕ СДЕЛАНО

1. **`/api/admin/product-analytics` остаётся 500.** Причина — п.1 брифа: экран показывает строки
   людей поимённо, это находка и вопрос ведущему (§2.3 брифа выше). Не «не успел», а «нельзя без
   решения владельца».
2. **HTTP 200 самих маршрутов живьём не снят** — требует `--execute` по DEV, запрещённого брифом
   (§4 выше).
3. **Два пред-существующих `tsc`-отказа в `declaration.ts`** не чинил (см. таблицу проверок).
4. **Расхождение в определении «служебной учётки»** оставлено сознательно: прежний код отсекал по
   ПЕРВИЧНОМУ телефону (`is_primary = true`, `drizzlePrimaryPhoneCol`), корень-агрегат — по любому
   телефонному контакту, как это уже делает соседний корень дашборда. На DEV разницы в числах нет
   (оракул совпал до единицы). Сводить два правила в одно — отдельная работа, называю её вслух, а
   не делаю заодно.
5. `docs/_TODO/.../WORK_ORDER.md` галочки не ставил — их ставит ведущий.
