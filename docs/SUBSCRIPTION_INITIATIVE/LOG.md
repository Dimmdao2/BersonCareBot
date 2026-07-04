# SUBSCRIPTION (АБОНЕМЕНТ) INITIATIVE — LOG

> Execution log (§6.10 / plan-authoring-execution-standard). Append-only. Что сделано, какие проверки, какие решения.

## 2026-07-04 — #386 fix (Sonnet), ST-02 advisory-lock backport + ST-03 badge filter

### Что сделано
Перенесена гонко-безопасная защита из эталонного коммита `b5f3d55d` (ветка feat/subscription-recalc) на рабочую ветку feat/doctor-ui-rebuild. Исправлен BLOCKER: параллельные вызовы `recalcPastSessionsForPackage` могли дважды дебетовать один appointment через разные транзакции.

**ST-02 — advisory lock (gapless double-debit protection):**
- `ports.ts` — добавлен метод `runWithPackageLock<T>(patientPackageId, organizationId, fn)` с JSDoc.
- `pgMemberships.ts` — реализация через `db.transaction` + `sql\`SELECT pg_advisory_xact_lock(hashtextextended(...))\`` (единственный raw SQL — разрешённый паттерн эталона). Добавлен `sql` import из drizzle-orm.
- `service.ts` — тело `recalcPastSessionsForPackage` (от `listRecalcCandidateAppointments` до `return summary`) обёрнуто в `deps.port.runWithPackageLock(...)`. Добавлен `debitedApptIds` Set (строится из freshly-read usages внутри лока) для idempotency-guard: appointment, уже дебетованный первым проходом, немедленно пропускается вторым без повторной проверки linkage.
- `service.test.ts` — добавлен `makeSerializingLock()` (per-key promise chain, fake mutex); добавлен в `makePort`; добавлен тест «two parallel recalc passes do NOT double-debit».

**Admin recalc route:**
- Создан `apps/webapp/src/app/api/admin/booking-engine/patient-packages/[id]/recalc/route.ts` — зеркало doctor-роута с `requireAdminBookingEngine`; возвращает **полный `summary` объект** (не числа как в b5f3d55d), контракт идентичен doctor-роуту.
- Создан `route.test.ts` по образцу doctor-версии (4 теста: happy-path, 403, 503, 400-throw).

**MAJOR-1 / ST-03 — badge filter:**
- `pgPatientClinical.ts`, `listVisits` (~стр 256): join к `be_package_usages` добавлен фильтр `usageKind IN ('consume', 'penalty')` (drizzle `inArray`). Reserve-only визит (ещё не списан в manual-режиме) больше НЕ показывает бейдж «по абонементу».
- `inMemoryPatientClinical` возвращает `package: null` unconditionally (DB lookup не реализован в fake) — тест badge/reserve в fake-слое недостижим; задокументировано в отчёте.

**Docs:**
- `memberships.md` — добавлена секция «Race safety — ST-02 advisory lock».
- `docs/SUBSCRIPTION_INITIATIVE/LOG.md` — текущая запись.

### Проверки
- `service.test.ts`: **28/28 passed** (включая «two parallel recalc passes do NOT double-debit»).
- `doctor recalc route.test.ts`: **4/4 passed** (контракт не изменён).
- `admin recalc route.test.ts`: **4/4 passed**.
- `inMemoryPatientClinical.test.ts`: **17/17 passed**.
- ESLint (все изменённые файлы): **0 ошибок/предупреждений**.
- TypeScript (`tsc --noEmit`): **0 ошибок**.

### Подтверждения
- (а) Контракт doctor-роута НЕ изменён: route.ts не тронут, возвращает тот же `{ ok, summary }` где summary = полный объект.
- (б) Параллельный тест double-debit проходит зелёным.
- (в) Advisory-lock оборачивает ВЕСЬ проход recalc: от `listRecalcCandidateAppointments` до `return summary` включительно — читаем usages и балансы ПОСЛЕ получения лока.

## 2026-07-04 — ST-05 (Sonnet), UI: бейдж «По абонементу» на карточке визита

### Что сделано

**Трассировка потока данных (verified, без изменений в маппинге):**
- `pgPatientClinical.ts` `listVisits` (строка 315) уже устанавливает `package: pkgTitle ? { title: pkgTitle } : null` — поле добавлено в ST-03.
- `GET /api/doctor/patients/[userId]/clinical` (route.ts) передаёт `visits` напрямую через `NextResponse.json({ ok, state, visits })` — никакого белого-листа полей нет, поле `package` проходит без изменений.
- SSR: `page.tsx` вызывает `deps.patientClinical.listVisits(userId)` и кладёт результат в `initialVisits` → `PatientCardClient` → `PatientTabKarta`. Никакого маппинга полей нет.
- Runtime fetch: `PatientTabKarta.fetchClinical()` читает `/clinical`, кастует к `ClinicalApiResponse` (тип `{ visits: Visit[] }`); `Visit` уже содержит `package?: { title: string } | null` (ports.ts строка 106). Поле доходит до компонента в обоих путях.

**Изменения кода:**
- `PatientTabKarta.tsx` — добавлен import `Badge` из `@/shared/ui/doctor/primitives/badge`.
- `PatientTabKarta.tsx`, `VisitCard` (~строка 1003): если `visit.package != null` — рендерим `<Badge variant="secondary" className="bg-violet-500/15 text-violet-900" title={visit.package.title}>По абонементу</Badge>`. Размещение: в header-кнопке карточки визита, после типа (Первичный/Повторный), перед локацией. Тот же цвет фона `violet-500/15`, что у записей по абонементу в `ScheduleCalendarTab` (строка 486). `title` атрибут содержит название конкретного абонемента.
- Состояния: `visit.package` непустой → бейдж есть; `visit.package === null` или `undefined` → бейджа нет.

**Тест:**
- Создан `PatientTabKarta.visitBadge.test.tsx` (4 теста): наличие бейджа при `visit.package !== null`, `title` атрибут = название абонемента, отсутствие бейджа при `null`, отсутствие при `undefined`.

### Проверки
- 4/4 тестов `PatientTabKarta.visitBadge.test.tsx` зелёные.
- ESLint (`PatientTabKarta.tsx` + тест): 0 ошибок.
- TypeScript (`tsc --noEmit`): 0 ошибок в изменённых файлах.

### Поле package: где доходит до клиента
Поле уже присутствовало в маппинге (ST-03). Маппинг добавлять не потребовалось — поле проходит сквозь API и SSR без фильтрации. ST-05 сделал только UI-рендер.

## 2026-07-04 — ST-04 (Sonnet), UI: Финансы + «Пересчитать» + Records manual-only

### Что сделано
- **DoctorClientMembershipsPanel.tsx** — добавлен проп `showCreateForm?: boolean` (default: `true`).
  Когда `false` — скрываются секции «Назначить из каталога» и «Индивидуальный абонемент»;
  ручное списание и карточки активных абонементов остаются.
- **DoctorClientMembershipsPanel.tsx** — добавлена кнопка **«Пересчитать»** в `PatientPackageCard`
  (передаётся через prop `onRecalc`). Вызов: `POST /api/doctor/booking-engine/patient-packages/[id]/recalc`.
  Тост успеха: «Списано N сеансов» / «Нет новых сеансов для списания». Ошибка сети/ok:false → toast.error (ненавязчиво, UI не ломается).
- **PatientPackageCard.tsx** — добавлен prop `onRecalc?: () => void`; кнопка «Пересчитать» рядом с «Записи».
- **PatientTabFinances.tsx** — добавлена секция «Абонементы» (Section 2) с полной `DoctorClientMembershipsPanel`
  (`showCreateForm=true`) — полное управление абонементом во вкладке «Финансы».
- **DoctorClientRecordsTab.tsx** — передаётся `showCreateForm={false}` → на вкладке «Записи» только
  ручное списание (форма заведения скрыта).
- **DoctorClientMembershipsPanel.test.tsx** — добавлены тесты: `showCreateForm=false` (скрытие форм),
  «Пересчитать» happy-path (тост «Списано N»), «Пересчитать» с пустым debited (тост «Нет новых»).
  Все 5 тестов зелёные.

### Проверки
- TypeCheck (`tsc --noEmit`): 0 ошибок в изменённых файлах.
- ESLint: 0 ошибок.
- Тесты `DoctorClientMembershipsPanel.test.tsx`: 5/5 passed.

### Решения OQ (применено)
- OQ-1/OQ-3: переиспользована `DoctorClientMembershipsPanel` (не скопирована, не задублирована).
- OQ-2: полное управление — во «Финансы»; на «Записях» (`DoctorClientRecordsTab`) — manual-only.
- OQ-6: тост без предупреждения о нехватке; только «Списано N» / «Нет новых».

## 2026-06-20 — Planner (Opus), фаза планирования (§3)
- Прочитан канон `docs/AGENT_AUTORUN_SCHEME.md` (§3/§6/тиринг ⚖️/acceptance 🎯), `orch/roles/ROLE_PROMPTS_v3.md` (роль Planner), `AGENTS.md` + `.cursor/rules/*` (список).
- READ-ONLY исследование кода (грепы + чтение). **Ключевая находка:** абонементы УЖЕ существуют как зрелая подсистема `modules/memberships` + таблицы `be_subscription_packages`/`be_patient_packages`/`be_package_usages` (миграции 0094/0095/0105). Частично закрыты боли #3 (календарь ✅-пометка+фильтр) и #5 (KPI-виджет в «Обзоре»). Боль #1 есть, но на вкладке «Записи», не «Финансы». Боль #2 (bulk-«Пересчитать») — НЕТ. Боль #4 (признак на визите) — НЕТ.
- Создана инфра инициативы: `REQUIREMENTS.md` (боли дословно + карта покрытия), `ROADMAP.md` (ST-01..ST-07, backend/ui разделены, тиринг по риску), `OPEN_QUESTIONS.md` (OQ-1..OQ-11), `LOG.md`, `audit/`.
- Код НЕ менялся (READ-ONLY). Dev-сервер не поднимался.

### НАШЁЛ/ИЗМЕНИЛ (инструментация §⚖️)
`НАШЁЛ: да | Существующая система абонементов modules/memberships + be_*_packages (миграции 0094/0095/0105): создание с soldAt, ledger be_package_usages, balanceCalculator, FEFO, doctor-панель DoctorClientMembershipsPanel на вкладке «Записи», календарь ✅-пометка+фильтр «По абонементу» (ScheduleCalendarTab), KPI-виджет Package в «Обзоре». Финансы-вкладка (PatientTabFinances) работает с ОТДЕЛЬНОЙ patient_payment (cash/acquiring) — абонемента там нет. Net-new: bulk-«Пересчитать» (списать прошедшие записи в окне [soldAt; now]), вывод во «Финансы», признак абонемента в проекции визита (listVisits). ИЗМЕНИЛ КОД: нет (планирование, READ-ONLY).`
