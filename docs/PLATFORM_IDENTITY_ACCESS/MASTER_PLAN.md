# Platform Identity & Access — генеральный план инициативы

## 1. Проблема

Сегодня в `apps/webapp` и смежных контурах:

- Идентичность и телефон размазаны по **cookie**, **отдельным guards на страницах**, **API** (`getCurrentSession`, точечные проверки `phone`), **интеграторским событиям** и **`findOrCreateByChannelBinding`** (создание «лишней» строки `platform_users` до согласования с каноном из Rubitime/интегратора).
- Возможны **повторный bind-phone** при мульти-канале, хотя у **канона** телефон уже есть.
- **Legacy** `client` без телефона не имеют единой политики: часть UI может вести себя как «полный пациент».

Нужна **единая платформенная** модель: канон из БД → вычисляемый **tier** (для `client`: guest / onboarding / patient) → доступ. Подробности — [`SPECIFICATION.md`](SPECIFICATION.md).

## 2. Обязательные артефакты (три модуля, не расползание по helpers)

Реализация **обязана** ввести и использовать **ровно три централизованных модуля** (конкретные пути в `apps/webapp/src/...` — в PR, но количество и ответственность фиксированы):

| Модуль | Ответственность |
|--------|-----------------|
| **Access context / tier** | Резолв канона из БД + вычисление `{ canonicalUserId, dbRole, tier, ... }`; единая точка для всех потребителей политики. |
| **Trusted phone policy** | Закрытый перечень: что считается **доверенной** активацией телефона для tier **patient**. **Не** любой `UPDATE phone_normalized` в репозитории автоматически становится trusted — только явно зарегистрированные пути. |
| **Route & API policy** | Whitelist маршрутов patient-зоны и согласованные правила для **API** / **server actions**: один и тот же access context, **без** варианта «UI через tier, API через старые точечные `if (!phone)`». |

Запрещено оставлять параллельные «guard-файлы» с дублирующей бизнес-логикой без делегирования в эти три модуля.

## 3. Цели (DoD инициативы)

1. **Три модуля** из §2 внедрены и используются всеми новыми/переведёнными проверками patient-контура.
2. **Канонический `userId` в session (cookie)** во **всех штатных точках входа**, где identity **уже может быть доверенно сопоставлена** с каноном, — записывается **канонический** id; **нельзя** оставлять лазейку «не определили — пусть layout потом поправит». Если доверенное сопоставление **ещё невозможно**, выданная сессия **явно** относится только к **onboarding** (и политика **не** допускает patient-доступ до прояснения канона и активации по trusted phone). Детали порядка — [`SPECIFICATION.md`](SPECIFICATION.md) §6.
3. **Onboarding:** запрет **бизнес-действий** на **сервере** (REST/route handlers, server actions), не только скрытие в UI; whitelist активации — **серверный**, общий с маршрутной политикой ([`SPECIFICATION.md`](SPECIFICATION.md) §4).
4. **Patient-зона** (страницы под `/app/patient/*`, **все** релевантные **API** и server actions): решения только через **один** access context из модуля tier; точечные проверки телефона без него — вытесняются.
5. **Multi-channel:** при доверенном телефоне у канона **нет** повторного bind-phone для доверенно привязанного канала; без доверенного сопоставления — **не угадывать** identity ([`SPECIFICATION.md`](SPECIFICATION.md) §10).
6. **Интегратор:** события не обходят tier на web; запись в БД согласована с каноном ([`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md)).
7. **Doctor/admin** без регрессий; **tier** для patient не смешивается с их доступом ([`SPECIFICATION.md`](SPECIFICATION.md) §3).
8. **Наблюдаемость:** структурированное логирование (или эквивалент) для отладки: **причина вычисленного tier**, факт **trusted / неTrusted** резолюции идентичности там, где это применимо, и **события** merge / `phone_bind` / критичных projection на входах — чтобы отвечать на вопрос «почему пользователь в onboarding, хотя телефон вроде был». Уровень логов и PII — по правилам проекта (без сырого телефона в логах при необходимости).
9. **Документация и тесты:** политика покрыта тестами; журнал [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md).

## 4. Non-goals (явно вне этой инициативы или позже)

- Физическое удаление legacy-строк `platform_users` без телефона.
- Замена двух БД (webapp / integrator) одной.
- Полная перестройка **Platform User Merge v2** — инициатива **использует** merge как подстраховку; см. [`../PLATFORM_USER_MERGE_V2/MASTER_PLAN.md`](../PLATFORM_USER_MERGE_V2/MASTER_PLAN.md).
- Изменение бизнес-правил Rubitime вне связи с идентичностью (отдельные доки).

## 5. Фазы работ (порядок: сначала identity resolution, потом session и политика поверхности)

Порядок выбран так, чтобы **не** крепить session и route policy поверх ещё «грязной» модели первичного сопоставления канал ↔ канон.

### Фаза A — Контракт и кодовая точка истины

- Ввести типы **access context**: `dbRole` + **`tier`** (tier осмыслен только для `client`; для doctor/admin — см. [`SPECIFICATION.md`](SPECIFICATION.md) §3).
- Реализовать модуль **access context / tier** и модуль **trusted phone policy** (закрытый перечень; любая новая запись в `phone_normalized` **не** считается trusted, пока не пройдёт через эту политику).
- Обновить [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) явным списком trusted-путей после реализации.

### Фаза B — Канал ↔ канон и trusted resolution (раньше была «фаза D»)

- Усилить **порядок** на первом входе мессенджера: до `INSERT` нового `platform_users` — поиск существующего канона (integrator token, `integrator_user_id`, уже известные bindings, доверенные сигналы из проекций — по продуктовым правилам).
- Интегратор: `contact.linked` / `user.upserted` / `ensureClientFromAppointmentProjection` **сокращают** дубли; не подменяют собой server-side политику tier на web, но кормят **канон**.
- Файлы-якоря: `apps/webapp/src/infra/repos/pgIdentityResolution.ts`, `apps/webapp/src/modules/integrator/events.ts`, `apps/webapp/src/infra/repos/pgUserProjection.ts`.
- **Статус:** фаза B по резолву канал ↔ канон **закрыта** (подтверждено повторным независимым аудитом 2026-04-10, P0/P1 по B не выявлено); детали и границы scope — [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) §10.

### Фаза C — Session и входы

- На путях **exchange** (integrator token, Telegram initData/widget, OAuth callback, phone confirm): после резолва канона — в cookie **канонический** `userId` везде, где штатный вход уже позволяет доверенно сопоставить identity; иначе — сессия только в рамках **onboarding** без patient-доступа (DoD §2).
- **Legacy `tg:…` vs UUID** — **архитектурное решение** в рамках этой фазы (не «только runbook»): либо временный **onboarding-only compatibility mode**, либо вытеснение из основных login flows и миграция сценариев; нельзя оставлять формат, влияющий на access decisions, без явного решения в коде/доке.
- Файлы-якоря: `apps/webapp/src/modules/auth/service.ts`, `apps/webapp/src/app/api/auth/**`.

**Статус (2026-04-10):** реализовано в коде — `sessionCanonicalUserIdPolicy.ts`; integrator exchange: UUID в `sub` без `bindings` → загрузка канона из БД (`pgUserByPhone.findByUserId`); OAuth/phone по-прежнему через `setSessionFromUser` с UUID; не-UUID сессии → `legacy_non_uuid_session` / onboarding-only для `client`. Полный DoD §2 (все edge-кейсы + единая route/API policy) — совместно с фазой D.

### Фаза C.02 — Единый patient business gate (между C и D)

**Зачем:** после фазы C и FIX по аудиту tier-проверка есть у части API (`requirePatientApiSessionWithPhone`, часть `/api/patient/*`) и server actions (`requirePatientAccessWithPhone`), но остаются **расхождения** со [`SPECIFICATION.md`](SPECIFICATION.md) §4 и [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) §7: бизнес-операции от имени пациента без **того же** критерия, что tier **`patient`** при наличии `DATABASE_URL` (fallback на телефон в сессии только без БД / ошибке БД — как в `requireRole.ts`).

**Скоуп (обязательный):**

1. **Запись на приём (booking)** — все Route Handlers под `apps/webapp/src/app/api/booking/**/*.ts`, выполняющие действия или выдачу данных **от имени пациента** (`create`, `cancel`, `my`, `slots`, `catalog/cities`, `catalog/services` и т.д. по факту дерева): заменить связку «только `getCurrentSession` + `canAccessPatient`» на **тот же** gate, что и `requirePatientApiSessionWithPhone` (или общий экспортируемый helper с идентичной семантикой JSON 401/403).
2. **Общий helper без дублирования** — либо экспортировать из `apps/webapp/src/app-layer/guards/requireRole.ts` обёртку уровня patient business API (на базе существующего `patientClientBusinessGate`), либо вынести тонкую функцию в `apps/webapp/src/modules/platform-access/` и вызывать из guards и из booking; **не** плодить третью копию условий tier/phone.
3. **`app/app/patient/layout.tsx`** — для роли `client` при `DATABASE_URL` согласовать редирект с **tier** (или делегировать в один helper с `requirePatientBusinessTierOrRedirect` / эквивалент), а не полагаться **только** на snapshot `session.user.phone` для путей вне allowlist (`apps/webapp/src/app-layer/guards/patientPhonePolicy.ts`).
4. **RSC под `/app/patient/*`**, где после `requirePatientAccess` идут запросы в БД по `userId`, а связанные server actions уже на `requirePatientAccessWithPhone` — устранить рассинхрон: усилить layout (п.3) и/или заменить guard на странице на тот же критерий, что и бизнес-действия (например напоминания, профиль, сообщения — сверка по факту grep).

**Документация инициативы:** обновить [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) §7 (политика API), §11 чек-лист — явные пункты **booking API**, **patient layout / RSC vs tier**; при закрытии — строка в [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) («закрыт хвост C.02: booking + layout/RSC»). [`MASTER_PLAN.md`](MASTER_PLAN.md) §5 D / DoD §4 — при необходимости отметить, что C.02 снял часть дублирования до ввода полного модуля route & API policy.

**Опционально:** переименовать `requirePatientApiSessionWithPhone` → например `requirePatientApiBusinessAccess`, оставив алиас/обёртку на время миграции; обновить `apps/webapp/src/app-layer/guards/guards.md`.

**Граница с фазой D:** C.02 — **выравнивание поверхностей и одного общего gate** под текущую реализацию в `requireRole` / platform-access; фаза D по-прежнему вводит **единый модуль route & API policy** (whitelist страниц и серверный onboarding) и вытесняет остаточные разрозненные guards.

**Статус C.02 (2026-04-10):** закрыто — `patientClientBusinessGate`; `/api/booking/*` и `/api/patient/*` на **`requirePatientApiBusinessAccess`** (алиас старого имени в `requireRole.ts`); layout: tier + `resolvePatientLayoutPathname` (Referer fallback); RSC напоминания/сообщения/intake — `requirePatientAccessWithPhone`; журнал [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md). Остаток к **фазе D:** единый модуль route & API policy.

### Фаза D — Route & API policy (единый модуль)

- Реализовать модуль **route & API policy**: whitelist guest / onboarding / patient для **страниц** (`/app/patient/*`) и **те же правила** для **API** и **server actions** через тот же access context.
- Вытеснить разрозненные guards и точечные `phone`-проверки в patient-контуре.
- Runbook-заметки при необходимости — дополнение к решению, не замена архитектурного выбора по `tg:…` (см. фазу C).

### Фаза E — Тесты, наблюдаемость, документация

- Тесты: OAuth без телефона → onboarding; канон с телефоном + новый канал → OTP → patient; legacy без телефона → onboarding; **негативные**: API/server action в onboarding без whitelist → отказ.
- Проверка наличия логирования по DoD §8.
- `pnpm run ci` зелёный; [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md); при необходимости обновление [`../README.md`](../README.md).

## 6. Риски и смягчение

| Риск | Смягчение |
|------|-----------|
| Регрессия doctor/admin | Access context: tier не применяется к их зонам; отдельные проверки роли без смешения с client-tier |
| Next.js: нельзя писать cookie в RSC | Перезапись session в route handlers / server actions; tier на каждом запросе из БД после резолва канона |
| Двойные каноны до merge | **Фаза B** + существующий merge; логирование по DoD §8 |
| Расхождение integrator vs webapp DB | `system_settings`, зеркалирование; без новых env для интеграционного конфига |
| Половинчатая централизация | DoD §1, §4: три модуля; запрет «только UI на tier» |

## 7. Эксплуатация и деплой

- Пути env и сервисов: [`../ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md).
- Миграции схемы (если понадобятся): `apps/webapp/migrations/` + описание в PR.

## 8. Связанные документы

| Документ | Зачем |
|----------|--------|
| [`SPECIFICATION.md`](SPECIFICATION.md) | Нормативная модель |
| [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) | Сценарии и карта кода |
| [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md) | Канон, `merged_into_id` |
| [`../AUTH_RESTRUCTURE/MASTER_PLAN.md`](../AUTH_RESTRUCTURE/MASTER_PLAN.md) | Входы, Mini App, бот |
| [`../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md) | Новые ключи через `system_settings` при необходимости |

## 9. Статус

**План и спецификация приняты; реализация по фазам A–E не считается завершённой, пока не закрыты DoD §1–§4 и §8.**
