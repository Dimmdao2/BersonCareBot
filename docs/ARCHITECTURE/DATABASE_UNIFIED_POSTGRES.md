# Единая PostgreSQL: webapp + integrator (актуальная модель)

**Статус:** механизм обновлён (production cutover **2026-04**). Раньше в документации и правилах фигурировали **две отдельные базы** (`tgcarebot` / `bcb_webapp_prod` и т.п.) и обмен данными **HTTP M2M** + **projection worker** с ретраями как основной путь. Сейчас целевой runtime — **одна** база данных на кластер приложения.

## Суть

| Было (legacy) | Стало (целевое) |
|---------------|-----------------|
| Две БД: integrator и webapp | **Одна** БД: тот же `DATABASE_URL` в `api.prod` и `webapp.prod` |
| Канон пациента только в webapp БД | Канон в схеме **`public`** (`platform_users`, `user_channel_bindings`, …) |
| Таблицы бота в отдельной БД | Таблицы integrator в схеме **`integrator`** (`users`, `identities`, `projection_outbox`, …) |
| Проекция событий integrator → webapp по **HTTP** (`POST /api/integrator/events`) как основной путь | **Прямые SQL** из integrator в `public` там, где код уже переведён; **без** лишнего round-trip между процессами для этих путей |
| Worker + `projection_outbox` + ретраи как обязательная часть каждого изменения | **Очередь / worker** — **fallback** на временные сбои (сеть/процесс/БД) и **наследие** для событий, которые ещё не переведены на прямой SQL; не позиционировать как основной механизм для новых фич в одной БД |

## Подключение

- **Одна база, одна роль, две схемы:** в целевом production **`DATABASE_URL` в `api.prod` и `webapp.prod` совпадает** — одна строка подключения, **один пользователь PostgreSQL** (роль БД) с правами на схемы **`public`** и **`integrator`**. Разделение данных — только именами схем и `search_path` / квалифицированными именами в SQL, не отдельными URL или учётками для webapp и integrator.
- Роль приложения integrator: `search_path` вида `integrator, public` (или квалифицированные имена `public.table` / `integrator.table`).
- Права: `USAGE` на обе схемы и минимальные `GRANT` на нужные таблицы/sequences (не `GRANT ALL ON DATABASE` без необходимости). Миграции с `GRANT` в репозитории фиксируют **минимальный контракт** доступа integrator к `public`; при одной роли на обе схемы с уже достаточными правами они часто **не меняют** эффективные права, но остаются полезны для CI, отдельных окружений и сценария «миграции под другим пользователем».

## Что остаётся HTTP

- **Webapp → integrator API** (`INTEGRATOR_API_URL`): исходящие действия бота, настройки sync, merge и т.д. — это **вызовы сервиса**, не дублирование «второй копии» канона в другой БД.
- **Integrator → webapp HTTP** — только там, где контракт ещё не переведён на общий SQL; такие вызовы **снимать по одному**, не расширять для новых сценариев записи канона.

## Webapp → integrator SQL cleanup (purge / merge-preview)

- `getIntegratorPoolForPurge()` (`apps/webapp/src/infra/platformUserFullPurge.ts`) поднимает пул для post-commit `DELETE` в схеме **integrator** (`contacts`, `identities`, `users`, rubitime-таблицы и т.д.).
- В **unified** режиме, если отдельный `INTEGRATOR_DATABASE_URL` не задан, используется **`DATABASE_URL`** с параметром подключения `options=-c search_path=integrator,public`, чтобы неполные имена таблиц резолвились в `integrator.*`, а не в `public.*`.
- Если integrator-очистка **требовалась** (телефон ≥10 цифр, bindings telegram/max, или найденные integrator user id), но пула нет — `runStrictPurgePlatformUser` возвращает **`outcome: needs_retry`**, а не `completed` (`strictPlatformUserPurge.ts`).
- Журнал миграции и ops-SQL: [`INTEGRATOR_PLATFORM_USER_MIGRATION_EXECUTION_LOG.md`](./INTEGRATOR_PLATFORM_USER_MIGRATION_EXECUTION_LOG.md).

## Документация и скрипты

- Старые упоминания «две БД», `INTEGRATOR_DATABASE_URL` как **обязательно другой** хост/база — **legacy** для cutover/backfill-скриптов и dev, пока локально не выровняли.
- `deploy/postgres/postgres-backup.sh`: если `DATABASE_URL` в `api.prod` и `webapp.prod` **совпадают**, получится **два одинаковых дампа** — имеет смысл упростить скрипт (один проход).
- Подробности эксплуатации: `SERVER CONVENTIONS.md`, env: `deploy/env/README.md`.

## Связанные документы

- `CONFIGURATION_ENV_VS_DATABASE.md` — env, `system_settings`, зеркало настроек.
- План привязки телефона / TX-first: `docs/WEBAPP_FIRST_PHONE_BIND/MASTER_PLAN.md` · снимок reason/UX: `docs/WEBAPP_FIRST_PHONE_BIND/PRODUCT_REASONS_AND_UX_TABLE.md` (полный Cursor-план — опционально в `~/.cursor/plans/webapp-first_phone_bind_5069b809.plan.md`).
