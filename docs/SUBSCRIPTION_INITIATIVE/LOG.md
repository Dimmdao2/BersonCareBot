# SUBSCRIPTION (АБОНЕМЕНТ) INITIATIVE — LOG

> Execution log (§6.10 / plan-authoring-execution-standard). Append-only. Что сделано, какие проверки, какие решения.

## 2026-07-05 — #386 приёмочные фиксы #1/#2 + #9a (Sonnet): router.refresh + стоимость в карточке

### Что сделано

**#1/#2 — блоки абонемента не обновлялись без перезагрузки** (Финансы / Обзор / Визиты):
- `DoctorClientMembershipsPanel.tsx` — добавлен `const router = useRouter()` (import `useRouter` из `next/navigation`).
- `router.refresh()` вызывается ПОСЛЕ каждой успешной мутации:
  - `createManual` (индивидуальный абонемент) — после `void loadPackages()`
  - `offerCatalog` (из каталога) — после `void loadPackages()`
  - `manualConsume` (ручное списание) — после `void loadPackages()`
  - `recalcPackage` (пересчёт) — после `void loadPackages()`
- `loadPackages()` оставлен (обновляет панель мгновенно); `router.refresh()` рядом инвалидирует SSR на вкладках Обзор/Записи.
- Колбэк `onChanged` в `PatientPackageSessionsList` уже проксирован из панели (карточка → `onChanged={onChanged}`) — refund/detach из списка записей тоже вызывают `loadPackages()` через этот колбэк; `router.refresh()` туда не добавлялся (колбэк вызывается с уровня панели).

**#9a — в карточке абонемента не отображалась стоимость:**
- `PatientPackageCard.tsx` — в тип `PatientPackageCardRow` добавлено поле `priceMinor?: number | null` (поле структурно приходило из API, тип его не объявлял — cast `as PatientPackageCardRow[]` его отбрасывал).
- Вычислен `priceLabel` через уже существующий `formatPaid()`.
- В JSX (subtitle строка) добавлен вывод `· стоимость <сумма>` между датой и оплаченной суммой.
- Отображение notes: заменён `line-clamp-2` на явный обрез `slice(0, 80) + "…"` для длинных комментариев.

### Проверки
- `DoctorClientMembershipsPanel.test.tsx`: **5/5 passed** (добавлен мок `next/navigation` → `useRouter: () => ({ refresh: vi.fn(), ... })`).
- `PatientPackageSessionsList.test.tsx`: **1/1 passed** (без изменений).
- ESLint (оба файла): **0 ошибок**.
- TypeScript (`tsc --noEmit`): **0 ошибок**.

### Спорные моменты / решения
- `router.refresh()` вызывается синхронно (не awaited) — это корректно, Next.js обрабатывает его асинхронно в фоне. Добавление `await` потребовало бы `async` в `recalcPackage` (он уже async) и в `startTransition`-callbacks (не ждут).
- `onChanged` из `PatientPackageSessionsList` (detach/refund) не получил `router.refresh()` напрямую — колбэк проксируется через `DoctorClientMembershipsPanel.onChanged` → `loadPackages()`. Если понадобится refresh и оттуда, прокинуть через `onChanged` панели.

---

## 2026-07-05 — #386 приёмочные фиксы #5-#8 (Sonnet)

### Что сделано

**#5 — запрет будущей даты оплаты:**
- `DoctorDatePicker.tsx` — добавлен проп `max?: string` (формат "yyyy-MM-dd"). При наличии пробрасывается в `DayPicker` как `disabled={{ after: maxDate }}` — будущие даты визуально отключены и недоступны.
- `DoctorClientMembershipsPanel.tsx` — вычисляется `today = DateTime.now().toFormat("yyyy-MM-dd")` и передаётся как `max={today}` в оба `DoctorDatePicker` (каталог ~стр 315, индивидуальный ~стр 340).

**#6 — фильтр выключенных услуг:**
- Тип состояния `services` расширен: `isActive: boolean; usableInPackages: boolean` (поля приходят от API, тип `BeClinicService` их содержит).
- В рендере услуг добавлен `.filter((s) => s.isActive && s.usableInPackages)` — только активные и помеченные «usableInPackages» попадают в дропдаун. Флаг: API `/booking-engine/services` возвращает `BeClinicService[]`, оба поля документированы в `src/modules/booking-engine/types.ts`.

**#7 — расшифровка позиции:**
- Блок `Позиций: {items.length}` заменён списком `<ul>` — каждая позиция показывает название услуги (по `services.find`) и количество: `«ЛФК — 3 шт.»`. Рядом кнопка `✕` для удаления позиции из списка.

**#8 — тост «Абонемент создан»:**
- `createManual` и `offerCatalog` — после успешного ответа API вызывается `toast.success("Абонемент создан")` перед сбросом формы. Использован тот же `react-hot-toast`, что в `recalcPackage`.

### Проверки
- `DoctorClientMembershipsPanel.test.tsx`: **5/5 passed** (тесты не потребовали правки — мок возвращает пустой `services: []`; старый текст «Позиций:» нигде в тестах не проверялся).
- ESLint (оба изменённых файла): **0 ошибок**.
- TypeScript (`tsc --noEmit`): **0 ошибок**.

### Спорные моменты / решения
- **#6 фильтр двойной**: фильтруем по `isActive && usableInPackages` (не только `isActive`). Логика: абонемент состоит из позиций — услуга должна быть и активна, и явно разрешена для пакетов. Если владелец захочет фильтровать только по `isActive`, убрать `&& s.usableInPackages`.

---

## 2026-07-04 — #386 polish (Sonnet), UI-аудит: 3 MINOR правки

### Что сделано

**MINOR-1 — тост-склонение (user-visible):**
- `DoctorClientMembershipsPanel.tsx` — добавлена функция `pluralizeSessions(n)` (стандартное русское склонение: 1→«сеанс», 2-4→«сеанса», 5-20/остальные→«сеансов»).
- Тост `recalcPackage` теперь использует `pluralizeSessions`: «Списано 1 сеанс», «Списано 3 сеанса», «Списано 5 сеансов».
- `DoctorClientMembershipsPanel.test.tsx` (~строка 211) обновлён под грамматически верный вывод: `"Списано 1 сеанс"` (не регрессия — тест следует за исправлением кода).

**MINOR-2 — lazy-fetch форм заведения:**
- `DoctorClientMembershipsPanel.tsx` — fetch `/booking-engine/services` и `/booking-engine/packages` обёрнуты в `if (showCreateForm) { ... }`. При `showCreateForm=false` (вкладка «Записи») эти запросы не уходят. Зависимость `showCreateForm` добавлена в массив deps `useEffect`. Поведение при `showCreateForm=true` не изменено.

**MINOR-3 — type-gap ApiPackageItemBalance:**
- `PatientTabRecords.tsx` — тип `ApiPackageItemBalance` расширен: добавлено опциональное поле `displayRemaining?: number | null` (runtime поле уже приходило, тип был неполным).

### Проверки
- `DoctorClientMembershipsPanel.test.tsx`: **5/5 passed**.
- `PatientTab*` тесты (7 файлов): **34/34 passed**.
- ESLint (все 3 изменённых файла): **0 ошибок**.
- TypeScript (`tsc --noEmit`): **0 ошибок**.
- Violet-цвет бейджа (MINOR-4) **НЕ трогался** — осознанное согласование с календарём, миграция токенов = отдельная #312.

---

## 2026-07-04 — #386 ST-06 (Sonnet, верификатор), Календарь: код-only подтверждение пометки «по абонементу»

### Вердикт: ПОМЕТКА ДОХОДИТ — ДА (цепочка цела). Ничего не менялось.

### Доказательная трассировка

**1. Запись → packageUsageRef (запись в БД)**

`recalcPastSessionsForPackage` (service.ts:1013) вызывает `deps.port.recalcConsumeForAppointment(...)`.
`pgMemberships.ts:627-677` — `recalcConsumeForAppointment` выполняет одну транзакцию:
  - `INSERT INTO be_package_usages` (usageKind="consume") → возвращает usage.id
  - `UPDATE be_appointments SET package_usage_ref = usage.id` (строка 649-651)
  - `INSERT INTO be_package_history_events` (eventType="recalc_consumed")

Итог: у списанной прошлой записи `be_appointments.package_usage_ref` = UUID usage-строки.

**2. packageUsageRef → CalendarAppointmentEvent (канонический путь)**

`pgBookingCalendar.ts:185` — `packageUsageRef: beAppointments.packageUsageRef` явно выбирается в SELECT.
`pgBookingCalendar.ts:326` — `packageUsageRef: row.packageUsageRef ?? null` передаётся в CalendarAppointmentEvent.
Параллельно строится `packageTitleByAppt` через JOIN:
  `bePackageUsages → bePatientPackages → beSubscriptionPackages.title` (строки 234-244).
  NB: innerJoin на beSubscriptionPackages → для РУЧНЫХ абонементов (subscriptionPackageId=null) title будет null,
  но `packageUsageRef` всё равно не null → ✅-пометка и фильтр «По абонементу» работают через OR.

**3. packageUsageRef → ✅ + фильтр (ScheduleCalendarTab.tsx)**

Строка 485: `if (event.packageUsageRef || event.packageTitle)` → CSS violet-класс.
Строка 497: `const packagePrefix = event.packageUsageRef || event.packageTitle ? "✅ " : "";` → заголовок события.
Строка 1495: `bySubscriptionInPeriod: (e) => Boolean(e.packageUsageRef || e.packageTitle)` → KPI-фильтр.

**4. Прошедшие записи не выпадают**

`pgBookingCalendar.ts` не фильтрует по статусу — кроме `deletedAt IS NULL` и range-overlap.
Прошедшие записи (status=completed/visit_confirmed) возвращаются в `listAppointmentsInRange`,
если `startAt <= rangeEnd` и `endAt >= rangeStart`. Никакого условия «только будущие» нет.

**5. Legacy-путь (Rubitime, pgBookingCalendarLegacy.ts)**

SQL-запрос строки 24-25: `COALESCE(be_from_map.package_usage_ref, be_from_id.package_usage_ref)` и `COALESCE(pp_from_map.title, pp_from_id.title)`.
Оба пути (по entity-mapping и по `be:UUID` формату id) подтягивают `package_usage_ref` из be_appointments.
`mapLegacyRecordToCalendarEvent.ts:86-87` → `packageUsageRef`/`packageTitle` → CalendarAppointmentEvent.

**6. best-effort calendar sync после recalc**

`service.ts:1036` — `await refreshPackageCalendarForAppointment(cand.appointmentId)` после каждого consume.
`recalc/route.ts:24-28` — дополнительно после recalc: для каждого `entry.debited` вызов `emitPackageLinkedCalendarSync`.
Этот sync — best-effort GCal; для UI-калиндаря в приложении пометка работает через `package_usage_ref` в БД напрямую.

### Проверки
- Трассировка кода: READ-ONLY, баги не обнаружены. Код не менялся.
- Тесты существующие: service.test.ts (28/28), mapLegacyRecordToCalendarEvent.test.ts — packageUsageRef/packageTitle проходят через mapper (строки 56-60 теста).
- service.test.ts строки 750-755: явно подтверждают, что `recalcConsumeForAppointment` (порт) атомарно делает INSERT usage + UPDATE appointment.packageUsageRef + INSERT history — и `setAppointmentPackageUsageRef` отдельно НЕ вызывается (всё внутри порта).

### Что менялось
Ничего. Код-only верификация. Все 3 вопроса ST-06 подтверждены доказательно по коду.

---

## 2026-07-04 — #386 ST-07 (Sonnet), Обзор: название + остаток абонемента в KPI-виджете

### Что сделано

**Диагноз (до правок):**
- KPI-виджет «Абонемент» уже существовал и показывал `remaining из quantityInitial` через `sumBalance`.
- Поле `balance.items[].remaining` доходило корректно через API → `PatientPackageListItem.balance.items`.
- Однако `displayRemaining` (для показа: зарезервированные сеансы считаются как «в наличии») **не передавался** — ни в `PackageItem.balance.items` типе, ни в SSR-маппинге `page.tsx`.
- **Название абонемента** (поле `title`) в PackageItem было, но **не рендерилось** — виджет показывал только число, без подписи что это за абонемент.

**Изменения кода:**

1. **`PatientTabOverview.tsx`:**
   - `PackageItem.balance.items` тип: добавлен `displayRemaining?: number | null`.
   - `PackageItem` тип: добавлен `displayRemaining?: number | null`.
   - `sumBalance` — расширен на `"displayRemaining"` ключ + защита: возвращает `null` (а не `0`) когда ни одна позиция не несёт это поле, чтобы не маскировать `remaining`.
   - `activePackage` — теперь включает `displayRemaining: sumBalance("displayRemaining", ...)`.
   - Рендер KPI `value`: приоритет `displayRemaining ?? remaining` (зарезервированные считаются owned), формат `"X из Y"`.
   - Рендер KPI `hint`: теперь показывает **название абонемента** (`title`, с обрезкой >28 символов + "…"); fallback → дата действия → "осталось занятий".

2. **`page.tsx`** (SSR-маппинг):
   - В `initialPackagesForTabs` добавлен `displayRemaining: item.displayRemaining` — поле теперь доходит при SSR.

3. **`PatientTabOverview.packageWidget.test.tsx`** (новый файл):
   - 6 тестов: активный абонемент → "X из Y" + название; displayRemaining > remaining приоритет; fallback на remaining; нет абонемента → "—" + "абонемент не активен"; нет items → "активен"; обрезка длинного title; суммирование нескольких позиций.

### Откуда берётся остаток
- Остаток вычисляется в `modules/memberships/balanceCalculator.ts` → `computeItemBalances()` → поля `remaining` (доступно для брони) и `displayRemaining` (для показа пациенту; зарезервированные ещё не списаны = считаются).
- `listPatientPackagesForUser` в service.ts вызывает `withBalance()` → `computeItemBalances()` → включает оба поля в `balance.items[]`.
- API GET `/patient-packages` возвращает `PatientPackageListItem[]` с полным `balance`.
- SSR в `page.tsx` формирует `initialPackagesForTabs` и теперь прокидывает `displayRemaining`.
- После «Пересчитать» (ST-04) следующий fetch `/patient-packages` вернёт обновлённый баланс (новые `consume`-записи в ledger) — виджет обновится при следующей загрузке вкладки или полном рефреше. Inline-рефреш после recalc (без перезагрузки вкладки) не реализован в Overview — рекомендован как улучшение.

### Проверки
- `PatientTabOverview.packageWidget.test.tsx`: **6/6 passed** (новые тесты ST-07).
- `PatientTabOverview.calNav.test.tsx`: **6/6 passed** (регрессия не введена).
- `PatientTabOverview.obzor-thumbs.test.ts`: **6/6 passed** (регрессия не введена).
- ESLint (PatientTabOverview.tsx + test + page.tsx): **0 ошибок**.
- TypeScript (`tsc --noEmit`): **0 ошибок**.

### Покрытые состояния
1. Нет активного абонемента → "—" / "абонемент не активен"
2. Активный абонемент с balances → "X из Y" + название в hint
3. После «Пересчитать» → при следующем fetch `/patient-packages` показывает обновлённый остаток

---

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
