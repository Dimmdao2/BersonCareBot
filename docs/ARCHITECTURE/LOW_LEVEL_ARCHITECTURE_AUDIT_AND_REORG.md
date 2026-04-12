# Аудит low-level архитектуры и план исправлений

**Дата:** 2026-03-18  
**Объект:** `webapp` + backend/integrator (`src`)  
**Фокус:** авторизация, валидация сессии, права доступа, инициализация модулей, composition roots, низкоуровневые риски, перенос к структуре `apps/*`.  
**Формат:** документ с оценкой, выводами и инструкциями; без изменений бизнес-логики в этом файле.

---

## 1. Короткий вывод

Текущая архитектура в целом движется в правильную сторону, но она пока не доведена до строгой формы.

- В репозитории уже есть хорошие composition roots:
  - `webapp/src/app-layer/di/buildAppDeps.ts`
  - `src/app/di.ts`
- Авторизация и cookie-сессия в `webapp` в целом реализованы безопасно: `httpOnly`, `sameSite=lax`, `secure` в production, HMAC-подпись cookie, TTL.
- Основной риск сейчас не в cookie-сессии как таковой, а в доверии к данным канала при phone auth и в том, что security-проверки пока сильнее привязаны к caller-слою, чем к доменным сервисам.
- Главная архитектурная слабость: система уже не “один composition root на контур и только через него”, а “два composition root + несколько обходов DI + смесь `pg` и `inMemory`”.
- Перенос к структуре `apps/*` реалистичен и полезен, но должен делаться фазами. Самый безопасный вариант: сначала перевести репозиторий в настоящий workspace, не меняя домены, порты и публичные URL.

---

## 2. Критичные и важные находки

## 2.1 Критично: phone confirm доверяет `channel/chatId` из запроса

На шаге подтверждения phone auth сервер принимает `channel` и `chatId` из body и затем использует их как доверенный context для binding пользователя.

Файлы:

- `webapp/src/app/api/auth/phone/confirm/route.ts`
- `webapp/src/modules/auth/phoneAuth.ts`
- `webapp/src/modules/auth/phoneChallengeStore.ts`
- `webapp/src/infra/repos/pgUserByPhone.ts`

Проблема:

- challenge хранит телефон и TTL, но не фиксирует origin-контекст;
- `confirm` принимает `channel/chatId` от клиента;
- binding потом пишется как доверенный.

Следствие:

- для web-сценария это не так страшно;
- для сценариев messenger binding это является слабой trust boundary;
- при неверном использовании route можно привязать не тот внешний идентификатор.

Что нужно сделать:

1. На `startPhoneAuth` сохранять в challenge не только `phone`, но и `channel`, `chatId`, `displayName`, а лучше и `authSource`.
2. На `confirmPhoneAuth` больше не принимать эти поля как authoritative input.
3. Для Telegram/MAX использовать серверно подтвержденный identity source:
   - `Telegram initData`
   - подписанный integrator/webapp entry token
   - или другой серверно-валидируемый канал.
4. Развести два сценария:
   - `web phone auth` для браузера без известной identity;
   - `channel bind completion` для messenger-входа, где канал уже серверно установлен до SMS.

Приоритет: `P0`.

## 2.2 Высокий риск регрессий: авторизация централизована не полностью

Сейчас guard-слой хороший, но многие доменные сервисы принимают `userId` или другие данные и доверяют вызывающему коду.

Файлы:

- `webapp/src/app-layer/guards/requireRole.ts`
- `webapp/src/modules/roles/service.ts`
- `webapp/src/modules/diaries/symptom-service.ts`
- `webapp/src/modules/doctor-clients/service.ts`

Проблема:

- контроль доступа в основном проверяется на страницах, route handlers и actions;
- сервисы не знают, кто их вызывает;
- новая API route или server action может забыть guard.

Следствие:

- не обязательно уязвимость “прямо сейчас”, но высокий риск будущих IDOR/privilege bugs.

Что нужно сделать:

1. Зафиксировать правило: любой mutating route/action обязан входить через guard/helper.
2. Ввести application-level фасады для чувствительных сценариев:
   - `executePatientAction(session, command)`
   - `executeDoctorAction(session, command)`
3. Для наиболее чувствительных use cases не передавать “голый `userId`”, а передавать validated actor context.
4. Добавить тесты вида “route/action denies wrong role”.

Приоритет: `P1`.

## 2.3 Высокий риск архитектурного дрейфа: обходы DI уже есть

Хотя `buildAppDeps()` существует как единый init point в `webapp`, он соблюдается не везде.

Ключевые места:

- `webapp/src/modules/integrator/events.ts` вызывает `buildAppDeps()` изнутри модуля
- `webapp/src/app/api/patient/support/route.ts` идёт напрямую в env/external Telegram API
- `webapp/src/app/api/media/[id]/route.ts` идет напрямую в repo
- integrator routes местами собирают infra wiring прямо в route layer

Что это значит:

- composition root перестает быть строгим правилом;
- тестируемость падает;
- сложнее переносить код по app boundaries;
- выше риск циклических зависимостей и неожиданных runtime coupling.

Что нужно сделать:

1. Запретить вызов `buildAppDeps()` из `modules/*`.
2. Правило: `buildAppDeps()` можно вызывать только в:
   - `page.tsx`
   - `route.ts`
   - `server actions`
   - верхнем app-layer orchestration
3. Route handlers, которые сейчас работают напрямую, завернуть в app services/ports.
4. Добавить архитектурный линт-чек или хотя бы тест/grep rule на запрет импорта `buildAppDeps` из `modules/*`.

Приоритет: `P1`.

## 2.4 Высокий операционный риск: `webapp` использует смесь `pg` и `inMemory`

В `buildAppDeps()` часть систем идет через `pg`, а часть остается process-local.

Примеры:

- `inMemoryDoctorAppointmentsPort`
- `inMemoryMessageLogPort`
- `inMemoryBroadcastAuditPort`
- `inMemoryPhoneChallengeStore`
- `mockMediaStoragePort`

Проблема:

- поведение зависит не только от env, но и от конкретного инстанса процесса;
- после рестарта часть данных исчезает;
- multi-instance deployment станет давать разъезд состояния.

Что нужно сделать:

1. Составить таблицу persistent/non-persistent зависимостей `webapp`.
2. Вынести в persistent storage минимум:
   - phone challenges
   - message log
   - broadcast audit
   - doctor appointments, если это не stub на короткий срок
3. Для временных in-memory вещей явно маркировать их как `MVP only`.

Приоритет: `P1`.

---

## 3. Оценка auth/session/access слоя

## 3.1 Что реализовано хорошо

Файлы:

- `webapp/src/modules/auth/service.ts`
- `webapp/src/app-layer/guards/requireRole.ts`

Сильные стороны:

- cookie-сессия подписана HMAC;
- cookie `httpOnly`;
- `secure` включается в production;
- `sameSite=lax` выбран разумно;
- у сессии есть TTL;
- Telegram `initData` валидируется криптографически;
- доступ к doctor/patient разделам проверяется на сервере;
- бизнес-доступ пациента к данным — через **`patientClientBusinessGate`** / tier (а не только snapshot телефона в сессии);
- `doctor` и `admin` уже сведены в один рабочий раздел, что соответствует текущей продуктовой модели.

## 3.2 Где слой авторизации еще не достаточно строгий

### 3.2.1 Смешение transport/framework logic и auth policy

`webapp/src/modules/auth/service.ts` сейчас содержит одновременно:

- crypto/signature logic;
- cookie IO через `next/headers`;
- whitelist logic;
- redirect target derivation;
- channel/user resolution.

Это рабочее решение, но файл уже берет на себя слишком много ролей.

Рекомендуемая декомпозиция:

1. `auth/sessionCodec.ts`
   - encode/decode/sign/verify session cookie
2. `auth/channelIdentity.ts`
   - resolve user from Telegram/MAX/integrator token
3. `auth/policy.ts`
   - role mapping, redirect target, allowlist policy
4. `auth/runtime.ts`
   - cookie IO, Next-specific integration

Это не обязательно делать одним PR, но направление правильное.

### 3.2.2 Дублирование access/redirect logic

Логика редиректов и access decisions сейчас частично размазана между:

- `webapp/src/modules/auth/service.ts`
- `webapp/src/modules/auth/phoneAuth.ts`
- `webapp/src/app/app/page.tsx`
- `webapp/src/shared/ui/AuthBootstrap.tsx`
- `webapp/src/app-layer/guards/requireRole.ts`

Рекомендация:

- оставить один canonical helper:
  - `getRedirectPathForRole(role)`
  - `resolveNextPath(input, role)`
  - `requireSession / requirePatientAccess / requireDoctorAccess`

Любая новая логика redirect должна добавляться только туда.

### 3.2.3 Требуется формализовать trust boundaries

Нужно явно разделить:

- trusted identity:
  - valid cookie session
  - Telegram initData
  - signed entry token
- untrusted input:
  - body/query params от клиента
  - `channel`, `chatId`, `displayName` из request body

Практическое правило:

- никакие channel bindings не создаются из тела запроса без серверной проверки происхождения канала.

---

## 4. Оценка composition roots и инициализации модулей

## 4.1 Текущее состояние

Сейчас в системе есть как минимум два composition root.

### Контур `webapp`

Файл:

- `webapp/src/app-layer/di/buildAppDeps.ts`

Роль:

- выбор infra реализации по env;
- создание сервисов модулей;
- сборка auth, doctor, patient и вспомогательных сервисов.

### Контур backend/integrator

Файл:

- `src/app/di.ts`

Роль:

- сборка db ports;
- queue;
- dispatch;
- content/context/template ports;
- event pipeline;
- event gateway;
- registrars для Telegram/MAX/Rubitime.

## 4.2 Что корректно

- В backend-контуре `buildDeps()` уже выглядит как нормальный composition root.
- Веб-страницы в `webapp` в основном идут через `buildAppDeps()`.
- Интеграционные webhook-и backend-а сходятся в единый `eventGateway`.

## 4.3 Что некорректно или хрупко

### 4.3.1 Module-level singleton wiring в `buildAppDeps.ts`

В `webapp/src/app-layer/di/buildAppDeps.ts` часть зависимостей создается на уровне модуля, а не внутри функции.

Это дает смешанную модель:

- внешне выглядит как request-level container;
- фактически многие зависимости process-singleton.

Это не обязательно ошибка, но нужно быть последовательным.

Рекомендация:

- либо явно признать этот файл app singleton container;
- либо вынести создание всех зависимостей внутрь функции;
- либо разделить:
  - `buildStaticDeps()`
  - `buildRequestDeps(staticDeps)`

### 4.3.2 Прямые связи route -> repo / route -> external API

Такие пути надо сокращать.

Правильная цель:

- `route/page/action -> guard -> build deps -> app service -> module service -> port -> infra`

Нежелательная схема:

- `route -> env/fetch/repo/helper`

### 4.3.3 Cross-app HTTP coupling

Backend/integrator уже зависит от `webapp` через HTTP-адаптеры и контракты.

Файлы:

- `src/infra/adapters/webappEventsClient.ts`
- `src/infra/adapters/deliveryTargetsPort.ts`

Риск:

- стабильность одного контура зависит от доступности и контрактов второго;
- при переносе в `apps/*` это не критично, но требует явно зафиксированных contracts и ownership.

---

## 5. Где код наиболее вероятно ломается

Наиболее вероятные точки поломки при росте системы:

1. `webapp/src/modules/auth/service.ts`
   - из-за смешения policy, session codec, runtime IO, token validation.
2. `webapp/src/app-layer/di/buildAppDeps.ts`
   - из-за накопления feature wiring и смешения persistent/in-memory зависимостей.
3. `webapp/src/modules/integrator/events.ts`
   - из-за нарушения границы composition root.
4. `webapp` phone auth flow
   - из-за размытой trust boundary между “known channel identity” и “unknown browser user”.
5. `src/infra/db/migrate.ts`
   - из-за path assumptions через `process.cwd()` и `src/*`.
6. `src/kernel/contentRegistry/index.ts`
   - по той же причине: путь к `src/content` вычисляется из текущей рабочей директории.
7. deploy scripts/systemd
   - они жестко завязаны на корневую структуру репозитория.

---

## 6. Сложность реорганизации репозитория в `apps/*`

## 6.1 Итоговая оценка

- `root backend -> apps/integrator`: `medium`
- `webapp -> apps/webapp`: `low-medium`
- `admin -> apps/admin` с нормализацией под `pnpm workspace`: `medium`
- перенос только `src/integrations` в отдельный app/service: `high`

Причина:

- текущий backend в корне репозитория фактически и есть отдельное приложение;
- а вот `src/integrations` еще не изолирован как самостоятельный bounded context.

## 6.2 Почему перенос всего backend в `apps/integrator` реалистичен

Потому что можно почти без изменения внутренних импортов перенести единый app-контур:

- `src/app`
- `src/kernel`
- `src/infra`
- `src/integrations`
- `src/content`

Главное, что нужно будет поправить:

- `package.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `pnpm-workspace.yaml`
- deploy scripts
- systemd unit files
- path assumptions на `process.cwd()`
- e2e/scripts, которые импортируют `../src/*`

## 6.3 Почему перенос только `src/integrations` отдельно сложный

Потому что сейчас `src/integrations/*`:

- глубоко зависит от `src/app`, `src/kernel`, `src/infra`;
- участвует в миграциях;
- включен в общее DI backend-а;
- не имеет изолированного public API.

Если выносить только этот слой, почти неизбежно придется:

- вводить internal packages;
- переразмечать импорты;
- отделять contracts;
- переписывать bootstrap и migrations discovery.

Это уже не просто reorg, а архитектурная декомпозиция.

---

## 7. Что именно придется менять при переносе

## 7.1 Workspace и корневая оркестрация

Точно затронутся:

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `tsconfig.build.json`
- `.gitignore`

Новая целевая схема:

- `apps/integrator`
- `apps/webapp`
- `apps/admin`
- возможно позже `packages/contracts`, `packages/shared-types`, `packages/config`

## 7.2 Backend path assumptions

Точно надо будет проверить и изменить:

- `src/infra/db/migrate.ts`
- `src/kernel/contentRegistry/index.ts`
- `src/main.ts`
- корневые `e2e/*.test.ts`
- `scripts/*.ts`, которые импортируют `src/*`

Минимальное требование:

- убрать жесткую привязку к `process.cwd() + "src/..."`
- заменить на явный root resolution helper или app-local cwd contract

## 7.3 Deploy и systemd

Точно придется менять:

- `deploy/host/deploy-prod.sh`
- `deploy/host/deploy-webapp-prod.sh`
- `deploy/host/start-api.sh`
- `deploy/host/start-worker.sh`
- `deploy/host/start-webapp.sh`
- `deploy/systemd/*.service`

Пример текущей жесткой привязки:

- `WorkingDirectory=/opt/projects/bersoncarebot`
- `ExecStart=/usr/bin/node dist/main.js`

После переноса это станет чем-то вроде:

- `WorkingDirectory=/opt/projects/bersoncarebot/apps/integrator`
- `ExecStart=/usr/bin/node dist/main.js`

или альтернативной командой, если build output изменится.

## 7.4 Webapp scripts

Сейчас deploy использует:

- `pnpm --dir webapp build`
- `pnpm --dir webapp run migrate`

После переноса надо будет заменить на:

- `pnpm --dir apps/webapp build`
- `pnpm --dir apps/webapp run migrate`

---

## 8. Нужно ли будет менять nginx

Короткий ответ: **не обязательно**.

Если сохраняются:

- те же домены;
- те же порты;
- те же health endpoints;
- те же upstream names;

то `nginx` можно вообще не трогать.

Менять `nginx` придется только если меняется хотя бы одно из:

- порт integrator/webapp;
- public URL;
- схема роутинга;
- systemd/host layout так, что сервисы начинают слушать другие адреса;
- отдельный новый app вводится в публичный ingress.

Практически:

- основной объем работ будет не в `nginx`, а в `systemd`, deploy scripts и путях сборки.

---

## 9. Рекомендуемый порядок исправлений

Это не Plan mode, а порядок действий для стабилизации low-level слоев.

### Фаза A. Security hardening без переезда структуры

1. Исправить trust boundary в phone auth.
2. Свести redirect/access logic в единые helpers.
3. Запретить `buildAppDeps()` внутри `modules/*`.
4. Вычистить route handlers с прямыми repo/external API вызовами.
5. Добавить regression tests на auth/access paths.

### Фаза B. Stabilize DI and persistence

1. Составить таблицу `webapp` зависимостей: `pg` vs `inMemory`.
2. Перевести challenge store, message log, broadcast audit в persistent storage.
3. Зафиксировать правила composition root по контурам.
4. Добавить архитектурный документ “allowed dependency directions”.

### Фаза C. Prepare repo for reorg

1. Привести `admin` к тому же package manager/workspace подходу.
2. Перевести корневой `package.json` в orchestration role.
3. Подготовить `pnpm-workspace.yaml` под `apps/*`.
4. Убрать path assumptions на `src/*` от `process.cwd()`.

### Фаза D. Move to `apps/*`

1. Перенести `webapp -> apps/webapp`.
2. Перенести backend root app -> `apps/integrator`.
3. Обновить CI scripts.
4. Обновить deploy scripts.
5. Обновить systemd units.
6. Проверить health checks и production restart flow.

### Фаза E. Optional standardization

Если реорганизация пройдет спокойно, дальше уже можно выделять:

- `packages/contracts`
- `packages/shared-types`
- `packages/config`

Но это нужно делать только после стабилизации runtime boundaries.

---

## 10. Какие тесты обязательно добавить

## 10.1 Для auth/security

1. `phone confirm` не принимает чужой `chatId`, если challenge был начат в другом контексте.
2. Messenger binding создается только из trusted channel identity.
3. Browser flow без known identity действительно требует phone auth.
4. Telegram/MAX flow с уже известной binding не требует повторной регистрации.
5. Wrong role получает redirect/deny на route/action уровне.

## 10.2 Для DI/init

1. Тест, что `modules/*` не импортируют `buildAppDeps`.
2. Тест, что ключевые routes идут через composition root.
3. Тесты на env switching:
   - with DB
   - without DB
4. Тесты, что production wiring не использует неожиданные in-memory fallback для критичных данных.

## 10.3 Для repo reorg

1. Smoke test backend build после переноса.
2. Smoke test `webapp` build после переноса.
3. Migration discovery test с новой структурой путей.
4. Content registry loading test с новой root directory.
5. Deploy dry-run check для systemd/start scripts.

---

## 11. Рекомендуемая целевая структура репозитория

Минимально разумная цель:

```text
apps/
  integrator/
  webapp/
  admin/
contracts/
deploy/
docs/
packages/
  contracts/        # опционально позже
  shared-types/     # опционально позже
```

Важно:

- не начинать с выделения `packages/*`, если сначала не стабилизированы runtime boundaries;
- сначала сделать понятные app boundaries, потом уже shared packages.

---

## 12. Итоговая рекомендация

Сейчас правильный фокус не на косметическом переносе папок, а на двух вещах:

1. закрыть low-level security и trust-boundary проблемы в auth;
2. сделать DI и composition roots действительно обязательным правилом.

Только после этого перенос в `apps/*` даст чистую структуру, а не просто переместит текущие слабые места в другие каталоги.

Если реорганизацию делать аккуратно, без смены доменов и портов, то:

- прод можно перевести без изменения `nginx`;
- основные изменения будут в workspace, build scripts, deploy scripts и systemd;
- самая сложная часть не `webapp`, а backend path assumptions и текущая роль корневого `package.json`.

---

*Документ подготовлен по состоянию кодовой базы на момент анализа. План-файл не изменялся.*
