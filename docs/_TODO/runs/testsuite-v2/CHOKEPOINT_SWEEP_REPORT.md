# Перепись мест, где к одному ресурсу ведёт больше одного пути — отчёт

(run: `worker-chokepoint-sweep`, клон `bcb-wt-testsuite2`, ветка `wt/chokepoint-sweep`, HEAD на момент замера
`bb0cce618884221d56c7dda95ec2ba0fda44de83`, 2026-08-01)

**Бриф:** [`CHOKEPOINT_SWEEP_BRIEF.md`](CHOKEPOINT_SWEEP_BRIEF.md). **Оракул:** `AGENTS.md` §5 «Один общий проход,
и мимо него нельзя». Это перепись, не починка — ничего в продуктовом коде, гейтах и конфигах не менялось.

## Таблица кандидатов

### 1. Композиция зависимостей (обязательный кандидат)

Базовая линия лида: композиционный корень `app-layer/di/buildAppDeps.ts` + `bind*.ts` существует; файлов
маршрутов (`app/api/**/route.ts`), импортирующих `infra/repos` напрямую — 0; не-маршрутных файлов с прямым
импортом `infra/repos` — 107. Задача — разделить эти 107(+2 дрейф) на законную композицию и настоящий обход DI.

- **Повторная проверка нуля маршрутов:**
  `grep -rl "infra/repos" apps/webapp/src/app --include="route.ts" | wc -l` → **0**.
- **Текстовые упоминания `infra/repos` в не-маршрутных файлах (метод, близкий к базовому):**
  `grep -rl "infra/repos" apps/webapp/src --include="*.ts" --include="*.tsx" | grep -v "/route.ts" | grep -v "\.test\." | wc -l`
  → **109** (было 107 на замере лида; +2 — обычный дрейф за счёт новых файлов, не переизмерение).
- **Из них — файлы с настоящим `import`/`export...from`/динамическим `import()`, а не просто с упоминанием
  строки `infra/repos` в комментарии:**
  `grep -rlE "^\s*(import|export)\s.*from\s+['\"].*infra/repos|import\(['\"].*infra/repos" apps/webapp/src --include="*.ts" --include="*.tsx" | grep -v "/route.ts" | grep -v "\.test\."  | wc -l`
  → **84**. Оставшиеся 25 — упоминания `infra/repos/*` только в комментариях/JSDoc (например
  `src/modules/diaries/ports.ts`, `src/modules/material-rating/service.ts`, где комментарий явно говорит «без
  импорта из infra/repos») — реального обхода не создают, в подсчёт нарушений не идут.

  Разбивка 84 файлов по каталогу (команды: `grep -c '^<префикс>' /tmp-эквивалент-списка`, префиксы применены к
  списку выше):
  | каталог | файлов | статус |
  |---|---|---|
  | `src/infra/repos/*` (repo → repo) | 30 | законно — внутри infra-слоя |
  | `src/infra/*.ts` (не repos) | 5 | законно — внутри infra-слоя |
  | `src/app-layer/di/*` (сам композиционный корень) | 4 | законно — это и есть корень |
  | `src/app-layer/testing/*` (in-memory тестовые двойники) | 2 | законно — тестовая инфраструктура |
  | `src/app-layer/*` прочее (оркестрация) | 21 | законно **по определению архитектуры**: `ARCHITECTURE.md` §`src/app-layer` называет этот слой «the only place where modules and infrastructure are wired together» — но список получен по каталогу, не построчным аудитом бизнес-логики внутри (см. «чего не смог выяснить») |
  | `src/modules/**` (сервисный/доменный слой) | 11 | **обход DI** — но не новое: все 11 уже в ESLint-аллоуслисте `apps/webapp/eslint.config.mjs:69-90` («Allowlisted legacy files in modules/\*, tracked in LEGACY_CLEANUP_BACKLOG.md»); 10 из них — техдолг, 1 (`modules/system-settings/configAdapter.ts`) — намеренно назначенный единственный резолвер настроек (см. кандидат 5) |
  | `src/app/app/**` (страницы/компоненты Next.js, не `app/api`) | 11 | **обход DI, механически НЕ пойман** — см. ниже |

  Сумма: 30+5+4+2+21+11+11 = 84. ✓

  **Новая находка сверх базовой линии лида:** 11 файлов под `src/app/app/**` (UI-страницы/компоненты, не
  `app/api/**/route.ts`) импортируют `infra/repos` напрямую, и ESLint-правило `no-restricted-imports` в
  `apps/webapp/eslint.config.mjs:24-65` покрывает только `src/modules/**` и `src/app/api/**/route.ts` — на
  `src/app/app/**` оно не распространяется вообще. Из этих 11:
  `grep -n "infra/repos" <файл>` показывает 5 — настоящий рантайм-импорт значения (не типа):
  `src/app/app/doctor/content/library/delete-errors/page.tsx` (`listMediaDeleteErrors`),
  `src/app/app/doctor/exercises/actionsShared.ts` (`pgListExerciseUsageForMediaIds`),
  `src/app/app/doctor/schedule/page.tsx` (`pgDoctorCalendarTimezonePort`),
  `src/app/app/patient/reminders/RemindersPageBody.tsx` и `src/app/app/patient/sections/[slug]/page.tsx`
  (оба — `resolvePatientContentSectionSlug`); остальные 6 — `import type {...}` (только тип, стирается при
  компиляции, реального обхода в рантайме не создаёт, но архитектурно та же щель).

- **Механическая защита:** частичная. ESLint `no-restricted-imports` (`apps/webapp/eslint.config.mjs:24-65`)
  ловит `src/modules/**` и `src/app/api/**/route.ts`; для найденных 11 `src/modules/**`-нарушений защита есть,
  но выключена точечным аллоулистом (`eslint.config.mjs:67-94`) — т.е. известна и заморожена, не скрыта.
  Для 11 `src/app/app/**`-файлов защиты нет вообще ни в виде правила, ни в CI (в конфиге нет ни одного `files`
  паттерна на `src/app/app/**`).
- **Что будет при обходе:** страница получает данные из `infra/repos` мимо `modules/*/service.ts`, то есть
  мимо бизнес-правил и (потенциально) мимо проверок доступа, которые обязан делать сервисный слой; но так как
  паттерн этот уже как минимум 5 раз живёт в проде без выявленных инцидентов, это подтверждённая архитектурная
  дыра, а не гипотетическая.
- **Чем лечится:** для `src/modules/**` — снятие 11 файлов с аллоулиста по одному (уже трекается в
  `LEGACY_CLEANUP_BACKLOG.md`, не новая работа). Для `src/app/app/**` — расширение `no-restricted-imports` на
  этот `files`-паттерн (сегодня отсутствует).

### 2. Доступ к медиа и файлам (S3, выдача байтов, ссылки)

- **Единый S3-клиент в вебаппе:** `apps/webapp/src/infra/s3/client.ts` — единственный SDK-клиент-синглтон
  (`getS3Client()`); `apps/webapp/src/app-layer/media/s3Client.ts` — чистый ре-экспорт того же модуля.
- **Число потребителей:**
  `grep -rlE "from '@/app-layer/media/s3Client'|from '@/infra/s3/client'" apps/webapp/src --include="*.ts" --include="*.tsx" | wc -l`
  → **21** файл (перепроверено самостоятельно, совпадает). Из них 16 идут через барьер
  `@/app-layer/media/s3Client`, 4 — напрямую через `@/infra/s3/client`
  (`infra/repos/mediaPreviewWorker.ts`, `infra/repos/s3MediaStorage.ts`, `infra/strictPlatformUserPurge.ts`,
  `modules/online-intake/doctorIntakeDetailResponse.ts`) — тот же синглтон, другой путь импорта.
- **Второй `new S3Client(...)` в вебаппе:** `grep -rn "new S3Client(" apps/webapp/src` → только
  `infra/s3/client.ts:31` (само определение). Второго конструктора нет.
- **Отдельные, ожидаемо самостоятельные S3-клиенты в других процессах** (не нарушение, другой деплой-юнит):
  `apps/media-worker/src/s3.ts` (транскод-пайплайн), `apps/integrator/src/infra/scripts/check-s3.ts`
  (диагностический скрипт, только `ListBucketsCommand`, не путь выдачи).
- **Механическая защита:** НЕТ. `grep -rniE "s3|@aws-sdk" apps/webapp/eslint.config.mjs` → пусто;
  `grep -rniE "s3|aws-sdk" .github/workflows/*.yml` → пусто. `modules/online-intake/doctorIntakeDetailResponse.ts`
  уже импортирует `infra/s3/client` напрямую из `src/modules/**`, ESLint это не ловит (правило ограничено
  `infra/db` и `infra/repos`) — щель подтверждена живым файлом, не гипотетическая.
- **Что будет при обходе:** `infra/s3/client.ts` не встраивает две вещи в сам клиент, а полагается, что вызывающий
  код их добавит сам — TTL presign-ссылки (`getVideoPresignTtlSeconds()`, иначе тихий откат на дефолтные 3600 с)
  и редакцию URL в логах (`serializePresignFailureForLog`/`redactUrlLikeSubstrings`, иначе подписанная ссылка
  утекает в структурированный лог). Новый вызывающий код мимо этих обёрток получит рабочий, но менее безопасный
  путь выдачи.
- **Чем лечится:** единая точка вида «S3-порт с обязательными параметрами TTL/редакции», а не голый клиент,
  который можно позвать и без них.

### 3. Исходящая доставка человеку (telegram/max/email/sms/push)

- **Единая точка отправки существует и является рабочим путём:** `createDefaultDispatchPort`/`dispatchOutgoing`
  в `apps/integrator/src/infra/adapters/dispatchPort.ts` — код прямо комментирован как «SINGLE chokepoint
  (owner's hard rule: no per-channel duplication)»; делает policy-check, dev-редирект, выбор адаптера,
  аудит-лог попытки доставки, затем ровно один `adapter.send(intent)`.
- **По каналу — ровно один вызывающий провайдерский API в проде** (перепроверено самостоятельно):
  telegram — `telegram/deliveryAdapter.ts`; max — `sendMaxMessage()`, 1 вызов
  (`grep -rn "sendMaxMessage(" apps/integrator/src --include="*.ts"`); email — `mailer.ts`→`sendMail`, 1 вызов;
  smsc — `client.ts`, 1 вызов; web_push — `web-push/client.ts`, единственное живое место, вызывающее
  `webpush.sendNotification`.
- **Мёртвые вторые пути, уже лежащие в коде (не активны, но не удалены):**
  `dispatchTelegramOutgoingEvents` в `telegram/connector.ts:70` — перепроверено самостоятельно,
  `grep -rn "dispatchTelegramOutgoingEvents" apps/integrator/src --include="*.ts"` находит только само
  определение, живых вызовов нет. `apps/webapp/src/.../web-push/sendWebPushToSubscriptions.ts` — та же картина:
  все настоящие вызывающие места (`patientWebPushNotify.ts` и ещё 5) уже мигрированы на `relayOutbound()`,
  функция осталась «про запас».
- **Вебапп → интегратор:** все notification-модули вебаппа идут через
  `apps/webapp/src/modules/messaging/relayOutbound.ts` (HMAC-подписанный HTTP-клиент с ретраями) →
  `POST /api/bersoncare/relay-outbound` → тот же `dispatchOutgoing`. Прямых вызовов nodemailer/web-push SDK
  на живом пути в вебаппе нет.
- **Механическая защита:** НЕТ. `no-restricted-imports` в обоих `eslint.config.mjs` покрывает только
  DB/repo-доступ и изоляцию patient/doctor UI — ни один паттерн не запрещает импорт `nodemailer`/`web-push`/
  прямой fetch к провайдеру вне `dispatchPort.ts`. Ничего в CI это не проверяет.
- **Что будет при обходе (подтверждено кодом, не гипотеза):** мимо `dispatchOutgoing` теряются dev-редирект
  (реальные отправки в непрод-окружении), аудит-лог попытки (`logDeliveryAttempt`), а через
  `relayOutboundRoute.ts` — ещё и дедуп (`DEDUP_TTL_MS`, 24 ч) и маппинг ошибок в инцидент
  (`classifyOutboundProviderErrorClass` → `recordOperatorFailureIncident`). Два «спящих» вторых пути
  (`toTelegram`/`dispatchTelegramOutgoingEvents`, `sendWebPushToSubscriptions`) — конкретные готовые обходы,
  если их случайно снова подключат.
- **Чем лечится:** удаление мёртвого кода второго пути (не в скоупе этой переписи) + ESLint-запрет на импорт
  провайдерских SDK вне `infra/adapters/dispatchPort.ts`/канальных `deliveryAdapter.ts`.

### 4. Постановка фоновых работ (очереди, ретраи, планировщик)

- **Единой точки постановки на весь монорепо нет** — минимум 5 независимых очередей/outbox-ов, у каждой своя
  функция вставки:
  1. `integrator.message_retry_jobs` — `enqueueMessageRetryJob` (`apps/integrator/src/infra/db/repos/jobQueue.ts:17`).
     Вызывающих мест: `grep -rn "enqueueMessageRetryJob\b" apps/integrator/src --include='*.ts' | grep -v test`
     → 3: `infra/adapters/jobQueuePort.ts:190` (через абстракцию `QueuePort`, из неё 2 места в
     `kernel/domain/executor/handlers/delivery.ts`), и два обхода `QueuePort` со своим построением payload —
     `integrations/bersoncare/bookingLifecycleRoute.ts:444` (свои `maxAttempts: 2`, `backoffSeconds: [60]`) и
     `infra/db/writePort.ts:1773` (свой payload для `message.retry.enqueue`).
  2. `outgoingDeliveryQueue` — `enqueueOutgoingDeliveryIfAbsent` (`infra/db/repos/outgoingDeliveryQueue.ts:59`),
     4 прямых вызывающих места, без абстракции, без обнаруженного дрейфа.
  3. `projectionOutbox` (`infra/db/repos/projectionOutbox.ts:27`) — 1 insert.
  4. Вебапп: медиа-транскод-очередь — 2 функции вставки в `infra/repos/pgMediaTranscodeJobs.ts`, 4 вызывающих
     места, все через фасад `app-layer/media/mediaTranscodeJobs.ts` — здесь дрейфа не найдено.
  5. OS-уровневый cron (`deploy/host/cron.d/*.cron.template`) независимо триггерит скрипты здоровья оператора —
     параллельно внутреннему тик-циклу приложения (`scheduler.ts`/`organizationTicks.ts`).
- **Механическая защита:** НЕТ для найденных обходов. Корневой `eslint.config.mjs` ограничивает импорты только
  для `integrator/src/domain/**`, `integrations/telegram/**`, `infra/runtime/worker/**` — не для
  `integrations/bersoncare/**` или `infra/db/writePort.ts`, где как раз и живут два обхода `QueuePort`.
- **Что будет при обходе:** два обходящих `QueuePort` места сами задают retry-параметры (attempts/backoff) и
  форму event-id вместо переиспользования логики executor'а — подтверждённое дублирование кода, риск расхождения
  retry-политики между путями. Другого задокументированного/протестированного отказа (например, потери
  идемпотентности) не найдено — не подтверждено.
- **Чем лечится:** для ресурса №1 (`message_retry_jobs`) — маршрутизация всех постановок через `QueuePort`, а не
  через `jobQueue.ts` напрямую. Остальные 4 ресурса — это разные ресурсы по назначению, а не копии одного и того
  же прохода; сводить их в одну точку не требуется тем же способом.

### 5. Чтение настроек и прав (system-settings, entitlements/квоты)

- **System-settings:** один канонический резолвер — `apps/webapp/src/modules/system-settings/configAdapter.ts`
  (кэш → БД → env-фолбэк). Потребителей канонического пути:
  `grep -rln "from '@/modules/system-settings/configAdapter'" apps/webapp/src --include="*.ts" | grep -v configAdapter.ts | wc -l`
  → **36**. Обход сырого читателя `pgSystemSettings` в обход кэша/фолбэка:
  `grep -rln "from '@/infra/repos/pgSystemSettings'" apps/webapp/src --include="*.ts"` → 5 совпадений, из них
  **3 — настоящий обход** (`infra/repos/pgBookingEngine.ts`, `pgBookingScheduling.ts`, `pgProductAnalytics.ts`,
  читают `readAdminSystemSettingString`/`...InnerValue` напрямую без кэша и без env-фолбэка), 2 —
  сам `buildAppDeps.ts` и `configAdapter.ts` (легитимны).
- **Entitlements/квоты:** один резолвер-модуль `apps/webapp/src/modules/org-entitlements/service.ts`
  (`resolveOrgEntitlements`, `isMechanicEnabled` и т.д., все из одного `getSnapshot`). `isMechanicEnabled` —
  8 вызывающих мест; `resolveMechanicAccess` идёт через единый гард `app-layer/guards/requireEntitlement.ts`.
  Но **проверка квоты в момент записи намеренно продублирована** на уровне SQL-транзакции:
  `infra/repos/stockQuotaCheck.ts` (`assertStockQuotaAvailable`, 3 вызывающих места: `pgBookingEngine.ts`,
  `pgPatientFiles.ts`, `pgPatientOrganizationEnrollment.ts`) и инлайновый SQL в `pgOrganizationInvites.ts`
  переизобретают ту же логику приоритета override>тариф вручную — в комментариях кода это признано явно
  («mirrors ... verbatim»), обоснование — нужна атомарная блокировка внутри транзакции, которую JS-резолвер
  дать не может.
- **Механическая защита:** частичная. `no-restricted-imports` в `eslint.config.mjs` запрещает `src/modules/**`
  и `src/app/api/**/route.ts` импортировать `infra/repos/*` (с `configAdapter.ts` явно в аллоулисте как
  санкционированное исключение) — но это не покрывает обход infra→infra (3 файла, читающих `pgSystemSettings`
  напрямую) и не покрывает переизобретение SQL-логики квот.
- **Что будет при обходе:** для settings — рассинхрон кэша (обходящий код видит БД без кэш-слоя/фолбэка, т.е.
  либо более свежие, либо при недоступности БД — другие данные, чем остальное приложение). Для квот — любое
  изменение приоритета override/тариф в `org-entitlements/service.ts` требуется вручную зеркалить в
  `stockQuotaCheck.ts` и SQL `pgOrganizationInvites.ts`; ничего не заставляет об этом вспомнить.
- **Чем лечится:** для settings — три файла-обходчика переводятся на `configAdapter`. Для квот, по признанию
  самого кода, дублирование — осознанный компромисс ради атомарности, а не забытая копия; лечится либо
  атомарным резолвером на стороне БД, либо тестом, который красит обе копии при расхождении.

### 6. Аутентификация и сессия

- **Проверка сессии — централизована.** Всё чтение сессии идёт через `getCurrentSession()` /
  `getCurrentSessionForIdentitySelf()` (`apps/webapp/src/modules/auth/service.ts:1136-1148`), которые обе зовут
  один приватный `getCurrentSessionWithPrincipalMode()` (строки 991-1129) — в комментарии к нему прямо написано
  «THE session-revocation chokepoint (C-1)... No handler anywhere repeats any of this». Число вызывающих мест:
  `grep -rn "getCurrentSession(\|getCurrentSessionForIdentitySelf(" apps/webapp/src --include="*.ts" --include="*.tsx" | grep -v "\.test\.ts" | wc -l`
  → **48** (перепроверено самостоятельно, совпадает). Сырой `decodeSessionCookie()` вне этой точки —
  8 совпадений, но все внутри `modules/auth/service.ts`/`sessionCookie.ts` (logout, admin-режим, PIN,
  скользящее продление TTL в `proxy.ts`) — не независимая повторная авторизация чужого кода, а служебные операции
  той же точки.
- **Выдача сессии — централизован минт, много входных дверей логина (ожидаемая множественность).**
  `persistNewAuthSession()` внутри `modules/auth/service.ts` — 5 вызовов из функций обмена (`exchange*`,
  `setSessionFromUser`), которые, в свою очередь, вызываются из **21 разного файла роутов логина**
  (пароль, passkey, PIN, TOTP, email-OTP, Yandex OAuth, Telegram/MAX, приглашение в клинику и т.д.) — это разные
  способы входа, но одна реализация минта сессии, не копия.
- **Механическая защита:** НЕТ на уровне lint/CI — `no-restricted-imports` покрывает `infra/db`/`infra/repos`,
  но ничего не запрещает импортировать `decodeSessionCookie`/`sessionCookie.ts` вне `modules/auth`. Защита сегодня
  держится на комментарии в коде («no handler anywhere repeats any of this»), не на сборке.
- **Отдельный ресурс, не дубликат:** M2M/webhook-аутентификация интегратора (HMAC `x-timestamp`/`x-signature`) —
  это не сессия пользователя, а другой контур. Внутри него, впрочем, своя находка: функция `verifySignature()`
  побайтово продублирована в **9 файлах** маршрутов (перепроверено самостоятельно —
  `grep -rc "^function verifySignature" apps/integrator/src --include="*.ts" | grep -v ':0'` → 9 файлов:
  `sendEmailRoute.ts`, `sendSmsRoute.ts`, `sendOtpRoute.ts`, `reminderRulesRoute.ts`,
  `operatorHealthProbeRoute.ts`, `userMergeM2mRoute.ts`, `requestContactRoute.ts`, `bookingLifecycleRoute.ts`,
  `relayOutboundRoute.ts`) без общего хелпера. Расхождений между копиями сегодня не найдено, но 9 копий одной
  проверки безопасности — сама по себе структурная дыра под правило §5.
- **Что будет при обходе:** для пользовательской сессии — не подтверждено (централизация сильная, обходов не
  найдено). Для M2M-подписи — если одну из 9 копий поправят (например, ужесточат окно времени или алгоритм) и
  забудут остальные 8, часть маршрутов останется на старой, более слабой проверке — правдоподобный, не
  гипотетический риск при 9 копиях.
- **Чем лечится:** для сессии — лечить нечего, точка одна де-факто, разве что закрепить это ESLint-правилом.
  Для M2M-подписи интегратора — один общий хелпер `verifySignature()`, вызываемый из 9 роутов вместо 9 копий.

### 7. Загрузка файлов от пользователя (валидация размера/типа)

- **Маршрутов загрузки/presign — 6:**
  `grep -rl "multipart\|formData()\|FormData\b" apps/webapp/src/app/api --include=route.ts` +
  `find apps/webapp/src/app/api -iname "*presign*" -o -iname "*upload*"` →
  `api/media/upload`, `api/media/presign`, `api/media/multipart/init`,
  `api/doctor/treatment-program-instances/[instanceId]/media-presign`,
  `api/patient/media/program-submission/presign`, `api/doctor/patients/[userId]/files`.
- **Реализаций валидации — 3, не одна:**
  - **Группа А** (4 маршрута): `modules/media/uploadAllowedMime.ts` (`ALLOWED_MEDIA_MIME` + лимиты размера).
    Но даже внутри группы значения расходятся: `media/upload` — `MAX_PROXY_UPLOAD_BYTES` (50 МиБ, буферизуется в
    памяти Node), остальные три — `MAX_MEDIA_BYTES` (3 ГиБ) — разница осознанная, но выражена двумя разными
    константами в одном файле, а не одним каноническим лимитом.
  - **Группа Б** (1 маршрут, `program-submission/presign`): собственный модуль
    `modules/media/programSubmissionUploadLimits.ts` — свои `PROGRAM_SUBMISSION_ALLOWED_MIME` (9 mime-типов) и
    `MAX_PROGRAM_SUBMISSION_BYTES` (250 МиБ), независимо от группы А.
  - **Группа В** (1 маршрут, `doctor/patients/[userId]/files`): **общего валидатора нет вообще** — схема
    требует только `mimeType: z.string().min(1).max(127)` (любая строка до 127 символов) и
    `sizeBytes: z.number().int().positive()` (без верхней границы); единственная проверка — сравнение с
    агрегатной квотой хранилища организации, и та пропускается целиком, если `storageLimitBytes === null`.
  - Команды проверки:
    `grep -n "ALLOWED_MEDIA_MIME\|MAX_MEDIA_BYTES\|MAX_PROXY_UPLOAD_BYTES" apps/webapp/src/app/api/media/**/route.ts`;
    `grep -n "PROGRAM_SUBMISSION_ALLOWED_MIME\|MAX_PROGRAM_SUBMISSION_BYTES" apps/webapp/src/app/api/patient/media/program-submission/presign/route.ts`;
    `grep -n "mimeType\|sizeBytes" "apps/webapp/src/app/api/doctor/patients/[userId]/files/route.ts"`.
  - Только `media/upload/route.ts` дополнительно сверяет magic-bytes с заявленным MIME
    (`isAllowedByMagicBytes`) — остальные 5 маршрутов этого не делают.
- **Механическая защита:** НЕТ. `grep -n "media\|upload\|Mime" apps/webapp/eslint.config.mjs` → пусто; нет
  правила, обязывающего маршрут импортировать общие константы.
- **Что будет при обходе:** маршрут `doctor/patients/[userId]/files` (файлы пациента в клинике) принимает файл
  произвольного размера и произвольного/подделываемого MIME-типа, пока не превышена агрегатная квота
  организации (или пока квота не `null`, тогда лимита нет вовсе) — тогда как пять соседних маршрутов держат
  капы 50 МиБ/3 ГиБ/250 МиБ и allowlist из ~25 типов.
- **Чем лечится:** единый порт валидации загрузки (тип + размер), которым обязаны пользоваться все 6 маршрутов,
  включая `doctor/patients/[userId]/files`.

## Сводная таблица

| № | Ресурс | Путей сегодня | Механическая защита | Последствие обхода | Лечится единой точкой вида |
|---|---|---|---|---|---|
| 1 | Импорт `infra/repos` из не-инфра-кода | 11 файлов `modules/**` (известный техдолг, аллоулист) + 11 файлов `app/app/**` (новая находка, 5 — рантайм-импорт) | Частичная: ESLint для `modules/**`+`app/api/**/route.ts`; НЕТ для `app/app/**` | Бизнес-правила и часть проверок доступа сервисного слоя пропускаются | Расширение ESLint-паттерна на `src/app/app/**`; снятие файлов с аллоулиста по одному |
| 2 | Выдача медиа из S3 | 21 потребитель, 1 синглтон-клиент, 4 в обход барьера, 0 второго SDK-клиента | НЕТ | Тихий откат TTL на дефолт; утечка подписанных URL в логи | S3-порт с обязательными TTL/редакцией вместо голого клиента |
| 3 | Исходящая доставка человеку | 1 живая точка диспетчеризации на канал; 2 «спящих» вторых пути в коде | НЕТ (только комментарий-конвенция) | Пропуск dev-редиректа, аудит-лога, дедупа, маппинга инцидентов | ESLint-запрет на прямой импорт провайдерских SDK вне `dispatchPort.ts`/`deliveryAdapter.ts` |
| 4 | Постановка фоновых работ | 5 независимых очередей/outbox; внутри одной (`message_retry_jobs`) — 2 обхода общей абстракции `QueuePort` | НЕТ для обходов | Дублирование retry-параметров, риск расхождения политики | Маршрутизация постановки `message_retry_jobs` только через `QueuePort` |
| 5 | Настройки/entitlements | Settings: 1 резолвер + 3 файла в обход кэша. Квоты: 1 резолвер + 2 места с намеренно продублированной SQL-логикой | Частичная (ESLint для `modules/**`, не для infra→infra) | Рассинхрон кэша; ручная синхронизация SQL-копий квот | Перевод 3 файлов на `configAdapter`; для квот — атомарный резолвер или кросс-тест на расхождение |
| 6 | Аутентификация/сессия | Проверка сессии — 1 точка, 48 вызовов; выдача — 1 реализация, 21 «дверь» логина; M2M-подпись интегратора — 9 копий одной функции | НЕТ (комментарий-конвенция) | Для сессии — не подтверждено; для M2M-подписи — риск расхождения при точечном патче | Общий хелпер `verifySignature()` для 9 M2M-роутов |
| 7 | Валидация загрузки файлов | 6 маршрутов, 3 разные реализации валидации, 1 маршрут без валидатора вовсе | НЕТ | `doctor/patients/[userId]/files` принимает файл любого размера/типа при отсутствии/превышении квоты | Единый порт валидации размера/типа для всех 6 маршрутов |

## Чего не смог выяснить

- **Кандидат 1, бакет «app-layer/* прочее» (21 файл):** классификация «законно, это и есть заявленный
  оркестрационный слой» сделана по каталогу и по определению из `ARCHITECTURE.md`, а не построчным чтением
  бизнес-логики каждого из 21 файла. Не исключено, что 1-2 из них на самом деле содержат бизнес-решения, которые
  по духу правила §5 должны жить в `modules/*`, а не в `app-layer/*` — это потребовало бы отдельного построчного
  аудита, не входящего в перепись.
- **Кандидат 4 (постановка фоновых работ):** не проверено, есть ли задокументированный/протестированный сценарий
  потери идемпотентности при использовании двух обходящих `QueuePort` точек — агент нашёл дублирование кода, но
  не нашёл (и не искал специально) конкретный воспроизводимый баг.
- **Кандидат 6, сессия:** централизация выглядит сильной (48 вызовов через одну функцию, комментарий в коде
  прямо называет её единой точкой), но фактического fault-injection теста «что будет, если новый роут вызовет
  `decodeSessionCookie()` напрямую» не проводилось (и не должно было — перепись, не починка/тестирование).
- **Собственные кандидаты сверх обязательного списка:** не заводились — семи обязательных из брифа плюс
  углублённая разбивка кандидата 1 потребовали всего отведённого объёма работы; расширение списка кандидатов
  своими вариантами не делалось.

## НЕ СДЕЛАНО

- Продуктовый код, ESLint-конфиги, CI-гейты — не менялись (по требованию брифа «ничего не чинить»).
- Задачи/сроки на найденные дыры — не заводились, приоритет отдан владельцу.
- Push и merge ветки `wt/chokepoint-sweep` — не делались.
- Полный построчный аудит бизнес-логики внутри 21 файла `app-layer/*` (кандидат 1) и 5 очередей (кандидат 4) —
  не проводился, счёт велся по каталогам/вызывающим местам, не по семантике каждой строки.
- Кандидаты сверх обязательного списка из брифа — не добавлялись.
