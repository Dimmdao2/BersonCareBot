# SUBSCRIPTION (АБОНЕМЕНТ) INITIATIVE — LOG

> Execution log (§6.10 / plan-authoring-execution-standard). Append-only. Что сделано, какие проверки, какие решения.

## 2026-07-08 13:11 MSK — #534 tests/docs acceptance hardening

### Что сделано

- `DoctorClientMembershipsPanel.test.tsx`: добавлен targeted RTL-кейс на человеческий номер `аб.#NNN` и рендер нескольких активных карточек в одной панели; существующий кейс активного абонемента дополнительно проверяет `displayNumber`.
- Существующие focused-тесты закрепляют acceptance из feedback 07.07:
  - `PatientTabRecords.memberships.test.tsx`: несколько активных абонементов, closed-history по исчерпанию, свернутое/раскрытое состояние, eye-highlight связанных записей, `аб.#NNN`/`аб #NNN от ...`, wording вкладки «Визиты».
  - `PatientTabOverview.packageWidget.test.tsx`: wording «Обзор» (`Осталось N визитов:`), суммирование нескольких активных абонементов и human package number в hint.
- `apps/webapp/src/modules/memberships/memberships.md`: синхронизированы doctor/admin recalc routes, human package number, multiple-active, closed-history и eye-highlight semantics.

### Проверки

- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run 'src/app/app/doctor/clients/DoctorClientMembershipsPanel.test.tsx' 'src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.memberships.test.tsx' 'src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.packageWidget.test.tsx'"` — 18/18 passed.
- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp typecheck"` — passed.

## 2026-07-07 — #524 Визиты: несколько активных абонементов + история закрытых

### Что сделано

- `PatientTabRecords` больше не обрезает активные абонементы до первого: вкладка «Визиты» рендерит все активные карточки.
- Для всех абонементов вкладка догружает `/sessions?includePast=true`: активный абонемент переносится в историю, если все его позиции списаны в прошлые записи (`linkage=consumed`, `isPast=true`).
- История закрытых абонементов сделана построчно: серая свернутая строка, стрелка слева, раскрытие подробной карты через общий `MembershipCardHeader`.
- SSR-shape карточки пациента дополняет `soldAt`, чтобы вкладка «Визиты» не теряла дату покупки при `initialPackages`.
- Добавлен focused RTL-тест `PatientTabRecords.memberships.test.tsx`: несколько активных, закрытый active→history, future reserved не закрывается.

### Проверки

- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run 'src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.memberships.test.tsx'"` — 3/3 passed.
- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp typecheck"` — passed.
- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp lint"` — passed.
- `bash /home/dev/orch/run-tests.sh "pnpm install --frozen-lockfile && pnpm run ci"` — passed (Next build warning about existing NFT trace in `mediaPreviewWorker`, non-blocking).

## 2026-07-05 — #386 T4(c) Переверстка карточки PatientPackageCard (Финансы) → человеческий вид + shared component

### Что сделано

- **Создан** `apps/webapp/src/shared/ui/doctor/MembershipCardHeader.tsx` — общий презентационный блок:
  заголовок, дата покупки (жирная), остаток N из M, Состав (список), Списания (даты).
- **PatientPackageCard.tsx** (Финансы) переверстан: использует `MembershipCardHeader` + добавлен fetch
  `/sessions?includePast=true` для получения дат списаний (linkage=consumed). Тип `PatientPackageCardRow`
  дополнен опциональным полем `quantityInitial` в balance.items.
- **PatientTabRecords.tsx** (Визиты/MembershipPanel) также использует `MembershipCardHeader` — убрано дублирование
  inline-блока ~50 строк. Локальные переменные `totalSessions/remainingSessions/consumeSessions` переданы в пропах.
- **DoctorClientMembershipsPanel.test.tsx**: обновлён селектор `/продажа/` → `/дата покупки/` (новый markup).
  Все 5 тестов проходят.
- **Обзор**: использует только KPI-карточку (`1 из 4`), не рендерит полный карточный блок — изменений не требуется.
- TypeCheck: 3 пред-существующих ошибки (getCatalogPackage ×2, ScheduleSetupTab ×1), новых нет.
- Живая проверка: пациент 923df858, вкладка Финансы — карточка «Индивидуальный · 1 позиция · 29.05.2026»,
  «дата покупки: 29.05.2026», «остаток: 1 из 4 занятий», «Состав: Сеанс 90 мин ×4 шт»,
  «Списания (3): 29.05.2026, 20.06.2026, 04.07.2026», кнопки Пересчитать/Записи на месте.
- Скрины: `.shots/finances_after.png`, `.shots/overview_after.png`.

### Осталось от дубля

Полная унификация выполнена: обе точки (Финансы + Визиты) используют `MembershipCardHeader`.

## 2026-07-05 — #386 КОРНЕВОЙ БАГ данных: списание опирается на be_appointments.status (Opus, автономный проход)

### Диагноз (живая dev-БД bcb_webapp_dev)

- Правда «состоялась/отменена» = **каноническая проекция `appointment_records`** (её видит доктор в карточке;
  строит `pgDoctorClients.listPatientAppointments`). `be_appointments.status` **расходится** с ней: rubitime-мост
  (`booking_rubitime_bridge_enabled`) выключен → статус «замёрз» на `confirmed` для визитов, которые доктор видит «отмена».
- Связь `be_appointment ↔ каноника`: нативная — `appointment_records.integrator_record_id = 'be:'||id`; rubitime —
  через `be_external_entity_mappings` (external_id → integrator_record_id). Один be_appointment → несколько
  канонических строк (напр. две «отмены» на один слот).
- **Пациент 923df858** (пакет 14475542, sold 29.05): каноника = 29.05 happened, **06.06 canceled**, 20.06 happened,
  04.07 happened, 25.07 future. Recalc ранее списал 4 (включая ошибочно 06.06). Должно быть 3.
- **Пациент 1c312a64** (пакет f24da286, sold 13.06, услуга bb4cb10e): в окне канон = 13.06 10:00 canceled,
  **13.06 11:00 happened** (be_status=cancelled_by_patient — стухший!), 28.06 canceled → recalc должен списать **1**.
  Владелец ждал 2, но 2-й состоявшийся визит 13.06 10:00:02 существует ТОЛЬКО как legacy `appointment_records`
  (canonical id 8446509) БЕЗ be_appointment → **списать нечем** (ledger.appointment_id FK→be_appointments). ⚠️ на владельца.

### T1+T3 (backend, сделано — коммит ниже)

- **Каноническая правда как источник eligibility.** Новый резолвер `loadCanonicalAppointmentStatuses` в
  `pgMemberships.ts`: по набору be_appointment_id возвращает `happened|canceled|none` из `appointment_records`
  (native `be:` + rubitime-mapping). Проброшен `canonicalStatus` в `listRecalcCandidateAppointments` и
  `listPackageAppointmentSessionSources` (ports + типы `CanonicalAppointmentStatus`).
- `isAppointmentEligibleForConsume` теперь: `canceled`→never, `happened`→eligible, `none`→fallback на прежний
  denylist `be_appointments.status`. Каноника ПОБЕЖДАЕТ стухший be-статус (и в recalc, и в списке сессий).
- **T3 самокоррекция:** recalc перед списанием делает correction-pass — для кандидата с `canonicalStatus=canceled`,
  у которого есть `consume`, пишет append-only `refund`, чистит `package_usage_ref`, событие `recalc_corrected_canceled`,
  возвращает баланс (переиспользуется в этом же проходе). `penalty` (штраф за поздний late-cancel) не трогаем.
  Идемпотентно (если уже есть refund — пропуск). Итог: повторный recalc после фикса статусов сам снимет ошибочное 06.06.
- Тесты `service.test.ts`: +4 (canon canceled↔be confirmed; canon happened↔be cancelled; correction refund; correction idempotent). 36/36 зелёные. TypeCheck: 0 новых ошибок.

### ЖИВАЯ ФУНКЦ. ПРОВЕРКА (Opus, playwright на :5200, before→действие→after)

- **«Пересчитать» идемпотентность (923df858):** клик кнопки в Финансах → тост «Нет новых сеансов», ledger не изменился
  (4 consume + 1 refund = нетто 3). Двойного списания нет.
- **«Пересчитать» позитив (1c312a64, свежий backdated абонемент 01.05 через create-endpoint):** debited **2** —
  02.06 (be `late_cancellation`) + 11.06 (be `cancelled_by_patient`), оба стухшие в be, каноника=состоялась → списаны;
  все реальные отмены (05-21/05-23/06-05/13.06-10:00/28.06) пропущены `status_not_eligible`. Ровно правило «не отмены = состоялось».
- **Бейдж «абонемент» (T4a):** на 3 списанных визитах 923df858 (29.05/20.06/04.07), на двух отменах 06.06 — нет. ✅
- **KPI (T4b):** Состоялись/Отмены/Переносы согласованы (923: 3/2/1; 1c3: 10/13/0). ✅
- **Карточка (T4c):** новый вид и в «Визитах», и в «Финансах» (коммит 1bae5784 + shared MembershipCardHeader).
  Финансы: «дата покупки 29.05.2026» жирным, «остаток 1 из 4», Состав, кнопки Пересчитать/Записи работают.
- **Полиш-нюансы (НЕ блокеры):** в карточке Финансов остался дублирующий старый ряд «Сеанс 90 мин: остаток 1» под кнопками;
  строка «Загрузка списаний…» пока грузится sessions-фетч; кратковременный флеш «Нет активных абонементов» до резолва клиент-фетча.
- **Инфра:** при рестарте dev перезапустил :5200 (скрипт kill-local-dev-ports задел порт параллельного дизайн-чата 5201) —
  :5200 поднят заново. ⚠️ мог задеть параллельную сессию.
- **На владельца:** тест-абонемент «TEST backdated 01.05» на профиле 1c312a64 (Берсон Дмитрий) — артефакт проверки, можно удалить.

## 2026-07-05 — #386 fix #4 (Sonnet): UI управления шаблонами абонементов в Расписание→Настройки

### Что сделано

**Backend — уже был готов (переиспользовано без изменений):**

- `upsertCatalogPackage` в `pgMemberships.ts` поддерживает create и update (передать `id` для update).
- `GET /api/doctor/booking-engine/packages` — уже был.
- `POST /api/doctor/booking-engine/packages` — уже был.

**Новый API роут:**

- `PATCH /api/doctor/booking-engine/packages/[id]` (`apps/webapp/src/app/api/doctor/booking-engine/packages/[id]/route.ts`):
  - Загружает существующий пакет `getCatalogPackage`, мёрджит патч с существующими полями, вызывает `upsertCatalogPackage`.
  - Поддерживает: `isActive`, `title`, `description`, `priceMinor`, `currency`, `validityDays`, `deductionMode`, `items`.
  - Гейт `requireDoctorBookingEngine`, 404 если не найден, 400 на невалидный body.
- `GET /api/doctor/booking-engine/packages/[id]` — возвращает один шаблон.

**UI-секция «Абонементы (шаблоны)» в Расписание→Настройки:**

- Добавлен пункт `packages` в `SETUP_SECTIONS` в `ScheduleSetupTab.tsx`.
- Компонент `SectionPackages`: список шаблонов с бейджем активен/нет + кнопка активировать/деактивировать; форма создания (название, цена ₽→копейки, срок дней, режим авто/ручной, позиции услуга×кол-во с добавить/убрать). Тост «Шаблон создан» при успехе.
- URL-секция: `/app/doctor/schedule?tab=setup&section=packages`.

**Пустое состояние в «Назначить из каталога»:**

- `DoctorClientMembershipsPanel.tsx`: если `catalog.length === 0` — отображается подсказка «Нет шаблонов — создайте в Расписание → Настройки → Абонементы (шаблоны)» вместо пустого select.

**Тесты (все зелёные):**

- `packages/route.test.ts` — 4 теста: GET list (вкл. неактивных), POST create, 400 на пустые items, 403.
- `packages/[id]/route.test.ts` — 6 тестов: GET found, GET 404, PATCH deactivate, PATCH 404, PATCH 403, PATCH invalid body.
- Все 151 тестов в `src/app/app/doctor/schedule` — зелёные.
- Все 48 тестов в `src/modules/memberships` — зелёные.

**На полиш-потом:**

- Редактирование существующего шаблона (сейчас только деактивировать/активировать).
- Удаление шаблона (soft-delete через `isActive=false` уже работает).
- Показ количества назначений из каталога (linkage с `be_patient_packages.subscriptionPackageId`).

## 2026-07-05 — #386 fix #3/#9b (Sonnet): список кандидатов для ручного списания + разблокировка прошлого

### Что сделано

**#3 — `listPackageAppointmentSessionSources` возвращала только уже привязанные записи:**

- Переписана реализация в `apps/webapp/src/infra/repos/pgMemberships.ts:379`.
  - Было: запрос начинался от `bePackageUsages` (WHERE patientPackageId=X AND appointmentId IS NOT NULL) → только привязанные записи → `appointmentIds.length === 0 → return []`.
  - Стало: запрос начинается от `beAppointments` (platformUserId + serviceIds + startAt >= soldAtIso), LEFT JOIN usages по appointmentId. Непривязанные записи появляются с `usages=[]` → `linkage="none"` → кнопка «Списать» видна.
- Сигнатура порта расширена (новые обязательные опции): `platformUserId`, `serviceIds`, `soldAtIso`.
  - Контракт обновлён в `apps/webapp/src/modules/memberships/ports.ts:74`.
  - Сервис (`service.ts:805`) передаёт эти поля из объекта `pkg` (уже загружен через `getPatientPackage`).
  - `soldAt ?? createdAt ?? "2000-01-01T00:00:00Z"` — fallback для legacy-пакетов без `soldAt`.

**#9b — `canManualConsume` для прошлых записей = false (блокировала `allowPastUnlink`):**

- В `service.ts:820` разведены два флага:
  - `pastEditAllowed = !isPast || options.allowPastUnlink` — только для `canUnlinkReserve` и `canRefundConsumed` (отвязка/возврат прошлого биллинга — контролируется системной настройкой).
  - `canManualConsume` — теперь не зависит от `allowPastUnlink`. Новый debit (не редактирование прошлого), поэтому всегда разрешён если запись «состоялась».

**Смена модели eligible-статусов (coordinator-clarification):**

- Ранее: allowlist `["completed", "visit_confirmed"]` (константа `RECALC_ELIGIBLE_STATUSES`). Проблема: автоперехода в `completed` нет, записи остаются в `confirmed`/`paid`/etc. → ноль кандидатов.
- Теперь: denylist `APPOINTMENT_INELIGIBLE_STATUSES = {cancelled_by_patient, cancelled_by_specialist, late_cancellation, no_show, rescheduled}`.
- Функция `isAppointmentEligibleForConsume(status, startsAt, endsAt, nowIso)` — используется в обоих путях:
  - `recalcPastSessionsForPackage` (bulk) — вместо `RECALC_ELIGIBLE_STATUSES.has(...)`.
  - `listPatientPackageSessions` (ручное) — `eligibleForConsume` проверяется перед `canManualConsume`.

**UI — `includePast` по умолчанию `true`:**

- `PatientPackageSessionsList.tsx:36` — `useState(false)` → `useState(true)`. Доктор сразу видит прошлые записи без включения чекбокса.

### Проверки

- `service.test.ts`: **32/32 passed** (4 новых теста, 1 обновлён под denylist).
- TypeScript (`tsc --noEmit`): **0 ошибок**.
- ESLint, vitest full: pending.

### Спорные / развилки

- `rescheduled` исключён из eligible: запись была перенесена — оригинальный слот не состоялся. Если владелец захочет иначе — убрать из denylist.
- `manual_review_required` — оставлен eligible (запись, возможно, состоялась но требует проверки; доктор решает сам).
- Для recalc `endsAt` не передаётся в `listRecalcCandidateAppointments` (не выбирается в том запросе). Т.к. recalc уже гарантирует `startAt < nowIso`, `isAppointmentEligibleForConsume(..., null, nowIso)` корректно.
- `charged_to_package` — в кандидатах появится с `linkage="consumed"` (из usages) → `canManualConsume=false` автоматически. Статус не блокирует.

---

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
- `pgMemberships.ts` — реализация через `db.transaction` + `sql\`SELECT pg_advisory_xact_lock(hashtextextended(...))\``(единственный raw SQL — разрешённый паттерн эталона). Добавлен`sql` import из drizzle-orm.
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

## 2026-07-05 — #386 T4(a)/(b)/(c) UI-недоделки, живая приёмка (Sonnet агент)

### T4(a) Маркер «по абонементу» на записях (PatientTabRecords)

- Добавил `isPackage?: boolean | null` в `PatientAppointmentItem` (ports.ts)
- В `listPatientAppointments` (pgDoctorClients.ts) — COALESCE из двух путей:
  1. native: `integrator_record_id LIKE 'be:%'` → subquery к `be_appointments`
  2. rubitime: subquery через `be_external_entity_mappings` → `be_appointments.package_usage_ref IS NOT NULL`
- UI: синий бейдж «абонемент» в строке визита (PatientTabRecords.tsx historyList)
- Проверено: `isPackage: true` для 29.05, 20.06, 04.07 у пациента 923df858 (rubitime-записи с package_usage_ref)

### T4(b) KPI-подпись «визитов оформлено M»

- Было: `визитов оформлено {completedCount - 1}` — формула бессмысленна, совпадала с отменами
- Стало: `посещений за всё время` — прямая расшифровка числа completedCount (SQL: status IN created/updated AND record_at < now)

### T4(c) Верстка блока абонемента (MembershipPanel в PatientTabRecords)

- Было: одна строка «Индивидуальный · 1 позиция · 29.05.2026 · применяется к: Сеанс 90 мин»
- Стало: название, «остаток N из M занятий», «Состав: Сеанс 90 мин ×4 шт», «Списания (N): дд.мм, дд.мм, …»
- Данные списаний: GET /patient-packages/{id}/sessions?includePast=true → sessions с linkage='consumed', startsAt = дата визита
- Добавил `soldAt`, расширенный `items` в тип ApiPackage; показываем дату покупки жирной

### Живая проверка (скриншоты)

- .shots/patient_923_records.png — пациент 923df858 (3 бейджа, 3 списания 29.05/20.06/04.07)
- .shots/patient_1c3_records.png — пациент 1c312a64 (1 бейдж, 1 списание 13.06, «действует до 03.10.2026»)
- TypeScript: только 3 предсуществующих ошибки, новых нет

## 2026-07-04 — ST-01: сервис-операция bulk-«Пересчитать» (ядро боли #2) `backend` `complex`

Воркер (Opus). Изолированный worktree `/tmp/st01-recalc`, ветка `feat/subscription-recalc` от `feat/integration`.

**Реализовано:**

- `apps/webapp/src/modules/memberships/service.ts` — новый метод `recalcPastSessionsForPackage({ organizationId, patientPackageId, createdByPlatformUserId?, nowIso? })`. Идемпотентная bulk-операция: находит прошедшие записи пациента по услугам пакета в окне `[soldAt; now)`, состоявшиеся (`completed`/`visit_confirmed`), с `linkage === "none"`, и списывает по одному сеансу на запись до исчерпания баланса позиции (без минуса). Каждое списание: `appendUsage(consume)` в append-only `be_package_usages` + `setAppointmentPackageUsageRef` (пометка записи для календаря/визита) + `appendHistoryEvent("recalc_consumed")` + best-effort `refreshPackageCalendarForAppointment`. Возврат сводки `{ patientPackageId, debited[], skipped[], outOfBalance[] }`.
- `apps/webapp/src/modules/memberships/ports.ts` — новый порт-метод `listRecalcCandidateAppointments(...)` (выборка прошедших записей пациента по услугам пакета в окне + их usages). Существующий `listPackageAppointmentSessionSources` **НЕ переиспользован для выборки**: он стартует от `be_package_usages` и возвращает только записи, уже привязанные к пакету — не находит легаси-записи БЕЗ usage, которые и нужно бэкфилить. Переиспользованы `computeItemBalances`, `computeAppointmentPackageLinkage`, `isPatientPackageWithinValidity`, `refreshPatientPackageRecord`.
- `apps/webapp/src/modules/memberships/types.ts` — типы `RecalcPastSessionsSummary`, `RecalcDebitedEntry`, `RecalcSkippedEntry`, `RecalcSkipReason`.
- `apps/webapp/src/infra/repos/pgMemberships.ts` — реализация `listRecalcCandidateAppointments` на drizzle (join `be_appointments` по `platformUserId` + `serviceId ∈ услуги пакета` + `startAt ∈ [soldAt; now)`, подтяжка usages). Без сырого SQL.

**Решения владельца:** OQ-5/OQ-7 — только `completed`/`visit_confirmed` (константа `RECALC_ELIGIBLE_STATUSES`), отменённые/неявки/незакрытые НЕ трогаем. OQ-6 — до нуля, без минуса, БЕЗ warning-UI (surplus → `outOfBalance`, не «не хватило на M»). OQ-4 — метод на конкретный пакет по id; при нескольких пакетах вызывается по каждому (FEFO-порядок — на слое вызова/API ST-02). Идемпотентность — `linkage!=none` пропускается.

**Проверки:** `apps/webapp/src/modules/memberships/service.test.ts` +11 unit-тестов (пустое окно; окно передаётся корректно; уже списана=idempotent; услуга вне пакета; неeligible-статус; исчерпание баланса=стоп без минуса; ledger+ref+history+calendar на каждое списание; несколько записей списываются; повторный вызов=no-op; inactive/expired пакет=no-op). Прогон через `/home/dev/orch/run-tests.sh`: **27 passed (27)** (16 существующих + 11 новых). `tsc --noEmit` по webapp — чисто (exit 0).

**Границы/сомнения для аудитора:**

- Окно фильтруется в SQL (`gte(startAt, soldAt)`, `lt(startAt, now)`); тест «до soldAt» проверяет корректность передаваемого окна, а не результат SQL (репо-выборку проверит интеграционный/трассировочный аудит на живой БД).
- `soldAt` fallback: если `null`, берём `validFrom`, затем `createdAt`.
- Concurrency: списание идёт последовательно, баланс декрементируется локально в пределах одного прохода. При двух ОДНОВРЕМЕННЫХ вызовах «Пересчитать» на один пакет теоретически возможно двойное списание одной записи (нет транзакционного локирования на уровне записи) — API-слой (ST-02) должен исключить параллельный повторный вызов, либо добавить unique-guard на (appointmentId, consume). Пометить для Opus-аудита.
- `charged_to_package` НЕ входит в eligible-статусы: такие записи уже несут consume-usage → отсекаются по `linkage!=none` (двойная защита).

## 2026-07-04 — ST-02: API «Пересчитать» (доктор) + закрытие гонки `backend` `complex`

Воркер (Opus). Тот же worktree `/tmp/st01-recalc`, ветка `feat/subscription-recalc` поверх ST-01 (HEAD ff2cb715). Предыдущий запуск был прерван вхолостую (0 коммитов) — переделано заново.

**Реализовано:**

- `apps/webapp/src/app/api/doctor/booking-engine/patient-packages/[id]/recalc/route.ts` — `POST` по шаблону соседнего `consume/route.ts`: гейт `requireDoctorBookingEngine()`, `id` пакета из params (body не требуется), вызов `deps.memberships.recalcPastSessionsForPackage({ organizationId (из гейта), patientPackageId, createdByPlatformUserId })`, best-effort calendar-sync (`emitPackageLinkedCalendarSync`) по каждой списанной записи, возврат полной сводки `{ ok, summary }` (`debited[]`, `skipped[]`, `outOfBalance[]`, `corrected[]`). 503 если memberships недоступен, 400 на ошибку сервиса.
- `apps/webapp/src/app/api/admin/booking-engine/patient-packages/[id]/recalc/route.ts` — admin-зеркало (у `consume` есть admin-пара → мостим ту же структуру; гейт `requireAdminBookingEngine`, без calendar-sync — как в admin/consume).

**IDOR/владение (OQ-1):** как в `consume/route.ts` — `organizationId` берётся из аутентифицированного гейта, а сервис грузит пакет через `getPatientPackage(id, organizationId)`. Пакет чужой организации резолвится в `null` → `package_not_found` (400). Recalc не может тронуть чужой пакет. Дублирующей проверки на роуте `consume` не делает — не плодим и мы (единый organizationId-фильтр в методе).

**Закрытие гонки (обязательный acceptance аудита):**

- Новый порт-метод `runWithPackageLock<T>(patientPackageId, organizationId, fn)` (`ports.ts`). PG-реализация (`pgMemberships.ts`): `db.transaction()` + `SELECT pg_advisory_xact_lock(hashtextextended(<packageId>, 0))` — транзакционно-скоупленный advisory-lock, авто-снимается на COMMIT/ROLLBACK. Второй параллельный POST recalc БЛОКИРУЕТСЯ до коммита первого, поэтому читает баланс из ledger УЖЕ после списаний первого прохода → двойного списания нет.
- Сервис (`service.ts`): весь проход «прочитать баланс → списать» обёрнут в `runWithPackageLock`. Чтение `listUsagesForPackage` перенесено ВНУТРЬ лока (не до), плюс внутри лока — свежая пере-проверка `already_debited` по только что прочитанным usages (второй проход пропускает записи, списанные первым). ST-01 сервис-слой доработан минимально, 27 тестов ST-01 сохранены зелёными.
- Fake-порт (`makePort`) получил `runWithPackageLock` = сериализующий per-key promise-mutex (семантика PG advisory-lock для теста).
- **Доказательство:** тест «two parallel recalc passes do NOT double-debit» — пакет с остатком 1 + 1 подходящая запись, два `Promise.all` вызова recalc на общий stateful-порт (ledger, который `listUsagesForPackage` отдаёт, а `recalcConsumeForAppointment` пополняет). Проверка: ровно 1 `consume` в ledger, `recalcConsumeForAppointment` вызван 1 раз, суммарно `debited=1`. ⛔ Жёсткий unique-constraint на consume НЕ добавлялся (сломал бы refund→re-consume).

**Тесты:** `recalc/route.test.ts` (+5: happy-path с полной сводкой+org+calendar-sync per debit; 403 без роли — сервис не вызван; memberships unavailable→503; идемпотентный повтор=no-op пустая сводка без sync; ошибка сервиса→400) + `service.test.ts` (+1: race). Прогон через `/home/dev/orch/run-tests.sh`: **service.test.ts 28 passed (27 ST-01 + 1 race)**, **recalc/route.test.ts passed**. `tsc --noEmit` по webapp — чисто (exit 0).

**Сомнения для аудитора:**

- Порт-метод списания `recalcConsumeForAppointment` внутри `fn` сам выполняет атомарный INSERT usage + UPDATE appointment + INSERT history. Advisory-lock сериализует проходы (второй ждёт коммита первого), поэтому списания первого видны второму после снятия лока. Полноценный общий tx-хендл для всего прохода по-прежнему не прокидывался в остальные порт-методы.
- `hashtextextended(text, int8)` — стандарт PG 12+; коллизия хэша дала бы лишнюю сериализацию двух разных пакетов (безопасно, лишь чуть медленнее), не пропуск лока.
- Race-тест — на fake-мьютексе (семантика advisory-lock), не на живой БД. Живую сериализацию подтвердит интеграционный/трассировочный аудит на реальном Postgres.
- Admin-зеркало добавлено по факту наличия admin/consume; если admin-путь для recalc не нужен продукту — удалить один файл.
