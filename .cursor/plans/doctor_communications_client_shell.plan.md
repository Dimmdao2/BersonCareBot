---
name: Doctor Communications — единый клиентский шелл с табами (TODO#3)
overview: >
  Перевести экран «Коммуникации» врача с 4 серверных роутов через proxy-rewrite на один
  клиентский контейнер-шелл (DoctorCommunicationsShell) + 4 ленивых компонента-таба с мгновенным
  переключением. Включает новый doctor-wide read-метод непрочитанных комментариев в модуле
  program-item-discussion (port + types + Drizzle infra + inMemory + service + DI + тесты), ленивую
  историю и клиент-поиск с серверным добором для таба «Комментарии», умный поллинг чата
  (активный+видимый таб, только при изменении), и правку routing в proxy.ts/doctorRouteRedirects
  (убрать internal-rewrite для communications, оставить 308 со старых URL). Эталон reuse — экран
  упражнений; см. communications.md TODO#3 и DOCTOR_APP_UI_STYLE_GUIDE.md.
isProject: false
status: pending
todos:
  - id: e0-rules-baseline
    content: "Этап 0 — прочитать релевантные .cursor/rules/*.mdc + DOCTOR_APP_UI_STYLE_GUIDE.md + AGENTS.md; завести LOG.md; зафиксировать зелёный baseline (typecheck/lint/тесты затронутых зон)"
    status: completed
  - id: e1a-types-ports
    content: "Этап 1.A — типы (DoctorExerciseCommentRow, Input+cursor) в types.ts + сигнатуры listUnreadExerciseCommentsForDoctor / listExerciseCommentsForDoctor в ports.ts"
    status: completed
  - id: e1b-pg-infra
    content: "Этап 1.B — реализация в pgProgramItemDiscussion: один индексированный запрос (DISTINCT ON последнего сообщения, join read-стейта viewer'а, WHERE patientUserId IN on-support); EXPLAIN + решение по индексу"
    status: completed
  - id: e1c-inmemory
    content: "Этап 1.C — параллельная реализация в inMemoryProgramItemDiscussion (паритет поведения для unit-тестов)"
    status: completed
  - id: e1d-service-di
    content: "Этап 1.D — обёртки в service.ts (assertUuid/clamp/курсор) + проводка в buildAppDeps; unit-тесты сервиса и инфры (pg integration + inMemory)"
    status: completed
  - id: e2a-loader
    content: "Этап 2.A — comments-загрузчик: резолв on-support ОДИН раз (doctorClientsPort + analytics exclusion), один вызов doctor-wide метода; имя/href в загрузчике; unit-тест"
    status: completed
  - id: e2b-route
    content: "Этап 2.B — API route / server action под ленивую историю (курсор) и серверный добор поиска; requireDoctorAccess; тест 401/пагинация/добор"
    status: completed
  - id: e2c-tab-ui
    content: "Этап 2.C — компонент-таб «Комментарии»: непрочитанные сверху (SSR), история лениво на скролле; reuse ProgramItemDiscussionMessageBody/DoctorExerciseCommentsList"
    status: completed
  - id: e2d-search
    content: "Этап 2.D — поиск по пациенту/тексту: клиент-сначала + серверный добор по канону useMediaLibraryPickerServerSearch; тест фильтрации+добора"
    status: completed
  - id: e3a-registry
    content: "Этап 3.A — реестр табов (декларативный массив id/loader/deepLinkKeys) + типы; добавление таба = компонент + строка реестра"
    status: completed
  - id: e3b-shell
    content: "Этап 3.B — DoctorCommunicationsShell (client): DoctorAppShell+TabsNav, ленивый next/dynamic монтаж активного таба + кэш уже открытых (keepMounted)"
    status: completed
  - id: e3c-urlsync
    content: "Этап 3.C — синхронизация ?tab + под-параметров (intake id, broadcasts archive) ↔ URL без полного перехода (history.replaceState/router), restore при back/forward; тест (прогрев чанков в beforeAll)"
    status: completed
  - id: e4a-chats
    content: "Этап 4.A — таб «Чаты» (DoctorSupportInbox): поллинг только активный+видимый таб (visibilitychange) и только при реальном изменении (since/сравнение); тест отсутствия поллинга/ре-рендера"
    status: completed
  - id: e4b-intake
    content: "Этап 4.B — таб «Заявки» (DoctorOnlineIntakeClient) с deep-link id ↔ шелл; тест открытия детали"
    status: completed
  - id: e4c-broadcasts
    content: "Этап 4.C — таб «Рассылки» (BroadcastForm + ленивый BroadcastAuditLog) с deep-link archive ↔ шелл; тест archive=1"
    status: completed
  - id: e5a-redirects
    content: "Этап 5.A — убрать ветку internal-rewrite для /communications из doctorRouteRedirects.ts; оставить 308 со старых URL + deep-links; schedule не трогать"
    status: completed
  - id: e5b-redirect-tests
    content: "Этап 5.B — обновить doctorRouteRedirects.test.ts: communications проходит без rewrite (null), 308-кейсы сохранены, schedule-кейсы зелёные"
    status: completed
  - id: e6a-shell-page
    content: "Этап 6.A — app/app/doctor/communications/page.tsx как серверный вход-шелл: requireDoctorAccess + бейджи + предзагрузка непрочитанных → DoctorCommunicationsShell(initialTab)"
    status: completed
  - id: e6b-legacy-cleanup
    content: "Этап 6.B — свести легаси-страницы вкладок к 308-редиректам/удалить (rg на использование перед удалением); таб-бар рендерится только из шелла"
    status: completed
  - id: e7a-docs
    content: "Этап 7.A — синхронная докуа: communications.md (раздел Маршрутизация + TODO#3 ✅ + Журнал), README модуля program-item-discussion, LOG.md"
    status: pending
  - id: e7b-live-verify
    content: "Этап 7.B — живой dev (dev:doctor, 127.0.0.1:5200): мгновенное переключение, deep-links id/archive, кросс-таб бейджи, чат-поллинг только активным+видимым окном"
    status: pending
  - id: e7c-full-ci
    content: "Этап 7.C — финальный гейт pnpm run ci (один раз). Не пушить."
    status: pending
---

# Doctor Communications — единый клиентский шелл с табами (TODO#3)

Источник задачи и принятые решения: `apps/webapp/src/app/app/doctor/communications/communications.md` → **TODO#3**.
Это **НЕ «только UI»** — затрагивает proxy/redirects и data-слой.

## Правила, которым следуем (read-before-do)

> Перед реализацией прочитать; при конфликте приоритет у `alwaysApply` и более узких по теме.

- `plan-authoring-execution-standard.mdc` — декомпозиция, чек-листы, scope, статусы todos.
- `test-execution-policy.md` — уровни **step → phase → full CI**; команды: `pnpm --dir apps/webapp test -- <pattern>`,
  `pnpm --dir apps/webapp typecheck`, `pnpm --dir apps/webapp lint`. Полный `pnpm run ci` — НЕ после каждого шага.
- `webapp-tests-lean-no-bloat.mdc` — **ленивые чанки табов (next/dynamic) греть в `beforeAll`** (`Promise.all`+`import`),
  расширять существующие тест-файлы зоны, не плодить новые, не поднимать таймауты.
- `clean-architecture-module-isolation.mdc` — логика в модуле, не на странице; БД только через порт; cross-layer через контракты.
- `doctor-ui-shared-primitives.mdc` + `DOCTOR_APP_UI_STYLE_GUIDE.md` — reuse shared-примитивов (эталон — экран упражнений), не хэндроллить UI.
- `patient-doctor-ui-isolation.mdc` — не смешивать patient/doctor UI.
- `ui-copy-no-excess-labels.mdc` — без лишних подписей/ярлыков.
- `pre-push-ci.mdc` / `push-means-ci-commit-push.mdc` / `git-commit-push-full-worktree.mdc` — пуш = отдельная команда пользователя;
  **в этой задаче не пушим**, коммиты поэтапно с трейлером Co-Authored-By.

## Контекст (как сейчас)

- 4 отдельных серверных роута (`/messages`, `/online-intake[/:id]`, `/comments`, `/broadcasts[/archive]`).
  `/app/doctor/communications?tab=<id>` через `middleware/doctorRouteRedirects.ts` делает **internal-rewrite**
  на легаси-страницу; защита от петли — заголовок `x-bc-doctor-rewrite`. У `/communications` **нет page.tsx**.
- Таб-бар: `doctorCommunicationsTabs.ts` (`COMMUNICATIONS_TABS`, `communicationsTabFromQuery/Pathname`) +
  `DoctorCommunicationsTabsNav.tsx` (sticky, `activeTab` пропом, `badges` пропом).
- Бейджи: `loadDoctorCommunicationsBadges.ts` (chats=unread, intake=new) — вызывается всеми 4 страницами.
- Таб «Комментарии» сейчас бежит **фан-аутом по пациентам** через
  `app/app/doctor/loadDoctorExerciseCommentAttention.ts` (per-patient: instances → active exercise items →
  `listAttentionSummaryForStageItems` → per-item `listMessagesPage(limit 1, backward)` + `getLastReadAtForViewer`).
- Модуль `program-item-discussion`: `ports.ts`, `service.ts`, infra `infra/repos/pgProgramItemDiscussion.ts` +
  `inMemoryProgramItemDiscussion.ts`, схема `db/schema/programItemDiscussion.ts`
  (таблицы `program_item_discussion_messages` + `..._reads`; read-стейт viewer'а хранится в `_reads` по
  ключу `(patient_user_id, instance_stage_item_id)`, где `patient_user_id` = id любого platform-user'а,
  в т.ч. врача-viewer'а — см. `markReadForViewer`/`getLastReadAtForViewer`). DI: `buildAppDeps.ts`
  прокидывает `programItemDiscussion: programItemDiscussionService`.

## Целевое решение (вариант C)

Один **клиентский** `DoctorCommunicationsShell` (`DoctorAppShell title="Коммуникации"` + `DoctorCommunicationsTabsNav`
+ реестр табов + URL-sync) лениво монтирует активный таб (`next/dynamic`) и кэширует его после первого
открытия → мгновенное переключение без серверного ре-рендера. 4 таба — изолированные компоненты.
«Тяжесть» комментариев убираем **doctor-wide запросом** вместо фан-аута.

---

## Scope boundaries

**Разрешено трогать:**
- `apps/webapp/src/app/app/doctor/communications/**` (шелл, реестр, табы-обёртки, конфиг).
- 4 компонента/страницы вкладок: `app/app/doctor/{messages,online-intake,comments,broadcasts}/**`
  (включая перенос их клиентских компонентов в табы шелла).
- `apps/webapp/src/proxy.ts` + `src/middleware/doctorRouteRedirects.ts` + их тесты.
- **Новый read-метод** в `apps/webapp/src/modules/program-item-discussion/` (port + types + service + тесты)
  и его infra `infra/repos/{pgProgramItemDiscussion,inMemoryProgramItemDiscussion}.ts`; проводка в
  `app-layer/di/buildAppDeps.ts`.
- При необходимости — API route / server action под ленивые данные комментариев
  (`app/api/doctor/...` или server action в области comments).
- Синхронная докуа: `communications.md`, README модуля `program-item-discussion` (если есть), `LOG.md`.

**Вне scope (НЕ трогать):**
- `/app/doctor/schedule` и его rewrite-агрегация — остаётся как есть (communications — пилот).
- Рефактор дашборда «Сегодня» на новый запрос — **отдельный backlog-шаг**, не в этой задаче
  (фан-аут `loadDoctorExerciseCommentAttention` остаётся для «Сегодня»).
- Вебсокеты.
- Любые миграции/изменения схемы, кроме **добавления индекса**, если профайлинг (`EXPLAIN`) нового запроса
  покажет необходимость — **согласовать с владельцем** до добавления миграции.

---

## Этап 0 — Правила и baseline (`e0-rules-baseline`)

**Шаги:**
1. Прочитать правила из раздела «Правила, которым следуем» + `DOCTOR_APP_UI_STYLE_GUIDE.md` + `AGENTS.md`.
2. Завести `LOG.md` в области doctor-comms (execution log по правилу 5).
3. Зафиксировать зелёный baseline затронутых зон.

**Checklist:**
- [ ] правила прочитаны, конфликтов нет; `LOG.md` создан.
- [ ] `pnpm --dir apps/webapp typecheck` зелёный.
- [ ] `pnpm --dir apps/webapp test -- src/modules/program-item-discussion` зелёный.
- [ ] `pnpm --dir apps/webapp test -- src/app/app/doctor/communications` зелёный.

**Критерий закрытия:** baseline зафиксирован, правила учтены, LOG заведён.

---

## Этап 1 — Data-слой: doctor-wide непрочитанные + история

> Чистая архитектура: сначала контракт (port/types), потом infra (pg + inMemory), потом проводка (service/DI).

### 1.A Типы и контракт порта (`e1a-types-ports`)

**Шаги:**
1. `types.ts`: `DoctorExerciseCommentRow` (`patientUserId`, `instanceId`, `stageItemId`, `stageItemTitle`
   *(из snapshot)*, `latestMessage: ProgramItemDiscussionMessage`, `createdAt`); `ListDoctorExerciseCommentsInput`
   (`patientUserIds: string[]`, `viewerUserId: string`, `limit: number`, `cursor?: { createdAt; id } | null`).
2. `ports.ts`: `listUnreadExerciseCommentsForDoctor(input)` (непрочитанные, новые сверху) +
   `listExerciseCommentsForDoctor(input)` (история, курсор, новые сверху).

**Решение по «врач ведёт пациента»:** WHERE-фильтр `patientUserId IN (:patientUserIds)`; on-support-список
резолвит **загрузчик** через `doctorClientsPort.listClients({ supportStatus: "on" })` **один раз** и передаёт
массив id. Имя пациента добирается в загрузчике, в порт не тащим (граница модуля doctor-clients не протекает).

**Checklist:**
- [ ] `rg "listUnreadExerciseCommentsForDoctor" src/modules/program-item-discussion` — порт+типы есть.
- [ ] `pnpm --dir apps/webapp typecheck` (реализации добавляются в 1.B/1.C в рамках одного блока-коммита).

### 1.B Реализация pg-инфры (`e1b-pg-infra`)

**Шаги:**
1. `pgProgramItemDiscussion.ts`, один запрос: `messages` → join stage-items → stages → instances;
   WHERE `instances.patientUserId IN (...)` AND `assignmentSource='doctor'` AND активный exercise-элемент
   *(сверить реальные колонки: `snapshot->>'itemType'`/`status`)*; последнее сообщение на stage-item через
   `DISTINCT ON (instanceStageItemId) ORDER BY createdAt DESC, id DESC`; оставить где последнее
   `senderRole='patient'` и `mediaFileId IS NULL`; LEFT JOIN `_reads` по `(viewerUserId, stageItemId)`,
   для unread — `createdAt > COALESCE(lastReadAt,'-infinity')`; внешний `ORDER BY createdAt DESC, id DESC`,
   keyset по `cursor`, `LIMIT`. **Legacy admin-replies НЕ мёржим** (паритет с текущим табом).
2. `EXPLAIN` на dev-данных; если нужен индекс — согласовать миграцию (вне scope без согласования).

**Checklist:**
- [ ] integration-тест pg: непрочитанные сверху; прочитанные/ media-последнее / admin-последнее исключены;
      пагинация курсором; пустой `patientUserIds` → `[]`.
- [ ] `pnpm --dir apps/webapp test -- src/infra/repos/pgProgramItemDiscussion` зелёный.

### 1.C Реализация inMemory (`e1c-inmemory`)

**Шаги:** эквивалент на массивах для unit-тестов сервиса/страниц (паритет с pg).

**Checklist:**
- [ ] inMemory-тест с тем же набором кейсов, что и pg.
- [ ] `pnpm --dir apps/webapp test -- src/infra/repos/inMemoryProgramItemDiscussion` зелёный.

### 1.D Service + DI + тесты (`e1d-service-di`)

**Шаги:**
1. `service.ts`: обёртки с `assertUuid(viewerUserId)` + валидация `patientUserIds`/курсора + clamp `limit`.
2. `buildAppDeps.ts`: методы доступны через `programItemDiscussionService` (точки ~754/799/979/1498).
3. Unit-тесты сервиса (валидация, проксирование в порт-двойник).

**Checklist:**
- [ ] `pnpm --dir apps/webapp test -- src/modules/program-item-discussion` зелёный.
- [ ] `rg "listUnreadExerciseCommentsForDoctor|listExerciseCommentsForDoctor" src/app-layer/di/buildAppDeps.ts`.
- [ ] **Phase-gate:** `pnpm --dir apps/webapp typecheck` зелёный.

**Коммит блока 1:** `feat(doctor-comms): doctor-wide read-метод непрочитанных комментариев (TODO#3 Block 1)`

---

## Этап 2 — Таб «Комментарии»: данные + UI

### 2.A Загрузчик (`e2a-loader`)

**Шаги:** резолв on-support (как в текущем `comments/page.tsx`: `doctorClientsPort.listClients` + analytics
exclusion), затем **один** `listUnreadExerciseCommentsForDoctor` (+ ленивая `listExerciseCommentsForDoctor`).
Имя/href в загрузчике (reuse `doctorClientTreatmentProgramInstanceHref`, `doctorTodayFormat`). Старый
фан-аут `loadDoctorExerciseCommentAttention` для **таба** не используется (для «Сегодня» — остаётся).

**Checklist:**
- [ ] unit-тест на inMemory-порте (непрочитанные сверху, пустой on-support → пусто).
- [ ] `rg "loadDoctorExerciseCommentAttention" src/app/app/doctor/comments` — в табе не вызывается.

### 2.B API route / action (`e2b-route`)

**Шаги:** route/action под ленивую историю (курсор) и серверный добор поиска (пациент/текст);
`requireDoctorAccess`.

**Checklist:**
- [ ] тест: 401 без доктор-доступа; пагинация курсором; добор поиска.
- [ ] `pnpm --dir apps/webapp test -- <route-pattern>` зелёный.

### 2.C Компонент-таб «Комментарии» (`e2c-tab-ui`)

**Шаги:** непрочитанные сверху (SSR-предзагрузка из шелла), история лениво на скролле через route/action;
reuse `ProgramItemDiscussionMessageBody`, `DoctorExerciseCommentsList`; ответ/прочтение — по ссылке
«Открыть комментарии в программе» (read-only).

**Checklist:**
- [ ] компонент-тест: рендер непрочитанных; «загрузить ещё» дёргает route.
- [ ] `rg "ProgramItemDiscussionMessageBody" src/app/app/doctor/comments` — reuse подтверждён.

### 2.D Поиск (`e2d-search`)

**Шаги:** клиент-сначала + серверный добор по канону `useMediaLibraryPickerServerSearch`
(`src/shared/ui/doctor/media/useMediaLibraryPickerServerSearch.ts`). Глобальный поиск по всем комментариям
не делаем.

**Checklist:**
- [ ] тест: клиент-фильтр + серверный добор.
- [ ] **Phase-gate:** `pnpm --dir apps/webapp test -- src/app/app/doctor/comments` зелёный.

**Коммит блока 2:** `feat(doctor-comms): таб «Комментарии» на doctor-wide запрос + ленивая история/поиск (TODO#3 Block 2)`

---

## Этап 3 — Клиентский шелл

### 3.A Реестр табов (`e3a-registry`)

**Шаги:** декларативный массив `{ id, loader: () => import(...), deepLinkKeys }` + типы. Добавление таба =
компонент + строка реестра (без переписывания страницы).

**Checklist:** [ ] `rg` показывает реестр; типы выводятся; `pnpm --dir apps/webapp typecheck` зелёный.

### 3.B Шелл-контейнер (`e3b-shell`)

**Шаги:** `DoctorCommunicationsShell.tsx` (`"use client"`): `DoctorAppShell`+`DoctorCommunicationsTabsNav`
(reuse), `activeTab` в state, ленивый `next/dynamic` монтаж активного таба + **кэш** уже открытых
(скрытие неактивных, см. memory «Tabs load once, switch client-side»).

**Checklist:**
- [ ] тест: смонтированный таб не размонтируется при уходе (кэш). **Чанки греть в `beforeAll`** (`Promise.all`+`import`).

### 3.C URL-sync (`e3c-urlsync`)

**Шаги:** `?tab` + под-параметры (intake `id`, broadcasts `archive`) ↔ URL без полного перехода
(`history.replaceState`/router); restore из URL при входе и back/forward; `initialTab` из
`communicationsTabFromQuery`.

**Checklist:**
- [ ] тест: переключение меняет `?tab` без перемонтирования; deep-link `id`/`archive` читается/пишется.
- [ ] **Phase-gate:** `pnpm --dir apps/webapp test -- src/app/app/doctor/communications` зелёный.

**Коммит блока 3:** `feat(doctor-comms): клиентский шелл коммуникаций с реестром и URL-sync (TODO#3 Block 3)`

---

## Этап 4 — Компоненты-табы

### 4.A Таб «Чаты» — умный поллинг (`e4a-chats`)

**Шаги:** обёртка вокруг `DoctorSupportInbox`; поллинг ~1/сек **только при активном табе И видимом окне**
(`visibilitychange` + флаг активного таба от шелла), обновлять **только при реальном изменении**
(`since=<ts>`/сравнение последнего сообщения). Вебсокет не вводим.

**Checklist:**
- [ ] тест: при скрытом окне/неактивном табе поллинг не идёт; без изменений нет ре-рендера списка.
- [ ] `pnpm --dir apps/webapp test -- src/app/app/doctor/messages` зелёный.

### 4.B Таб «Заявки» (`e4b-intake`)

**Шаги:** обёртка вокруг `DoctorOnlineIntakeClient`; deep-link `id` (деталь) ↔ шелл-URL-sync.

**Checklist:** [ ] тест: deep-link `id` открывает деталь; `pnpm --dir apps/webapp test -- src/app/app/doctor/online-intake` зелёный.

### 4.C Таб «Рассылки» (`e4c-broadcasts`)

**Шаги:** `BroadcastForm` + ленивый `BroadcastAuditLog` (журнал через существующий `listBroadcastAuditAction`);
deep-link `archive` → `BroadcastDeliveryArchiveClient`.

**Checklist:**
- [ ] тест: `archive=1` открывает архив.
- [ ] **Phase-gate:** `pnpm --dir apps/webapp test -- src/app/app/doctor/broadcasts` зелёный.

**Коммит блока 4:** `feat(doctor-comms): 4 компонента-таба (чаты-поллинг, заявки, рассылки, комментарии) (TODO#3 Block 4)`

---

## Этап 5 — Routing (proxy.ts / doctorRouteRedirects.ts)

> Это `proxy.ts`, НЕ middleware (middleware в проекте нет).

### 5.A Правка редиректов (`e5a-redirects`)

**Шаги:** удалить ветку internal-rewrite для `/app/doctor/communications` (`doctorRouteRedirects.ts` ~85–106);
оставить **308** со старых прямых URL (`legacyRedirects` + intake-detail `id`) и deep-links (`id`, `archive`);
блок `schedule` и его `REWRITE_MARKER_HEADER` не трогать.

**Checklist:**
- [ ] `rg "communications" src/middleware/doctorRouteRedirects.ts` — нет ветки rewrite, только 308-таргеты.

### 5.B Тесты редиректов (`e5b-redirect-tests`)

**Шаги:** обновить `doctorRouteRedirects.test.ts`: `/communications` → `null` (без rewrite);
308-кейсы со старых URL сохранены; schedule-кейсы зелёные.

**Checklist:**
- [ ] `pnpm --dir apps/webapp test -- src/middleware/doctorRouteRedirects` зелёный (включая schedule).

**Коммит блока 5:** `refactor(doctor-comms): убрать internal-rewrite communications, оставить 308 (TODO#3 Block 5)`

---

## Этап 6 — Страница-шелл + чистка легаси

### 6.A Страница-шелл (`e6a-shell-page`)

**Шаги:** `app/app/doctor/communications/page.tsx` — серверный вход: `requireDoctorAccess`, грузит
`loadDoctorCommunicationsBadges` + предзагрузку непрочитанных комментариев, рендерит
`DoctorCommunicationsShell` с `initialTab`/начальными данными. (rewrite убран → страница реально рендерится.)

**Checklist:** [ ] `/app/doctor/communications` рендерит шелл (route/contract-тест); `pnpm --dir apps/webapp typecheck` зелёный.

### 6.B Чистка легаси-страниц (`e6b-legacy-cleanup`)

**Шаги:** легаси-страницы вкладок (`messages/online-intake/comments/broadcasts/page.tsx`) свести к серверному
308-редиректу на `?tab=…` (или удалить, полагаясь на 308 из redirects). Перед удалением — `rg` на runtime-
использование. Клиентские компоненты уже переехали в табы (Этапы 2/4). `schedule` не трогаем.

**Checklist:**
- [ ] `rg "DoctorCommunicationsTabsNav" src/app/app/doctor` — таб-бар только из шелла, не из 4 страниц.
- [ ] прямой заход `/app/doctor/messages` → 308 на `?tab=chats` (тест redirects).
- [ ] **Phase-gate:** `pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint` (затронутое) зелёные.

**Коммит блока 6:** `feat(doctor-comms): /communications как страница-шелл, чистка легаси-страниц (TODO#3 Block 6)`

---

## Этап 7 — Докуа, живой dev, финальный CI

### 7.A Докуа (`e7a-docs`)

**Шаги:** `communications.md` (раздел «Маршрутизация» — rewrite ушёл; TODO#3 → ✅; запись в «Журнал» с
коммитами), README модуля `program-item-discussion` (новый метод), `LOG.md`.

**Checklist:** [ ] `communications.md` TODO#3 ✅ + журнал; README обновлён.

### 7.B Живой dev (`e7b-live-verify`)

**Шаги:** `pnpm dev:doctor`, `127.0.0.1:5200` (dev-doctor login из memory) — мгновенное переключение,
deep-links `id`/`archive`, кросс-таб бейджи, чат-поллинг только активным+видимым окном.

**Checklist:** [ ] переключение мгновенное (без мигания); deep-links работают; бейджи кросс-таб.

### 7.C Финальный CI (`e7c-full-ci`)

**Шаги:** `pnpm run ci` (корневой) — один раз. **Не пушить.**

**Checklist:** [ ] `pnpm run ci` зелёный.

---

## Definition of Done

1. `/app/doctor/communications` — клиентская страница-шелл; переключение 4 табов **мгновенное** (без
   серверного ре-рендера/мигания), уже открытые табы кэшируются.
2. Таб «Комментарии» получает непрочитанные **одним doctor-wide запросом** (новый метод порта/инфры/сервиса
   с тестами и DI), история — лениво, поиск — клиент+серверный добор.
3. Чат-поллинг работает только при активном+видимом табе и только при реальном изменении.
4. Routing: internal-rewrite для communications убран из `proxy.ts`/`doctorRouteRedirects.ts`; 308 со старых
   прямых URL и deep-links сохранены; тесты обновлены и зелёные; `schedule` не затронут.
5. `pnpm run ci` зелёный; живая проверка на `127.0.0.1:5200` подтверждена; ветка **не запушена**.
6. Докуа синхронизирована (`communications.md` TODO#3 ✅ + Журнал, README модуля); `LOG.md` ведётся.
7. Намеренно НЕ сделано (зафиксировать в отчёте): рефактор «Сегодня» на новый запрос (backlog), вебсокеты, schedule.

## Процесс

- Reuse-first (эталон — экран упражнений, `DOCTOR_APP_UI_STYLE_GUIDE.md`); не хэндроллить UI-примитивы.
- Тесты по уровням step→phase (`pnpm --dir apps/webapp test -- <pattern>`); полный `pnpm run ci` — один раз финалом.
- Коммиты поэтапно по блокам, трейлер `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Не пушить.**
- Вести `LOG.md` и «Журнал» в `communications.md` по ходу.
