# Project backlog (не срочные улучшения)

Краткий список отложенных задач по безопасности, лимитам и наблюдаемости. Реализация по приоритетам продукт/ops.

## Cursor-планы и доки (сводка)

- **Репозиторий** vs **домашний каталог Cursor:** планы **в монорепо** — `<репо>/.cursor/plans/` (см. ниже и [`.cursor/plans/archive/README.md`](../.cursor/plans/archive/README.md)); планы **на машине** — `~/.cursor/plans`. Не смешивать: пояснение в начале [`CURSOR_PLANS_REVIEW_2026-05-01.md`](CURSOR_PLANS_REVIEW_2026-05-01.md). Закрытый план MAX/TG pre-prod (integrator): [`.cursor/plans/archive/max_tg_pre-prod_automation.plan.md`](../.cursor/plans/archive/max_tg_pre-prod_automation.plan.md) · журнал [`ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md`](ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md).

- **Активные планы** (корень репозитория): `.cursor/plans/integrator_drizzle_migration_master.plan.md` + `integrator_drizzle_phase_*.plan.md` — см. `docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`.
- **Архив закрытых планов (репозиторий):** `.cursor/plans/archive/` — [README](../.cursor/plans/archive/README.md) (в т.ч. `telegram_menu_reply_admin.plan.md` — меню Telegram админ/пользователь 2026-05).
- **Архив закрытых планов (домашний каталог Cursor):** `~/.cursor/plans/archive/2026-05-01-closed/`, `~/.cursor/plans/archive/2026-05-14-closed/` (корень `~/.cursor/plans/*.plan.md` — только открытые или без полностью закрытого набора structured `todos`).
- **Архивные инициативы docs:** `docs/archive/2026-05-initiatives/` (в т.ч. WEBAPP Drizzle unification, Patient Reminder UX, страница программы, LFK expand — оглавление в [docs/README.md](README.md) §Архив).
- **Закрытые пункты этого backlog (история):** [archive/TODO_BACKLOG_CLOSED_HISTORY.md](archive/TODO_BACKLOG_CLOSED_HISTORY.md).

## Деплой webapp — blue/green (ближайшее время, ops)

- **Проблема:** при выкате новой сборки Next.js **идентификаторы Server Actions** в клиентском бандле не совпадают с картой экшенов в уже запущенном процессе. Если за балансировщиком одновременно крутятся **разные версии** webapp, один и тот же пользователь может получить HTML/JS от версии A, а следующий запрос (POST экшена) — на инстанс версии B → в логах `Failed to find Server Action "…"`, в UI — сбой после действия.
- **Дополнительно:** вкладка, открытая **до** деплоя, держит старый JS; после переключения трафика на новый билд первый же сабмит может ударить в новый процесс со старым ID — пользователю достаточно **полного обновления страницы** (это ожидаемо, не баг приложения). Blue/green не отменяет этот эффект для долго открытых вкладок, но **убирает смешение версий между запросами одной сессии**.
- **TODO:** ввести для **bersoncarebot-webapp-prod** (и при необходимости staging) схему **blue/green** или эквивалент: на время переключения трафика не смешивать старый и новый deployment за одним виртуальным хостом; зафиксировать шаги в `deploy/` / `SERVER CONVENTIONS` / runbook; при наличии CDN — согласовать инвалидацию кэша статики с cutover.
- **Связь:** сообщение Next.js [failed-to-find-server-action](https://nextjs.org/docs/messages/failed-to-find-server-action); шум с литералом `"x"` в логах может быть отдельно от ботов, но смешение версий — реальный prod-риск при rolling без стиковости.

## Медиа / видео — авторизация и права на поток (post-prod)

- **Проблема:** `GET /api/media/[id]`, `GET /api/media/[id]/playback`, `GET /api/media/[id]/preview/[size]` требуют только **любую** валидную сессию плюс «читаемую» строку `media_files` (и ключ в хранилище). Нет проверки, что файл относится к показанному пациенту контенту, этапу программы лечения или другому scope.
- **Риск:** утечка UUID (URL, логи, Referer) + залогиненный пользователь → доступ к байтам вне продуктового UI.
- **Аудит (текущее поведение):** `docs/ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md`.
- **TODO:** после стабилизации prod — продуктовая модель (например capability token, привязка к сущности, отдельный patient-scoped endpoint, или согласованное осознанное исключение для каталожного контента); единая точка расширения `assertMediaPlaybackAccess` / resolver playback; регрессионные тесты на запрет чужого UUID для роли `client`.

## URL / UX — UUID в адресной строке браузера (post-prod)

- **Проблема:** во многих экранах webapp в query (`selected`, `highlight`, `branchServiceId`, `trackingId`, `complexId` и др.) и в сегментах пути видны **сырые UUID** — длинные, нечитаемые, при утечке URL (история, логи, Referer) дополнительно раскрывают идентификаторы сущностей.
- **Примечание по безопасности:** сам UUID в URL не заменяет проверку прав на сервере (IDOR по-прежнему про авторизацию); задача в первую очередь про **UX, приватность в ссылках и единообразие**, при необходимости — **slug / короткий стабильный ref** в БД и слой «ключ из URL → внутренний id».
- **Зоны кода (ориентиры):** общая синхронизация каталогов врача — `DoctorCatalogFiltersForm`, список клиентов и `selected` — `DoctorClientsPanel`, `ClientListLink`; каталоги упражнений/шаблонов ЛФК/тестов/рекомендаций/шаблонов программ — `*PageClient.tsx` в `apps/webapp/src/app/app/doctor/`; пациент: `highlight` на курсах, запись (`branchServiceId`), журналы дневника (`trackingId` / `complexId`).
- **TODO:** после стабилизации prod — **принять продуктовое решение** (что заменяем, что оставляем, редиректы со старых закладок), спроектировать поля/маппинг, миграции при необходимости, единый контракт для новых ссылок.

## Webapp-first phone bind — общий модуль TX (дублирование кода)

- **Проблема:** логика TX привязки телефона продублирована в integrator (`messengerPhonePublicBind`, `writePort` `user.phone.link`) и в webapp (`messengerPhoneHttpBindExecute.ts` для опционального `POST /api/integrator/messenger-phone/bind`), т.к. Next.js не должен импортировать `apps/integrator` с `.js`-путями.
- **Цель:** вынести общий SQL и хелперы в workspace-пакет `packages/*` (новый каталог в монорепо), подключить из `apps/integrator` и `apps/webapp`; минимальный интерфейс `query()` / TX; один набор регрессионных тестов на пакет + существующие тесты маршрута и `writePort`.
- **Ссылки:** `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/AGENT_AND_AUDIT_LOG.md` (аудит 2026-04-13, п.1); хвосты для других агентов: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/NEXT_AGENT_TASKS.md`.

## Rubitime API2 — фаза 2 (очередь, async UX, мультислоты)

- **Контекст:** фаза 1 (глобальный pacing 5.5s для api2) закрыта; фаза 2 — отдельная инициатива: очередь воркера, async создание записи с поллингом («выполняется запись»), мультивыбор слотов и последовательные create в воркере с тем же pacing.
- **Бэклог и спецификация (репозиторий):** [`docs/REPORTS/RUBITIME_API2_PACING_AND_PHASE2_BACKLOG.md`](REPORTS/RUBITIME_API2_PACING_AND_PHASE2_BACKLOG.md) (§ «Фаза 2 — backlog»).
- **План Cursor (архив IDE):** `~/.cursor/plans/archive/2026-05-01-closed/rubitime_queue_+_multi-slot_ae5a569b.plan.md` — полный текст и mermaid; фаза 1 в плане помечена выполненной, фаза 2 описана в теле файла.

## Integrator — один каталог записи (убрать дубль `integrator.rubitime_*`)

- **Проблема:** в unified PostgreSQL интегратор всё ещё держит **параллельный справочник** `rubitime_branches`, `rubitime_services`, `rubitime_cooperators`, `rubitime_booking_profiles` (surrogate `id`, v1-профили) и **signed M2M** `POST/GET /api/bersoncare/rubitime/admin/*` (`adminM2mRoute.ts` + `bookingProfilesRepo.ts`), дублируя **канон** в webapp: `public.booking_*`, `public.branches` и админку `/api/admin/booking-catalog/*`.
- **Уже сделано (2026-05):** разрешение IANA для слотов/ингеста — **`public.booking_branches` / `public.branches`**, не `integrator.rubitime_branches.timezone` (`apps/integrator/src/infra/db/branchTimezone.ts`).
- **TODO (крупный рефакторинг):** перевести чтение **v1** (`resolveBookingProfile`, `pickAnyActiveRubitimeScheduleTriple`, operator health) на **каталог webapp** или зафиксировать **отказ от v1** в пользу только M2M v2; переподключить или удалить **integrator admin M2M** к записям в `public` (без второй копии данных); миграция/бэкфилл профилей; затем DDL — дроп или опустошение `integrator.rubitime_*` после cutover. Связка с Drizzle-репозиториями: `docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`, планы `integrator_drizzle_phase_*.plan.md`.

## Doctor catalogs — черновики отдельно от архива

- **Контекст:** в doctor-каталогах назначений UI списка сейчас показывает только архивность (`Активные` / `Архив`). У шаблонов программ, комплексов ЛФК и курсов часть сущностей всё ещё хранит технический enum `draft | published | archived`, где готовность/публикация смешана с архивом.
- **Решение на сейчас:** не добавлять в списковые тулбары `Черновики`, `Опубликованные`, `В работе` и не возвращать пользовательский режим `Все`, пока модель не разделена.
- **TODO:** если черновики понадобятся как продуктовый сценарий, переделать модель на две независимые оси: `is_archived` / archive scope отдельно и readiness/publication status отдельно. После этого добавить отдельный фильтр черновиков/публикации, миграцию данных, сервисные инварианты, UI и тесты.
- **Ссылка:** `docs/APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md` (§ «Примечание (archive-фильтр и черновики, 2026-05-02)»).

## Treatment program — дефолт actionable/persistent из каталога и строки шаблона

- **Сейчас (2026-05-08):** при назначении шаблона и при добавлении рекомендации в инстанс новые строки получают **`is_actionable = false`** (постоянная). Врач включает «Требует выполнения» в карточке элемента программы. В таблице **`recommendations`** и в **`treatment_program_template_stage_items`** отдельного поля режима нет.
- **TODO:** хранить предпочтение в каталоге рекомендаций и/или в строке шаблона (`settings` или колонка), прокидывать при создании строки экземпляра; явно зафиксировать политику при смене справочника (обновлять ли уже назначенные программы). См. обсуждение O4 в [`PROGRAM_PATIENT_SHAPE_PLAN.md`](APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) (каталог без `default_is_actionable` в A2).

## Treatment program — post-MVP controls and completion feedback

- **Контекст:** в MVP по страницам `treatment-programs` принято не показывать ложную процентную аналитику и считать дату ожидаемого контроля от старта этапа (`started_at + expected_duration_days`).
- **TODO 1:** перейти от одной вычисляемой даты к модели нескольких контролей в рамках этапа (история, перенос, следующий контроль, отметка прохождения).
- **TODO 2:** добавить комментарий пациента к факту выполнения `exercise` / `lesson` / actionable `recommendation` (сейчас заметка есть только в LFK post-session).
- **Ссылки:** `docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md` (§1.0, §1.1a, §8), `docs/BACKLOG_TAILS.md` («Хвосты по Плану лечения / Курсам»).

## Security / Auth

- **Видео / медиа по UUID (post-prod):** верхний раздел этого файла («Медиа / видео — авторизация и права на поток») и `docs/ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md`.
- Сделать OAuth `state` одноразовым (хранить used `state.n` или nonce с TTL в Redis/БД).
- Добавить Redis/БД для защиты от replay в пределах TTL подписанного state.
- Унифицировать обработку ошибок OAuth (JSON vs redirect) между callback-роутами.
- Проверить все OAuth callback-роуты на единый контракт ответа.

## Admin / platform identity — in-app merge & purge (без relay)

- **Контекст:** внешняя доставка инцидентов идентичности (TG/Max по **`admin_incident_alert_config`**) закрыта — [`.cursor/plans/archive/admin_incident_alerts.plan.md`](../.cursor/plans/archive/admin_incident_alerts.plan.md). Отдельно остаётся **только админский UI**, без этого ключа и без relay.
- **TODO:** при ошибке **ручного merge** в админке — **toast** (оператор уже в контексте действия). При **частичном purge** / **отложенном** сбое внешней очистки — как и задумано: **`admin_audit_log`** + in-app: мгновенный сбой — **toast**; отложенный (post-commit) — **заметка на экране «сегодня»** админа, не терять при уходе со страницы.
- **Спека / backlog:** [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md`](OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md) §8.

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
