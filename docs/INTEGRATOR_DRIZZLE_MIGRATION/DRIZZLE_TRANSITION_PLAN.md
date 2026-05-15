# План перехода оставшегося сырого SQL на Drizzle (Wave 2)

**Дата:** 2026-05-15 (обновление оценки и приоритетов)  
**Связанные документы:** [инвентаризация](./RAW_SQL_INVENTORY.md), [лог](./LOG.md), закрытый мастер-план P1–P4 [integrator_drizzle_migration_master.plan.md](../../.cursor/plans/integrator_drizzle_migration_master.plan.md) (в т.ч. раздел **Wave 2** и todo `wave-2-doc-sync`).

## Контекст: что уже сделано

Мастер-план **P1–P4 по интегратору закрыт** (`status: completed` в YAML мастера): простые репозитории, projection outbox + job queue, доменные repos, сложный SQL (`messageThreads`, `channelUsers`, `mergeIntegratorUsers` и т.д. по [карте мастера](../../.cursor/plans/integrator_drizzle_migration_master.plan.md)).

**Этот документ** описывает **следующую волну** — всё, что **по-прежнему** использует сырой `db.query` / `pool.query` / `client.query` (см. инвентаризацию), плюс осознанное сохранение `execute(sql\`…\`)` / `runIntegratorSql` там, где ORM не окупается.

## Оценка предыдущей версии плана (исправлено)

| Замечание | Действие |
|-----------|----------|
| Не было явной связи с **завершённым** мастер-планом P1–P4 | Добавлен блок «Контекст» и колонка «Связь с мастер-планом» в фазах. |
| В DoD смешаны каналы записи **`public.system_settings`** (webapp `updateSetting`) и **`integrator.system_settings`** (signed sync в интегратор) | DoD разделён по каналам; для integrator webhook — отдельные проверки зеркала. |
| В инвентаризации для `integrator_push_outbox` ошибочно указана «схема integrator» | Таблица в **`public`** (имя с префиксом `integrator_`); в webapp уже есть Drizzle-модель в `db/schema`. |
| «Ординальная оценка трудозатрат» читалась неоднозначно | Заменено на **ранг приоритета** (1 = раньше в очереди) + грубый **размер** (S/M/L). |
| Не зафиксировано ограничение **webapp modules vs infra** | Добавлен раздел «Архитектура webapp» — перенос только через `infra/repos`, модули без прямого DB. |
| `branchTimezone` занижен как «Н» | JOIN по `public.booking_branches` / `public.branches` из процесса integrator — **кросс-схемная** логика; в инвентаризации повышена сложность. |

## Легенда оценок

| Поле | Значения |
|------|----------|
| **Сложность** | **Н** — прямой маппинг на `select`/`insert`/`update`/`delete` + `eq`/`and`; **С** — транзакции, динамика, несколько таблиц, агрегаты, чтение `public` из integrator-процесса; **В** — `FOR UPDATE SKIP LOCKED`, крупные CTE, динамический SQL строкой, merge/purge по многим таблицам. |
| **Вариант** | Целевая форма после работ (см. инвентаризацию). |
| **Риски** | Точки регресса / эксплуатации. |

## Архитектура webapp (обязательное правило)

По правилам репозитория **`modules/*` не импортирует `@/infra/db` и репозитории напрямую**. Перенос сырого SQL на Drizzle в webapp = работа в **`apps/webapp/src/infra/repos/*`** (и тонкие вызовы из `route.ts` / server actions / `buildAppDeps`), без «просачивания» Drizzle в модули.

## Цели и границы

1. **Интегратор:** убрать остатки **`DbPort.query` с произвольными строками** там, где это даст типобезопасность; **claim**-участки с `SKIP LOCKED` по умолчанию оставить в **`getIntegratorDrizzleSession` + `execute` с шаблоном `sql` из drizzle-orm** (как в P2), а не «переписать ради красоты».  
2. **Webapp:** миграция **пакетами по домену** через `infra/repos` + тесты портов; не смешивать пулы webapp и интегратора без явной причины.  
3. **Инфра навсегда на `pg`:** раннер SQL-миграций, часть one-off ops-скриптов — **вне** цели «весь проект на Drizzle builder».

## Фазы (Wave 2 — порядок работ)

| Ранг | Размер | Фаза | Область | Связь с мастер-планом | Комментарий |
|------|--------|------|---------|------------------------|-------------|
| 1 | M | **I** | Integrator: `outgoingDeliveryQueue`, `bookingProfilesRepo`, оставшиеся простые `db.query` в repos + config reads | **После P1–P4** — хвост не вошедший в этапы | `bookingProfilesRepo` — высокий функциональный риск (Rubitime, дубли каталогов); см. [LOG](./LOG.md), [TODO](../TODO.md). |
| 2 | S | **II** | `projectionHealth.ts` ↔ `scripts/projection-health.mjs` — одна логика | Вне этапов P2 (скрипт оставался) | Сначала **унификация** цифр (DoD фазы); перенос агрегатов на Drizzle `groupBy` — после закрытия расхождений с CLI и отдельной постановки. |
| 3 | M | **III** | Advisory locks: integrator (`rubitimeApiThrottle`, `schedulerLocks`) + webapp (`userLifecycleLock`, multipart, intake, diary purge) | Частично пересекается с «сложным SQL», но отдельный риск session/transaction | Документировать тип блокировки (`xact` vs session) при переносе. |
| 4 | L | **IV** | Webapp: напоминания `pgReminder*` | Вне integrator master | Сильная связь с `integrator_user_id`; нужны интеграционные тесты. |
| 5 | L | **V** | Webapp: медиа (S3, transcode, multipart, preview worker) | Вне integrator master | Advisory + статусы + внешний S3 — высокий регрессионный риск. |
| 6 | L | **VI** | Webapp: LFK каталог / дневник / назначения | Вне integrator master | Динамические list-SQL — последним слоем после стабилизации CRUD. |
| 7 | M | **VII** | Webapp: auth + rate limits | Вне integrator master | Hot path; контрактные тесты + нагрузочные выборочно. |
| 8 | L | **VIII** | `packages/platform-merge`, `booking-rubitime-sync` | Зависимости webapp + integrator flows | Менять только с явным semver/consumer-тестами. |
| 9 | M | **IX** | `apps/media-worker` | Аналог очередей | Унификация claim-паттерна с webapp-транскодом — после фазы **V** или в рамках фазы **X**, если приоритет на общий паттерн очередей. |
| 10 | M | **X** | Прочие `pg*` + scripts | Низкий приоритет | Скрипты оставить на `pg` допустимо; бизнес-код — по мере касания. |

## Сквозные риски

| Риск | Митигация |
|------|-----------|
| Регресс **очередей** (`SKIP LOCKED`, порядок, индексы) | `EXPLAIN` до/после; тест на claim под конкуренцией; не удалять старый SQL из git history до релиза. |
| **Две схемы** (`public` / `integrator`) в одном кластере | Qualified имена / `pgSchema` в Drizzle; комментарии в коде для чтений `public.*` из integrator (как в `branchTimezone.ts`). |
| **Два канала `system_settings`** | Webapp админка: **`updateSetting`** → sync в integrator; integrator: **signed** `settingsSyncRoute` пишет в `integrator.system_settings`. Миграция на Drizzle не должна нарушить этот контракт. |
| **Динамический SQL** | Whitelist идентификаторов; предпочитать `sql` tagged + параметры, не конкатенацию строк. |
| **Дубль определений схемы** integrator vs webapp | Backlog общего пакета схемы из LOG; до выноса — чеклист «колонка в колонку» при любых DDL. |

## Критерии «готово» для участка кода

- Нет **прямого** `pool.query` / `client.query` в **целевом** доменном участке **или** в репозитории есть **ADR/комментарий** «почему остаётся `pg` / `execute(sql)`» + тест на поведение.  
- **Webapp → интегратор (настройки и секреты):** записи админских ключей по-прежнему через **`updateSetting`** / канон зеркалирования (см. `.cursor/rules/system-settings-integrator-mirror.mdc`).  
- **Integrator signed settings sync:** после перевода на Drizzle — те же колонки `ON CONFLICT`, те же инвалидации кэшей (`invalidateAppBaseUrlCache` и т.д.).  
- **Outbox доставки в интегратор:** строки `public.integrator_push_outbox` — при переводе на Drizzle использовать **существующую** таблицу из `apps/webapp/db/schema`, не плодить второй дубль определения без нужды.  
- CI: `pnpm` typecheck/test по затронутым пакетам; для очередей — тест идемпотентности/claim.

## Связь с инвентаризацией

В [RAW_SQL_INVENTORY.md](./RAW_SQL_INVENTORY.md) у каждой строки таблиц — **Сложн.**, **Вариант**, **Риски** (синхронизированы с исправлениями этой версии). План задаёт **порядок волн** и сквозные риски; инвентаризация — построчный чек-лист файлов.
