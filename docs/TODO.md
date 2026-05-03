# Project backlog (не срочные улучшения)

Краткий список отложенных задач по безопасности, лимитам и наблюдаемости. Реализация по приоритетам продукт/ops.

## Webapp-first phone bind — общий модуль TX (дублирование кода)

- **Проблема:** логика TX привязки телефона продублирована в integrator (`messengerPhonePublicBind`, `writePort` `user.phone.link`) и в webapp (`messengerPhoneHttpBindExecute.ts` для опционального `POST /api/integrator/messenger-phone/bind`), т.к. Next.js не должен импортировать `apps/integrator` с `.js`-путями.
- **Цель:** вынести общий SQL и хелперы в workspace-пакет `packages/*` (новый каталог в монорепо), подключить из `apps/integrator` и `apps/webapp`; минимальный интерфейс `query()` / TX; один набор регрессионных тестов на пакет + существующие тесты маршрута и `writePort`.
- **Ссылки:** `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/AGENT_AND_AUDIT_LOG.md` (аудит 2026-04-13, п.1); хвосты для других агентов: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/NEXT_AGENT_TASKS.md`.

## Rubitime API2 — фаза 2 (очередь, async UX, мультислоты)

- **Контекст:** фаза 1 (глобальный pacing 5.5s для api2) закрыта; фаза 2 — отдельная инициатива: очередь воркера, async создание записи с поллингом («выполняется запись»), мультивыбор слотов и последовательные create в воркере с тем же pacing.
- **Бэклог и спецификация (репозиторий):** [`docs/REPORTS/RUBITIME_API2_PACING_AND_PHASE2_BACKLOG.md`](REPORTS/RUBITIME_API2_PACING_AND_PHASE2_BACKLOG.md) (§ «Фаза 2 — backlog»).
- **План Cursor (вне репо, IDE):** `~/.cursor/plans/rubitime_queue_+_multi-slot_ae5a569b.plan.md` — полный текст и mermaid; фаза 1 в плане помечена выполненной, фаза 2 описана в теле файла.

## Doctor catalogs — черновики отдельно от архива

- **Контекст:** в doctor-каталогах назначений UI списка сейчас показывает только архивность (`Активные` / `Архив`). У шаблонов программ, комплексов ЛФК и курсов часть сущностей всё ещё хранит технический enum `draft | published | archived`, где готовность/публикация смешана с архивом.
- **Решение на сейчас:** не добавлять в списковые тулбары `Черновики`, `Опубликованные`, `В работе` и не возвращать пользовательский режим `Все`, пока модель не разделена.
- **TODO:** если черновики понадобятся как продуктовый сценарий, переделать модель на две независимые оси: `is_archived` / archive scope отдельно и readiness/publication status отдельно. После этого добавить отдельный фильтр черновиков/публикации, миграцию данных, сервисные инварианты, UI и тесты.
- **Ссылка:** `docs/APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md` (§ «Примечание (archive-фильтр и черновики, 2026-05-02)»).

## Security / Auth

- Сделать OAuth `state` одноразовым (хранить used `state.n` или nonce с TTL в Redis/БД).
- Добавить Redis/БД для защиты от replay в пределах TTL подписанного state.
- Унифицировать обработку ошибок OAuth (JSON vs redirect) между callback-роутами.
- Проверить все OAuth callback-роуты на единый контракт ответа.

## Rate limiting

- Расширить ключ rate limit для OAuth start (например IP + provider или отдельный ключ на route).
- Ввести конфигурируемые лимиты (env / `system_settings`) вместо констант в коде.

## Config / Secrets

- Убрать чтение полных секретов в `GET /api/auth/oauth/providers` — проверка «настроено» без вытягивания значения в handler.
- Слой «config validation» / exists-only accessors для admin keys.
- Проверить логирование `integrationRuntime` и смежных путей на утечки секретов.

## Observability

- Метрики OAuth flow (start / success / exchange_failed).
- Логировать повторные попытки callback (по возможности без PII).
- Логировать/метрить срабатывания rate limit (hits, 429).
