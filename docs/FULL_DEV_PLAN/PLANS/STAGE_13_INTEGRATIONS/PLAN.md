## Архив исходного плана

# Этап 13: Интеграции

> Приоритет: P2–P3  
> Зависимости: этап 5 (auth), существующие модули webapp и integrator (см. пути ниже)  
> Риск: высокий (внешние API, OAuth, сторонние сервисы)  
> Формат: атомарные шаги для junior auto-agent. Реализацию кода в этом документе не приводить — только инструкции.

---

## Мета: обязательная структура каждого шага

Каждый шаг ниже содержит блоки **1–7**. Агент выполняет шаги строго по порядку внутри подэтапа, если не указано иное.

---

## Подэтап 13.1 — Email в integrator (текущее состояние и доведение до прод-готовности)

### Шаг 13.1.1 — Зафиксировать фактическую архитектуру email

1. **Цель шага:** Исключить дублирование и ложные предположения: email уже не «пустой модуль», а набор утилит и дескриптор реестра.
2. **Точная область изменений:** Только чтение (без правок кода): `apps/integrator/src/integrations/email/index.ts`, `apps/integrator/src/integrations/email/config.ts`, `apps/integrator/src/integrations/email/mailer.ts`, `apps/integrator/src/integrations/email/mailer.test.ts`, `apps/integrator/src/integrations/email/mailer.configured.test.ts`, `apps/integrator/src/integrations/registry.ts`.
3. **Конкретные действия:** Открыть перечисленные файлы; зафиксировать: `emailIntegration` в `registry.ts` помечен как без incoming/outgoing в dispatch pipeline; реальная отправка — через `sendMail` из `mailer.ts`, не через общий outbound adapter.
4. **Проверки после шага:** В `index.ts` видно `sendMail`, `isMailerConfigured`, `emailConfig`; в `registry.ts` присутствует импорт `emailIntegration`.
5. **Критерий успешного выполнения:** В рабочей заметке этапа (или тикете) одним абзацем описано «как сейчас устроен email», без противоречий с кодом.
6. **Тесты:** E2E не нужны. Unit: убедиться, что существующие `mailer.test.ts` / `mailer.configured.test.ts` в `apps/integrator` проходят (`pnpm --filter integrator test` или общий `pnpm run ci` после изменений кода — когда код меняют в следующих шагах).
7. **Обновление документации:** При изменении env или контрактов в следующих шагах — обновить `apps/integrator` README или `apps/webapp/.env.example` / `apps/webapp/INTEGRATOR_CONTRACT.md` там, где описаны переменные и вызовы (см. шаги 13.1.2–13.2.x).

### Шаг 13.1.2 — Согласовать переменные окружения email с `apps/integrator/src/config/env.ts`

1. **Цель шага:** Все ключи SMTP и флаги включения email явно читаются из одного места и задокументированы для деплоя.
2. **Точная область изменений:** `apps/integrator/src/config/env.ts`, `apps/integrator/src/integrations/email/config.ts`, при необходимости корень `apps/integrator/.env.example` (если файл есть в репозитории).
3. **Конкретные действия:** Сверить имена переменных в `email/config.ts` с тем, как они парсятся в `env.ts`; добавить недостающие поля в общий env-объект integrator или убрать мёртвые ключи; не менять семантику без шага 13.2 (контракт с webapp).
4. **Проверки после шага:** Локальный запуск integrator с минимальным набором env не падает на `undefined` там, где ожидается строка (или явно документирован optional).
5. **Критерий успешного выполнения:** Список переменных для SMTP совпадает между кодом и примером env в репозитории.
6. **Тесты:** Unit: при наличии тестов env — обновить/добавить; иначе полагаться на `pnpm run ci` после правок. E2E не нужен.
7. **Обновление документации:** Несекретные имена ключей — в `deploy/` или server conventions только если этап затрагивает прод-конфиг (по правилам репозитория); минимум — `.env.example` integrator/webapp.

### Шаг 13.1.3 — Политика «выключенного» email (stub / лог)

1. **Цель шага:** Поведение при отключённой отправке предсказуемо: не ломает CI, в dev видно диагностическое сообщение.
2. **Точная область изменений:** `apps/integrator/src/integrations/email/mailer.ts`, тесты рядом.
3. **Конкретные действия:** Убедиться, что при `EMAIL_ENABLED=false` (или эквивалентном флаге из `emailConfig`) не выполняется реальный SMTP; поведение соответствует существующим тестам; при изменении логики — обновить тесты.
4. **Проверки после шага:** `pnpm --filter integrator test` зелёный.
5. **Критерий успешного выполнения:** В CI без реального SMTP тесты не требуют сети.
6. **Тесты:** Unit: обязательны в `mailer.test.ts` / `mailer.configured.test.ts`. Integration/E2E не нужны.
7. **Обновление документации:** Краткая строка в комментарии к env или в internal README integrator.

---

## Подэтап 13.2 — Отправка кода на email через integrator (аналог SMS-маршрута)

### Шаг 13.2.1 — Зафиксировать эталон SMS: подпись, raw body, ответы

1. **Цель шага:** Новый маршрут отправки email повторяет контракт безопасности существующего `send-sms`.
2. **Точная область изменений (чтение):** `apps/integrator/src/integrations/bersoncare/sendSmsRoute.ts`, `apps/webapp/INTEGRATOR_CONTRACT.md` (раздел Flow 4 про `POST .../api/bersoncare/send-sms`), webapp-адаптер SMS: `apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.ts` (или актуальный файл, найденный по импортам из `phoneAuth`).
3. **Конкретные действия:** Записать в заметке этапа: URL, обязательные заголовки `X-Bersoncare-Timestamp`, `X-Bersoncare-Signature`, правило HMAC по `timestamp + "." + rawBody`, коды ответа 400/401/503.
4. **Проверки после шага:** Сравнение с реализацией `sendSmsRoute.ts` строка в строку для проверки подписи.
5. **Критерий успешного выполнения:** Есть спецификация для копирования в новый `send-email` route.
6. **Тесты:** E2E не нужен на этом шаге. Unit: позже — тест нового route по аналогии с тестами send-sms (если есть) или новый файл теста рядом с route.
7. **Обновление документации:** Подготовить список изменений для `apps/webapp/INTEGRATOR_CONTRACT.md` (новый подраздел «send email») — применить в шаге 13.2.3.

### Шаг 13.2.2 — Реализовать `POST /api/bersoncare/send-email` в integrator

1. **Цель шага:** Webapp может запросить отправку письма с кодом, не имея SMTP-учётных данных.
2. **Точная область изменений:** Новый файл рядом с `sendSmsRoute.ts`, например `apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts`; регистрация маршрута в точке подключения Fastify (найти по строке `registerBersoncareSendSmsRoute` в кодовой базе integrator).
3. **Конкретные действия:** Тело JSON: минимум `to` (email), `code` (или согласованное имя с `apps/webapp/src/modules/auth/emailAuth.ts`); проверка подписи — копия логики из `sendSmsRoute.ts`; вызов `sendMail` из `apps/integrator/src/integrations/email/mailer.ts` с текстом шаблона, согласованным с продуктом (например срок жизни кода 10 минут — если так задано в webapp).
4. **Проверки после шага:** `curl` или `fastify.inject` к локальному integrator с валидной подписью возвращает 200 `{ ok: true }`; с неверной подписью — 401.
5. **Критерий успешного выполнения:** Маршрут зарегистрирован и вызывает mailer без дублирования секретов webapp.
6. **Тесты:** Unit/integration: `fastify.inject` на новый путь с подписанным телом; мок `sendMail` или отключённый SMTP. E2E реального SMTP в CI не использовать.
7. **Обновление документации:** `apps/webapp/INTEGRATOR_CONTRACT.md` — полный контракт нового endpoint.

### Шаг 13.2.3 — Подключить webapp к integrator для email challenge

1. **Цель шага:** `startEmailChallenge` и связанные пути используют единую точку отправки (integrator), а не прямой nodemailer в webapp (если сейчас иначе — мигрировать).
2. **Точная область изменений:** `apps/webapp/src/modules/auth/emailAuth.ts`, `apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.ts` (паттерн), новый адаптер `apps/webapp/src/infra/integrations/email/` или расширение существующего клиента integrator; `apps/webapp/src/config/env.ts` (`INTEGRATOR_API_URL`, секрет для подписи); маршруты `apps/webapp/src/app/api/auth/email/start/route.ts`, `apps/webapp/src/app/api/auth/email/confirm/route.ts` — только если требуется смена контракта ответов.
3. **Конкретные действия:** Реализовать HTTP-клиент с теми же заголовками, что SMS; передать email и код; обработать ошибки 401/503 с пользовательскими сообщениями.
4. **Проверки после шага:** Ручной сценарий: залогиненный пользователь вызывает `POST /api/auth/email/start` — письмо уходит через integrator (в dev — в лог/stub).
5. **Критерий успешного выполнения:** Подтверждение email через `confirm` работает end-to-end с новым каналом отправки.
6. **Тесты:** Unit: мок fetch к integrator в тестах `emailAuth.test.ts` (если есть). Integration: опционально in-process webapp test по образцу `apps/webapp/e2e/auth-stage5-inprocess.test.ts`. E2E с реальным SMTP не обязателен.
7. **Обновление документации:** `apps/webapp/.env.example` — переменные integrator URL и секрет подписи.

---

## Подэтап 13.3 — Deep-link привязка Telegram (`link_…`)

### Шаг 13.3.1 — Сверка TTL и формата токена

1. **Цель шага:** Одинаковая семантика между webapp (хранение хеша) и UX (текст «действителен N минут»).
2. **Точная область изменений:** `apps/webapp/src/modules/auth/channelLink.ts` (константа TTL), `apps/webapp/migrations/018_channel_link_secrets.sql`, при необходимости копирайт в UI.
3. **Конкретные действия:** Сравнить `SECRET_TTL_MIN` в `channelLink.ts` с текстами в UI; при несоответствии с планом продукта — изменить константу и подсказки; не менять regex токена `link_[A-Za-z0-9_-]+` без согласования с `apps/integrator/src/integrations/telegram/webhook.ts`.
4. **Проверки после шага:** Юнит-тест или ручная проверка: истёкший токен отклоняется в `completeChannelLinkFromIntegrator`.
5. **Критерий успешного выполнения:** Документированное одно число минут в коде и в UI.
6. **Тесты:** Unit: существующие/новые тесты для `channelLink.ts` если добавляются. E2E не обязателен.
7. **Обновление документации:** Этот план или короткий комментарий в `channelLink.ts`.

### Шаг 13.3.2 — Парсинг `/start link_*` в Telegram

1. **Цель шага:** Входящее сообщение стабильно маппится в `action: start.link` и поле `linkSecret`.
2. **Точная область изменений:** `apps/integrator/src/integrations/telegram/webhook.ts` (функция маппинга update → internal event).
3. **Конкретные действия:** Убедиться, что regex `^/start\s+(link_[A-Za-z0-9_-]+)$` совпадает с тем, что генерирует `startChannelLink` в webapp (`link_` + base64url); добавить unit-тест на маппер, если отсутствует.
4. **Проверки после шага:** Fixture update с текстом `/start link_<token>` даёт `action === 'start.link'` и `linkSecret`.
5. **Критерий успешного выполнения:** Нет расхождения формата с `channelLink.ts`.
6. **Тесты:** Unit: тест файла маппинга или существующий suite webhook. Integration: `fastify.inject` на `/webhook/telegram` с тестовым секретом. E2E с Telegram API не нужен.
7. **Обновление документации:** Не требуется, если поведение не менялось.

### Шаг 13.3.3 — Сценарий `telegram.start.link` в scripts

1. **Цель шага:** Оркестратор вызывает завершение привязки в webapp.
2. **Точная область изменений:** `apps/integrator/src/content/telegram/user/scripts.json` (запись `id: telegram.start.link`), `apps/integrator/src/kernel/domain/executor/executeAction.ts` (case `webapp.channelLink.complete`), `apps/integrator/src/infra/adapters/webappEventsClient.ts` (URL `.../api/integrator/channel-link/complete`).
3. **Конкретные действия:** Проверить, что шаг `webapp.channelLink.complete` передаёт `linkToken`, `channelCode: telegram`, `externalId`; при ошибке webapp сценарий возвращает пользователю шаблон ошибки (настроить в scripts или templates).
4. **Проверки после шага:** Локально: fake webapp или staging — после complete в БД `user_channel_bindings` есть строка для пары user + telegram id.
5. **Критерий успешного выполнения:** Повторное использование того же токена даёт отказ на стороне webapp (`used_at` / удаление секрета).
6. **Тесты:** Integration: тест `executeAction` с моком `WebappEventsPort`. E2E полный Telegram не обязателен в CI.
7. **Обновление документации:** `apps/webapp/INTEGRATOR_CONTRACT.md` — если меняется тело complete; порт в `apps/integrator/src/kernel/contracts/ports.ts` комментарий актуализировать.

### Шаг 13.3.4 — Маршруты webapp для старта и complete

1. **Цель шага:** UI и M2M используют согласованные API.
2. **Точная область изменений:** `apps/webapp/src/app/api/auth/channel-link/start/route.ts`, `apps/webapp/src/app/api/integrator/channel-link/complete/route.ts`, `apps/webapp/src/modules/auth/channelLink.ts`.
3. **Конкретные действия:** Проверить авторизацию на `start` (только сессия пользователя); на `complete` — только подпись integrator (как реализовано в route); не смешивать секреты.
4. **Проверки после шага:** `POST /api/integrator/channel-link/complete` без подписи отклонён; с валидной подписью и валидным токеном — 200.
5. **Критерий успешного выполнения:** Соответствие `apps/integrator/src/kernel/contracts/ports.ts` и фактического HTTP.
6. **Тесты:** Integration: тест route complete с подписью (по аналогии с другими integrator routes в webapp). E2E: опционально сценарий в `apps/webapp/e2e/` если есть паттерн.
7. **Обновление документации:** Описание в `INTEGRATOR_CONTRACT.md` для channel-link complete.

---

## Подэтап 13.4 — Deep-link привязка Max

### Шаг 13.4.1 — Исследование входящего payload Max

1. **Цель шага:** Определить, передаёт ли Max аналог `start` payload для глубокой ссылки с токеном.
2. **Точная область изменений (чтение):** `apps/integrator/src/integrations/max/webhook.ts`, `apps/integrator/src/integrations/max/schema.ts`, `apps/integrator/src/integrations/max/mapIn.ts` или `connector.ts`, официальная документация Max Bot API (вне репозитория).
3. **Конкретные действия:** Задокументировать: есть ли в update поле текста команды `/start ...` или `payload` кнопки с `link_`; если нет — зафиксировать альтернативу (ручной ввод кода, отдельное сообщение).
4. **Проверки после шага:** Таблица «если API → сценарий A; иначе → сценарий B».
5. **Критерий успешного выполнения:** Решение go/no-go для паритета с Telegram без заглушек.
6. **Тесты:** E2E не нужен. Документальный шаг.
7. **Обновление документации:** Краткий appendix в этом плане или `docs/` только по запросу владельца (не создавать лишние файлы без задачи).

### Шаг 13.4.2 — Реализация привязки Max (выбранный сценарий)

1. **Цель шага:** Пользователь с ролью client связывает Max с аккаунтом с тем же уровнем безопасности, что Telegram.
2. **Точная область изменений:** Новые или существующие: `apps/integrator/src/content/max/user/scripts.json` (если каталог есть; иначе создать по аналогии с telegram), `apps/webapp/src/modules/auth/channelLink.ts` (ветка `channelCode === "max"`), маршруты channel-link при поддержке max в БД (`018` уже допускает `max` в CHECK).
3. **Конкретные действия:** Расширить `startChannelLink` для max при наличии способа доставить токен; добавить сценарий в scripts max, вызывающий `webapp.channelLink.complete` с `channelCode: max` и корректным `externalId`; убедиться, что `completeChannelLinkFromIntegrator` принимает union каналов (обновить типы в `channelLink.ts` если сейчас только `telegram`).
4. **Проверки после шага:** Staging: один проход привязки max → запись в bindings.
5. **Критерий успешного выполнения:** Повторная привязка того же аккаунта идемпотентна или даёт осмысленную ошибку.
6. **Тесты:** Unit: `channelLink` + executor; integration: inject max webhook fixture. E2E с реальным Max — вне CI.
7. **Обновление документации:** `INTEGRATOR_CONTRACT.md`, `ports.ts` комментарии.

### Шаг 13.4.3 — Зафиксировать путь для VK (без реализации)

1. **Цель шага:** Для будущего этапа зафиксировать исследование `ref` (как в старом плане: `https://vk.me/bot?ref=link_xxx`).
2. **Точная область изменений:** Только документация внутри этого файла или тикет; код `apps/integrator/src/integrations/vk/` не менять без отдельного этапа.
3. **Конкретные действия:** Записать ссылку на актуальную документацию VK и отличия от Telegram/Max.
4. **Проверки после шага:** Нет.
5. **Критерий успешного выполнения:** Явное «out of scope этапа 13» для VK deep-link.
6. **Тесты:** Не нужны.
7. **Обновление документации:** Только этот план.

---

## Подэтап 13.5 — Google Calendar sync

### Шаг 13.5.1 — Новый модуль и OAuth-хранилище

1. **Цель шага:** Подготовить безопасное хранение refresh token и конфигурацию Calendar API.
2. **Точная область изменений:** Новая папка `apps/integrator/src/integrations/google-calendar/` (`config.ts`, клиент), новая миграция в выбранной БД integrator **или** согласование с владельцем: если integrator без PG — хранение в существующем хранилище секретов (явно зафиксировать решение в шаге).
3. **Конкретные действия:** Зависимости `googleapis`, `google-auth-library` через workspace; env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, идентификатор календаря; не коммитить секреты.
4. **Проверки после шага:** Локально OAuth flow получает refresh token в dev-окружении.
5. **Критерий успешного выполнения:** Токен обновляется без ручного re-login при истечении access token.
6. **Тесты:** Unit: мок клиента Calendar; integration: nock на `https://www.googleapis.com/calendar/v3/`. E2E с Google не в CI.
7. **Обновление документации:** Несекретные env в примере env integrator; предупреждение про OAuth verification для production.

### Шаг 13.5.2 — Связка с событиями Rubitime

1. **Цель шага:** Создание/обновление/удаление записи в Rubitime отражается в календаре врача.
2. **Точная область изменений:** `apps/integrator/src/integrations/rubitime/webhook.ts`, `apps/integrator/src/integrations/rubitime/connector.ts`, обработчики в `apps/integrator/src/kernel/` (найти по `event-create-record` / актуальным именам событий в коде).
3. **Конкретные действия:** Маппинг: заголовок события, `record_at` → start/end, описание; idempotency по внешнему id записи; обработка ошибок Calendar API без молчаливого drop.
4. **Проверки после шага:** Fixture webhook → один вызов create/update/delete в моке Calendar.
5. **Критерий успешного выполнения:** Повторный webhook с тем же id не создаёт дубликатов.
6. **Тесты:** Unit/integration: расширить `connector.test.ts` или добавить тест модуля sync. E2E не нужен.
7. **Обновление документации:** Краткая схема в internal docs integrator.

---

## Подэтап 13.6 — Rubitime: обратный API (перенос/отмена из webapp)

### Шаг 13.6.1 — Аудит `apps/integrator/src/integrations/rubitime/client.ts`

1. **Цель шага:** Понять, какие методы HTTP уже есть и что добавить для update/cancel.
2. **Точная область изменений:** `apps/integrator/src/integrations/rubitime/client.ts`, `client.test.ts`, официальная документация Rubitime.
3. **Конкретные действия:** Составить таблицу endpoint → метод; отметить отсутствующие операции.
4. **Проверки после шага:** Ревью с владельцем API-ключей.
5. **Критерий успешного выполнения:** Явное «API позволяет / не позволяет» для переноса и отмены.
6. **Тесты:** Unit: существующие тесты клиента остаются зелёными. E2E не нужен.
7. **Обновление документации:** Если методов нет — зафиксировать в этом плане и в тикете «blocked external».

### Шаг 13.6.2 — Прокси в webapp и UI врача (если API доступен)

1. **Цель шага:** Действия врача в webapp инициируют вызов integrator → Rubitime и обновляют проекции/календарь согласованно.
2. **Точная область изменений:** Новые route handlers в `apps/webapp/src/app/api/` (точный путь согласовать с `apps/webapp/src/modules/appointments/` или `doctor-appointments`), соответствующий сервис; при необходимости событие в `apps/webapp/src/modules/integrator/events.ts` для проекции.
3. **Конкретные действия:** Реализовать только после подтверждения шага 13.6.1; иначе пропустить и оставить документацию.
4. **Проверки после шага:** Ин-process тест или ручной сценарий переноса.
5. **Критерий успешного выполнения:** Состояние в UI совпадает с Rubitime после refresh.
6. **Тесты:** Integration тест API; E2E опционально `apps/webapp/e2e/`. Если шаг пропущен — тесты не пишутся.
7. **Обновление документации:** `INTEGRATOR_CONTRACT.md` при новом M2M контракте.

---

## Подэтап 13.7 — Авто-привязка email из payload Rubitime

### Шаг 13.7.1 — Извлечение email в connector

1. **Цель шага:** Если Rubitime присылает email в `event-create-record`, связать с пользователем по телефону без отдельного OTP.
2. **Точная область изменений:** `apps/integrator/src/integrations/rubitime/connector.ts`, проекция в webapp через существующий механизм событий (`POST /api/integrator/events` и `apps/webapp/src/modules/integrator/events.ts`).
3. **Конкретные действия:** Найти поле email в payload (точное имя из schema); при совпадении пользователя по нормализованному телефону вызвать обновление контакта; не перезаписывать уже верифицированный email (проверить таблицы в миграциях webapp `017_email_verification.sql` и связанные поля `platform_users`).
4. **Проверки после шага:** Fixture события → в БД webapp email обновлён только при выполнении правил.
5. **Критерий успешного выполнения:** Повторная запись с тем же email идемпотентна; конфликт двух пользователей обрабатывается явной ошибкой в логах.
6. **Тесты:** Unit: `connector.test.ts`; integration: handler в `events.ts` с in-memory repos. E2E не нужен.
7. **Обновление документации:** Комментарий в `connector.ts` о доверии к источнику Rubitime.

---

## Подэтап 13.8 — Тестовая инфраструктура интеграций

### Шаг 13.8.1 — Unit-покрытие адаптеров

1. **Цель шага:** Бизнес-логика интеграций тестируется с подменёнными портами.
2. **Точная область изменений:** `apps/integrator/src/integrations/*/**/*.test.ts`, фейки портов в `apps/integrator/src/kernel/`.
3. **Конкретные действия:** Для каждого нового adapter/route из этапа 13 добавить тест рядом с модулем; использовать `vi.fn()` из vitest согласно проекту.
4. **Проверки после шага:** `pnpm --filter integrator test` зелёный.
5. **Критерий успешного выполнения:** Нет сетевых вызовов в unit-тестах.
6. **Тесты:** Unit — сам этот шаг. E2E не нужен.
7. **Обновление документации:** Не требуется.

### Шаг 13.8.2 — HTTP-заглушки внешних API (nock)

1. **Цель шага:** Интеграционные тесты проверяют исходящие запросы к Telegram, Max, SMSC, Google без сети.
2. **Точная область изменений:** `apps/integrator/package.json` (devDependency `nock` при отсутствии), тестовые файлы с префиксом integration или суффикс `.integration.test.ts` по конвенции репозитория.
3. **Конкретные действия:** Для `https://api.telegram.org` и других базовых URL из кода зафиксировать nock-ответы; не хардкодить прод токены.
4. **Проверки после шага:** Тесты проходят в offline CI.
5. **Критерий успешного выполнения:** Хотя бы один nock-тест на критический исходящий вызов на каждый внешний домен, который трогает этап 13.
6. **Тесты:** Integration. E2E не нужен.
7. **Обновление документации:** Краткий комментарий в `apps/integrator` README о запуске integration тестов.

### Шаг 13.8.3 — Webhook inject (Fastify)

1. **Цель шага:** Входящие webhook обрабатываются в полном контуре до dispatch.
2. **Точная область изменений:** Тесты, использующие `fastify.inject()` для `/webhook/telegram`, `/webhook/max`, `/webhook/rubitime/:token` (уточнить фактический path в `apps/integrator/src/integrations/rubitime/webhook.ts`).
3. **Конкретные действия:** Проверить статус 200/401 согласно коду; проверить, что EventGateway получил событие (мок).
4. **Проверки после шага:** Зелёный CI.
5. **Критерий успешного выполнения:** Регрессия в маппинге webhook ловится тестом.
6. **Тесты:** Integration (`fastify.inject`). E2E не нужен.
7. **Обновление документации:** Не требуется.

### Шаг 13.8.4 — Smoke вне CI

1. **Цель шага:** Владелец продукта может проверить реальные боты без автоматизации.
2. **Точная область изменений:** `apps/integrator/e2e/README.md` (создать, если отсутствует) или раздел в существующем README.
3. **Конкретные действия:** Пошаговые команды: какой webhook дернуть, какое сообщение в Telegram, ожидаемый ответ, какие логи/строки в БД проверить.
4. **Проверки после шага:** Минимум один прогон вручную на staging.
5. **Критерий успешного выполнения:** Документ не ссылается на вымышленные пути; все пути как в репозитории.
6. **Тесты:** E2E автоматизация не обязательна; ручной smoke — вне `pnpm run ci`.
7. **Обновление документации:** Этот README.

---

## Общий критерий завершения этапа 13

- [ ] Email через integrator согласован с `INTEGRATOR_CONTRACT.md` и `emailAuth`.
- [ ] Telegram channel-link проверен end-to-end (парсинг → scripts → `executeAction` → webapp complete).
- [ ] Max: реализован выбранный сценарий или зафиксирован блокер с альтернативой.
- [ ] Google Calendar: OAuth + CRUD событий, связь с Rubitime.
- [ ] Rubitime обратный API: реализован или задокументирован отказ внешнего API.
- [ ] Авто-email из Rubitime: правила не ломают верифицированные контакты.
- [ ] Тесты: unit + integration (nock/inject) зелёные; smoke-инструкции обновлены.
- [ ] `pnpm run ci` проходит на ветке с изменениями.

---

## Новая рабочая версия плана (для auto-агента)

### Цель этапа
Сделать интеграции webapp/integrator предсказуемыми: единый M2M-контракт отправки email, устойчивые deep-link сценарии, управляемые внешние интеграции (Max, Google Calendar, Rubitime reverse API) и обязательное тестовое покрытие без внешней сети в CI.

### Зона изменений этапа
- `apps/integrator/src/integrations/*`, `apps/integrator/src/kernel/*` (только где требуется для действия интеграции), `apps/webapp/src/modules/auth/*`, `apps/webapp/src/app/api/auth/*`, `apps/webapp/src/app/api/integrator/*`, `apps/webapp/src/modules/integrator/events.ts`, тесты и документация контрактов.
- Не менять unrelated модули UI/диарей/настроек.

### Последовательность действий для автоагента

#### Шаг 13.1 — Единый M2M endpoint отправки email в integrator
1. **Цель шага**: ввести production-ready `send-email` по шаблону `send-sms`.
2. **Точная область изменений**: `apps/integrator/src/integrations/bersoncare/sendSmsRoute.ts` (эталон), новый `apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts`, регистрация route в integrator bootstrap.
3. **Конкретные действия**:
   - реализовать `POST /api/bersoncare/send-email` с HMAC-подписью и timestamp-window;
   - валидировать payload (`to`, `code`, `idempotencyKey` если используется);
   - вызвать `sendMail` из `apps/integrator/src/integrations/email/mailer.ts`.
4. **Что проверить и при необходимости изменить (сущности)**:
   - env-конфигурация `apps/integrator/src/integrations/email/config.ts`;
   - реестр интеграций `apps/integrator/src/integrations/registry.ts`;
   - коды ответов 400/401/502/503.
5. **Проверки после шага**:
   - валидно подписанный запрос возвращает `200 { ok: true }`;
   - неверная подпись и missing headers отклоняются.
6. **Критерий успешного выполнения шага**: endpoint отправки email доступен и безопасно валидирует запросы.
7. **Тесты**:
   - integration tests через `fastify.inject` для нового route;
   - unit tests для веток `mailer configured/unconfigured`;
   - e2e: не требуется.
8. **Обновление документации**: обновить `apps/webapp/INTEGRATOR_CONTRACT.md` разделом `send-email`.

#### Шаг 13.2 — Перевести webapp email OTP на integrator endpoint
1. **Цель шага**: убрать прямую SMTP-логику из webapp OTP потока.
2. **Точная область изменений**: `apps/webapp/src/modules/auth/emailAuth.ts`, `apps/webapp/src/app/api/auth/email/start/route.ts`, новый/обновлённый adapter в `apps/webapp/src/infra/integrations/email/*`, `apps/webapp/src/config/env.ts`.
3. **Конкретные действия**:
   - в `startEmailChallenge` отправлять код через integrator `send-email`;
   - обрабатывать ошибки отправки как failure старта challenge;
   - сохранить текущий `confirm` flow без изменения семантики верификации.
4. **Что проверить и при необходимости изменить (сущности)**:
   - `EmailStartResult`/ошибки в `emailAuth.ts`;
   - route `/api/auth/email/start` response shape;
   - env ключи `INTEGRATOR_API_URL` и секрет подписи.
5. **Проверки после шага**:
   - при недоступном integrator start возвращает контролируемую ошибку;
   - при успешном integrator вызове challenge создаётся как раньше.
6. **Критерий успешного выполнения шага**: OTP email flow работает через integrator end-to-end.
7. **Тесты**:
   - unit tests `apps/webapp/src/modules/auth/emailAuth.test.ts`;
   - route tests `/api/auth/email/start`;
   - e2e: добавить/обновить inprocess auth сценарий (без реального SMTP).
8. **Обновление документации**: обновить `apps/webapp/.env.example` и auth-контракт email flow.

#### Шаг 13.3 — Telegram deep-link channel-link hardening
1. **Цель шага**: сделать Telegram link flow однозначным, одноразовым и тестируемым.
2. **Точная область изменений**: `apps/integrator/src/integrations/telegram/webhook.ts`, `apps/integrator/src/content/telegram/user/scripts.json`, `apps/webapp/src/modules/auth/channelLink.ts`, `apps/webapp/src/app/api/integrator/channel-link/complete/route.ts`.
3. **Конкретные действия**:
   - синхронизировать TTL токена (`SECRET_TTL_MIN`) и пользовательские тексты;
   - проверить парсинг `/start link_*` и передачу `linkSecret`;
   - проверить действие `webapp.channelLink.complete` с правильными полями.
4. **Что проверить и при необходимости изменить (сущности)**:
   - regex `/start link_*` в `webhook.ts`;
   - type unions `channelCode` в `channelLink.ts`;
   - обработка idempotent повторного complete.
5. **Проверки после шага**:
   - валидный токен привязывает канал;
   - просроченный/повторный токен не выполняет повторную привязку.
6. **Критерий успешного выполнения шага**: Telegram привязка через deep-link работает устойчиво и безопасно.
7. **Тесты**:
   - unit tests для `channelLink` (expired/used/invalid);
   - integration tests `telegram/webhook.test.ts` + route complete;
   - e2e: не требуется.
8. **Обновление документации**: обновить `INTEGRATOR_CONTRACT.md` раздел channel-link.

#### Шаг 13.4 — Max channel-link: реализовать выбранный сценарий без неопределённости
1. **Цель шага**: добавить рабочий сценарий привязки Max с теми же гарантиями, что у Telegram.
2. **Точная область изменений**: `apps/integrator/src/integrations/max/webhook.ts`, `apps/integrator/src/content/max/user/scripts.json` (создать или обновить), `apps/webapp/src/modules/auth/channelLink.ts`, `apps/webapp/src/app/api/auth/channel-link/start/route.ts`.
3. **Конкретные действия**:
   - зафиксировать единый способ передачи токена (команда/параметр/код) и реализовать только его;
   - расширить `startChannelLink` поддержкой `channelCode="max"` и корректным URL/инструкцией;
   - завершать привязку через существующий `channel-link/complete`.
4. **Что проверить и при необходимости изменить (сущности)**:
   - mapIn/schema max update payload;
   - действия в `scripts.json` для max;
   - хранение в `user_channel_bindings`.
5. **Проверки после шага**:
   - старт endpoint возвращает рабочие данные для Max flow;
   - flow приводит к реальной записи привязки.
6. **Критерий успешного выполнения шага**: Max привязка работает end-to-end без fallback-заглушек.
7. **Тесты**:
   - integration tests `apps/integrator/src/integrations/max/webhook.test.ts`;
   - unit/integration tests `channelLink.start` с `max`;
   - e2e: не требуется.
8. **Обновление документации**: обновить интеграционный контракт по Max-link сценарию.

#### Шаг 13.5 — Google Calendar sync как опциональный интеграционный модуль
1. **Цель шага**: синхронизировать Rubitime записи в Google Calendar под feature flag.
2. **Точная область изменений**: новый модуль `apps/integrator/src/integrations/google-calendar/*`, `apps/integrator/src/integrations/rubitime/*`, `apps/integrator/src/config/env.ts`, миграция/хранилище токенов integrator.
3. **Конкретные действия**:
   - ввести `GOOGLE_CALENDAR_ENABLED`;
   - реализовать create/update/delete событий по webhook Rubitime;
   - хранить и обновлять OAuth токены без ручного вмешательства.
4. **Что проверить и при необходимости изменить (сущности)**:
   - mapping Rubitime payload -> Google event fields;
   - idempotency по внешнему record id;
   - поведение при выключенном feature flag.
5. **Проверки после шага**:
   - при включенном флаге события синхронизируются;
   - при выключенном флаге Rubitime pipeline остаётся стабильным.
6. **Критерий успешного выполнения шага**: Google sync работает как изолируемый модуль, не ломая основной контур.
7. **Тесты**:
   - unit tests маппинга;
   - integration tests с nock для Google API;
   - e2e: не требуется.
8. **Обновление документации**: добавить README в модуль `google-calendar` и env keys в примеры.

#### Шаг 13.6 — Rubitime reverse API + автопривязка email из Rubitime
1. **Цель шага**: закрыть двустороннюю синхронизацию Rubitime и корректную проекцию email.
2. **Точная область изменений**: `apps/integrator/src/integrations/rubitime/client.ts`, новый bersoncare route для reverse-операций, `apps/webapp/src/modules/integrator/events.ts`, `apps/integrator/src/integrations/rubitime/connector.ts`.
3. **Конкретные действия**:
   - добавить `updateRecord` и `cancelRecord` в Rubitime client;
   - прокинуть подписанный M2M endpoint для webapp;
   - в `connector.ts` извлекать email из payload и обновлять проекцию по правилам приоритета.
4. **Что проверить и при необходимости изменить (сущности)**:
   - типы payload в `events.ts`;
   - правила «не перезаписывать подтверждённый email»;
   - idempotency reverse операций.
5. **Проверки после шага**:
   - перенос/отмена дают предсказуемые ответы;
   - email из Rubitime обновляет профиль только при разрешённых условиях.
6. **Критерий успешного выполнения шага**: reverse API и auto-email projection работают без регрессий.
7. **Тесты**:
   - unit/integration tests Rubitime client and connector;
   - обновить `apps/webapp/src/modules/integrator/events.test.ts`;
   - e2e: не требуется.
8. **Обновление документации**: обновить `INTEGRATOR_CONTRACT.md` и описание projection правил email.

#### Шаг 13.7 — Стандартизация тестовой инфраструктуры интеграций
1. **Цель шага**: гарантировать зелёный CI без доступа к внешним сервисам.
2. **Точная область изменений**: `apps/integrator/src/integrations/**/*.test.ts`, `apps/integrator/package.json` (dev deps), `apps/integrator/e2e/README.md`.
3. **Конкретные действия**:
   - привести новые тесты к паттерну unit + `fastify.inject` + nock;
   - исключить реальные сетевые вызовы и реальные секреты;
   - оформить отдельный manual-smoke документ вне CI.
4. **Что проверить и при необходимости изменить (сущности)**:
   - webhook тесты telegram/max/rubitime;
   - adapter/client тесты sms/email/google/rubitime;
   - `pnpm run ci` сценарий.
5. **Проверки после шага**:
   - весь набор тестов стабилен локально и в CI;
   - нет flaky-тестов, завязанных на сеть.
6. **Критерий успешного выполнения шага**: интеграционные тесты детерминированы и воспроизводимы.
7. **Тесты**:
   - unit + integration обязательны;
   - e2e в CI не добавлять, только manual smoke.
8. **Обновление документации**: обновить `apps/integrator/e2e/README.md`.

### Финальный критерий этапа 13
- Все шаги 13.1–13.7 выполнены с указанным покрытием тестами.
- Контракты webapp/integrator обновлены и синхронизированы.
- `pnpm run ci` проходит.
