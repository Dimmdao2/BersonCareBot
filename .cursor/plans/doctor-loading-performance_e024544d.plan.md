---
name: doctor-loading-performance
overview: "Ускорить первичную загрузку и переходы кабинета врача через server-first bootstrap видимой страницы: данные первого экрана собираются на сервере параллельно и стримятся в UI, а клиентские fetch остаются для обновлений и открытых позже поверхностей. Сначала устраняются подтверждённый prefetch-шторм и повторные SSR-чтения; безопасность и свежесть сохраняются без глобального кэша session/tenant/clinical/entitlement-данных."
todos:
  - id: baseline-prefetch
    content: Добавить безопасные timing-метрики на TEST и убрать viewport/mount prefetch дорогих doctor-маршрутов
    status: completed
  - id: shell-dedup
    content: Создать request-local doctor workspace/shell loader и убрать повторные session/cabinet/waterfall reads
    status: completed
  - id: server-bootstrap-inventory
    content: Классифицировать post-load fetch и перенести данные первого видимого экрана в общие server-first loaders
    status: completed
  - id: patient-card-progressive
    content: "УСТАРЕЛО/ЗАМЕНЕНО → doctor-loading-closure (DL-MSG/DL-TZ/DL-STREAM). Перевести карточку клиента на active-tab server bootstrap, Suspense и lazy visited-tab mounting без потери состояния"
    status: completed
  - id: route-rollout
    content: "Catalogs (Stage 2 b2032b468) + schedule/Today (Stage 3 7821a26a6). Remaining: db-profile, test-rollout soak"
    status: completed
  - id: db-profile
    content: Профилировать оставшиеся медленные Drizzle ports и оптимизировать только доказанные DB bottlenecks
    status: pending
  - id: test-rollout
    content: "Пройти targeted gates, итоговый CI и TEST soak с сравнением p50/p95, запросов и bundle size. Safari hardware gate (DL-RUNTIME-03) BLOCKED — не completed."
    status: pending
isProject: false
---

# Ускорение кабинета врача без потери стабильности

> **Открытая часть workstream** заменена closure-планом
> [`.cursor/plans/doctor-loading-closure_9a07581d.plan.md`](doctor-loading-closure_9a07581d.plan.md)
> (audit: [bf710216-f40d-4f8f-a0b9-4cc69ea69861](bf710216-f40d-4f8f-a0b9-4cc69ea69861)).
> Этот файл — источник исходных требований Stage 0–3 и evidence завершённых этапов; не второй активный чек-лист.

## Статус после Stage 3 (`7821a26a6` + `b2032b468`)

**Stage 0 (`286db9b91`):** prefetch off dense lists, request-local `loadDoctorWorkspaceShell`, tab-aware patient card bootstrap, fetch inventory.

**Stage 1 (`91e84daec`):** TEST nginx `request_time` / `upstream_response_time` + baseline capture — `docs/_TODO/DOCTOR_LOADING_BASELINE.md`, `deploy/host/apply-test-nginx-webapp.sh`.

**Ops slice (`f7db88013`):** integrator scheduler wakes — CSRF exempt for `materialize-wake`, locked-mode infra cron allowlist for `digest-wake` (code on branch; post-deploy verify on TEST still part of soak).

**Stage 2 catalogs (`b2032b468`):** treatment-program-templates list-only SSR + `loadTreatmentProgramLibrary` on editor open; lfk-templates / recommendations / clinical-tests / test-sets promise-props + Suspense; route `loading.tsx` on heaviest catalogs; PatientCard `next/dynamic` object-literal build fix.

**Stage 3 (`7821a26a6`):** schedule tab `cal` server bootstrap (`loadDoctorScheduleCalendarBootstrap`), Today dashboard Suspense stream (`loadDoctorTodayDashboard`), schedule `loading.tsx`.

**Инженерный Stage 2/3 rollout закрыт** (todo `route-rollout`). **Closure EXEC_SHA `bb4752368`:** metrics §7 baseline; **test-rollout** и **db-profile** — **pending** (Safari BLOCKED DL-RUNTIME-03). Post-audit fixes §8 baseline — commit/push/TEST redeploy pending.

## Наблюдаемая исходная проблема

- При открытии списка клиентов браузер за 2 секунды отправляет до 29 RSC-запросов карточек; справочники одновременно префетчат все видимые категории. Источники: обычные `Link` в [PatientsPageClient.tsx](apps/webapp/src/app/app/doctor/patients/PatientsPageClient.tsx) и [ReferencesSidebar.tsx](apps/webapp/src/app/app/doctor/references/ReferencesSidebar.tsx).
- [doctor/layout.tsx](apps/webapp/src/app/app/doctor/layout.tsx) повторно разрешает сессию/workspace/cabinet и выполняет несколько последовательных волн org/settings/branding/entitlement/billing-чтений на RSC-запрос.
- [patients/[userId]/page.tsx](apps/webapp/src/app/app/doctor/patients/[userId]/page.tsx) ждёт данные всех восьми вкладок до первого ответа; [PatientCardClient.tsx](apps/webapp/src/app/app/doctor/patients/[userId]/PatientCardClient.tsx) сразу монтирует даже скрытые вкладки. Поэтому скрытая «Коммуникации» создаёт/читает чат, а скрытая «Программа» префетчит маршрут размером около 2.57 MB. Сам маршрут карточки сейчас около 1.48 MB uncompressed first-load JS.
- Из каталога упражнений уже можно переиспользовать promise-props + `Suspense/use()`, route skeleton, динамические тяжёлые компоненты, CSS-first layout и виртуализацию из [EXERCISES_CATALOG_PERFORMANCE_PRIMITIVES.md](docs/ARCHITECTURE/EXERCISES_CATALOG_PERFORMANCE_PRIMITIVES.md).

## 1. Сначала измерение и быстрый безопасный выигрыш

- Добавить в repo-managed nginx access logging `$request_time` и `$upstream_response_time` через [bersoncare-webapp-access-log.example.conf](deploy/nginx/bersoncare-webapp-access-log.example.conf), не логируя query/PII; применить сначала только на TEST.
- Зафиксировать baseline для `/app/doctor`, `/patients`, одной карточки, schedule, communications, references и тяжёлых каталогов: server TTFB p50/p95, click→fallback, click→content, число RSC/API-запросов, first-load JS.
- Отключить viewport-prefetch у плотных динамических списков: карточки клиентов и ссылки справочников получают `prefetch={false}`. Для действительно полезных переходов разрешить только intent-prefetch по hover/focus и не раньше пользовательского намерения.
- Удалить mount-time `router.prefetch` тяжёлого редактора программы из [PatientTabProgram.tsx](apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabProgram.tsx); полагаться на route loading либо intent-prefetch непосредственно перед переходом.
- Приёмка: открытие списка не делает ни одного запроса карточки до hover/click; справочники не запрашивают все категории; поведение клика и возврата не меняется.

## 2. Убрать повторную работу общего doctor-shell

- Вынести единый request-local loader workspace/shell по уже используемому в проекте паттерну `React.cache` из [loadManagementWorkspace.ts](apps/webapp/src/app/app/manage/loadManagementWorkspace.ts). Layout и дочерние doctor pages должны использовать один результат на RSC-запрос.
- Удалить лишний прямой `getCurrentSession()` из [doctor/layout.tsx](apps/webapp/src/app/app/doctor/layout.tsx): `requireOrganizationWorkspaceContext()` уже выполняет тот же platform redirect и session gate.
- Дедуплицировать cabinet access между guard и layout через request-local resolver, сохраняя fail-closed проверку в guard.
- Объединить независимые `organization/settings/branding` и mechanic/snapshot/lifecycle чтения в одну параллельную волну; billing principal оставить отдельной последовательной секцией, как требует текущая security-граница.
- Не использовать `unstable_cache`/cross-request cache для session, membership, branding override, entitlements, billing или clinical data. Ключ любого request-local чтения обязан включать `organizationId`/`userId`.
- Проверки: существующие guard/tenant tests плюс fault injection на чужую организацию, отозванную сессию, blocked cabinet и смену entitlement — оптимизация не должна открыть доступ или показать чужие данные.

## 3. Server-first bootstrap вместо каскада fetch после hydration

- До изменения отдельных страниц составить inventory всех `fetch`/polling/effect-загрузок doctor-zone и для каждой записи зафиксировать: где данные видимы, есть ли уже SSR-дубль, это read или side effect, требуемая свежесть, какой app-layer loader/port является единственным источником.
- Данные, необходимые сразу на первом видимом экране, запускать на сервере параллельно сразу после workspace guard и передавать как snapshot/promise-props. `Suspense` должен позволять shell/header/toolbar появиться раньше медленного виджета, но браузер после hydration не должен повторять тот же initial read.
- Route handlers и RSC не должны реализовывать одно чтение дважды: вынести общие app-layer loaders над существующими ports; RSC вызывает loader напрямую, API использует его же для refresh. Сервер не должен делать внутренний HTTP-fetch в собственный API.
- Клиентский запрос остаётся только для:
  - обновления уже показанного snapshot по событию, интервалу или явному refresh;
  - следующего диапазона/месяца календаря;
  - вкладки, диалога или detail-панели, которых не было на первом экране;
  - mutation и последующего точечного reconcile.
- Для live-поверхностей использовать модель `server snapshot → client continuation`: календарь получает текущий видимый месяц с сервера и запрашивает следующий при навигации; чат получает read-only snapshot существующего разговора/сообщений/непрочитанного и затем продолжает polling/live refresh только пока чат видим.
- Не выполнять mutating `conversations/ensure` во время RSC render или prefetch: создание разговора остаётся явным действием при реальном открытии чата. Это исключает side effect от повторного render/prefetch.
- Добавить единый контракт свежести: snapshot содержит достаточный cursor/version/`fetchedAt` там, где он нужен; клиент применяет только более новое обновление и после mutation обновляет конкретный ресурс, а не всю страницу.
- Приёмка inventory: для каждого initial `fetch` есть бинарное решение `server bootstrap | refresh | inactive surface | mutation`, владеющий loader и проверка отсутствия SSR/client дубля.

## 4. Перестроить карточку клиента на progressive server loading

- Оставить в блокирующем SSR-пути только workspace/identity/header. Все данные первого экрана активной вкладки запускать на сервере сразу и параллельно как promise-props, раскрывая независимые блоки через локальные `Suspense/use()` по образцу [exercises/page.tsx](apps/webapp/src/app/app/doctor/exercises/page.tsx) и [ExercisesPageClient.tsx](apps/webapp/src/app/app/doctor/exercises/ExercisesPageClient.tsx).
- Разделить восемь вкладок `PatientCardClient` динамическими импортами. На старте монтируется только активная вкладка; после первого открытия вкладка остаётся смонтированной и скрывается, чтобы не терять несохранённое состояние при переключении.
- Дефолтный overview получает с сервера все реально видимые данные, включая текущий месяц календаря, программу, пакеты, заметки/задачи и прочие виджеты; mount-effects принимают snapshot и не повторяют initial fetch. Последующие месяцы, обновления и mutation reconcile остаются на клиенте.
- Для inactive tabs использовать те же общие loaders через существующие doctor API при первом открытии; если URL сразу открывает конкретную вкладку, её bootstrap собирается на сервере, а не через hydration-fetch.
- Отдельно прекратить скрытые side effects: чат, program-editor prefetch, файлы, финансы и другие невидимые поверхности не запускаются до открытия соответствующей вкладки. На active tab каждый независимый блок имеет локальный skeleton/error fallback.
- Добавить route-level `loading.tsx` для карточки клиента и общий лёгкий loading-state doctor content; shell и текущая страница должны оставаться видимыми во время перехода.
- Приёмка: после hydration default overview не повторяет initial reads и не запускает API скрытых вкладок; календарь/чат продолжают обновляться после server snapshot; переключение сохраняет draft/state уже посещённой вкладки; bundle карточки уменьшается минимум на 30%; ошибка одного виджета не блокирует header и остальные данные.

## 5. Раскатать каталоговые примитивы и tab-aware server bootstrap

- Провести census тяжёлых doctor routes по build diagnostics и применить существующий контракт `promise-props + Suspense`, dynamic heavy forms/dialogs и [VirtualizedItemGrid.tsx](apps/webapp/src/shared/ui/doctor/catalog/VirtualizedItemGrid.tsx) только там, где измерение подтверждает большой DOM/CPU: прежде всего treatment-program templates, recommendations, LFK templates и content.
- Не виртуализировать список клиентов сразу: это может сломать scroll restore, focus и deep-link IDs. Сначала `prefetch={false}` и `content-visibility`; виртуализация — только если после этого client render остаётся значимой частью p95.
- [communications/page.tsx](apps/webapp/src/app/app/doctor/communications/page.tsx) должен server-bootstrap тяжёлые данные только выбранного tab; остальные tab chunks/data — при открытии, после чего продолжаются live updates. Аналогично проверить schedule и home: видимая вкладка приходит с сервера, невидимые вкладки/модалки не грузятся.
- Для каждого маршрута добавить соответствующий skeleton, сохраняя toolbar/filters вне Suspense, как уже сделано в каталоге упражнений.

## 6. DB и фоновые запросы — только после профиля

- После устранения лишних RSC/API запросов снять query count и `EXPLAIN (ANALYZE, BUFFERS)` только для оставшихся p95-медленных портов. Сначала сокращать число вызовов/выборку и использовать существующие Drizzle ports; индексы добавлять лишь на доказанную горячую колонку тем же изменением.
- Не создавать aggregate raw SQL и не обходить app ports. Если нужен batch-read, он оформляется одним портом/Drizzle implementation с org scope и отдельной проверкой tenant isolation.
- Исправить TEST cron-шум (`operator-health` 500 и `materialize-wake` 403 каждые 5 секунд) отдельным ops-slice: это не корень задержек, но убирает постоянную лишнюю нагрузку и шум измерений.

## 7. Поэтапная проверка и rollout

- После каждого slice: targeted tests + webapp typecheck/lint; полный `pnpm run ci` — только на итоговом integration/deploy gate согласно правилам репозитория.
- TEST-матрица: холодный документ, тёплая RSC-навигация, Safari и Chromium, 1/10/100+ клиентов, обычный doctor/owner/clinic-admin, blocked/read-only entitlement, ошибки одного backend-port.
- Критерии завершения: ноль unsolicited detail-prefetch; ноль повторных initial fetch после server snapshot; p95 upstream RSC основных переходов снижен минимум на 40% относительно baseline; карточка показывает header и стримит overview без ожидания inactive tabs; live calendar/chat обновляются после bootstrap; bundle и число запросов не регрессируют; tenant/session/entitlement gates остаются fail-closed.
- После стабильного TEST soak зафиксировать измерения до/после и только затем готовить отдельный owner-gated PROD rollout.