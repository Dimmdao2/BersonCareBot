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

- Роль приложения integrator: `search_path` вида `integrator, public` (или квалифицированные имена `public.table` / `integrator.table`).
- Права: `USAGE` на обе схемы и минимальные `GRANT` на нужные таблицы/sequences (не `GRANT ALL ON DATABASE` без необходимости).

## Что остаётся HTTP

- **Webapp → integrator API** (`INTEGRATOR_API_URL`): исходящие действия бота, настройки sync, merge и т.д. — это **вызовы сервиса**, не дублирование «второй копии» канона в другой БД.
- **Integrator → webapp HTTP** — только там, где контракт ещё не переведён на общий SQL; такие вызовы **снимать по одному**, не расширять для новых сценариев записи канона.

## Документация и скрипты

- Старые упоминания «две БД», `INTEGRATOR_DATABASE_URL` как **обязательно другой** хост/база — **legacy** для cutover/backfill-скриптов и dev, пока локально не выровняли.
- `deploy/postgres/postgres-backup.sh`: если `DATABASE_URL` в `api.prod` и `webapp.prod` **совпадают**, получится **два одинаковых дампа** — имеет смысл упростить скрипт (один проход).
- Подробности эксплуатации: `SERVER CONVENTIONS.md`, env: `deploy/env/README.md`.

## Связанные документы

- `CONFIGURATION_ENV_VS_DATABASE.md` — env, `system_settings`, зеркало настроек.
- План привязки телефона / TX-first: `.cursor/plans/webapp-first_phone_bind_5069b809.plan.md` (в репозитории планов Cursor).
