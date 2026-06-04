# Этап 3 — декомпозиция (абонементы: UX и корректное списание)

**Статус:** `done`  
**Родитель:** [`ROADMAP.md`](ROADMAP.md) §9  
**Зависимости:** этап 0 (`INVENTORY_AND_IA.md` §4.1, §5); **этап 2 `done`** (fail-closed `branch_service_mapping_missing`, canonical resolve); этап 1 — вкладка «Абонементы и продукты» (каталог шаблонов; gate — [`ACCEPTANCE_STAGE1.md`](ACCEPTANCE_STAGE1.md) §«Абонементы»)

Этап 3 — **семь исполнимых блоков**: **3.0 → 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6**.

## Definition of Done этапа 3

- [x] Выполнены блоки 3.0-3.6 без расширения scope за пределы ниже.
- [x] Все пункты [`ACCEPTANCE_STAGE3.md`](ACCEPTANCE_STAGE3.md) закрыты (`[x]`) или явно помечены как `defer` с записью в [`LOG.md`](LOG.md).
- [x] Обновлены документы: `memberships.md`, `api.md`, `ROADMAP.md`, `README.md`, `LOG.md`.
- [x] Прошли targeted tests этапа 3 (см. блок 3.6).

## Scope boundaries (обязательно)

### Разрешено менять

- `apps/webapp/src/modules/memberships/**`
- `apps/webapp/src/infra/repos/pgMemberships.ts`
- `apps/webapp/src/app/api/{doctor,admin}/booking-engine/patient-packages/**`
- `apps/webapp/src/app/api/doctor/booking-engine/appointments/[id]/package/**`
- `apps/webapp/src/app/app/doctor/clients/**` (только memberships-блок)
- `apps/webapp/src/app/app/settings/BookingPatientPackagesSection.tsx`
- `apps/webapp/src/modules/system-settings/types.ts`
- Документы из раздела `Документы` внизу файла

### Вне scope

- Календарный drag/drop/resize и любые задачи этапа 4.
- Переключатели read-source (`booking_slots_read_source`, `booking_doctor_appointments_read_source`) и ops-cutover этапа 2.3b.
- Новые таблицы/миграции для абонементов (используем текущую схему `be_patient_packages`/`be_package_usages`).
- Изменение жизненного цикла записи вне package-сценариев (appointment FSM как отдельная инициатива).

---

## UI-канон для этапа 3

Зона: карточка клиента (`DoctorClientMembershipsPanel`) и admin «Операции» / «Абонементы и продукты». Следовать [`.cursor/rules/doctor-ui-shared-primitives.mdc`](../../.cursor/rules/doctor-ui-shared-primitives.mdc) там, где секции в doctor admin; в **карточке клиента** — `doctorClientCardChrome` (`doctorClientStackedCardClass`, `doctorClientSectionTitleClass`), не `DoctorSection` с page-level `rounded-xl`, если это ломает плотность entity-card (см. `DOCTOR_APP_UI_STYLE_GUIDE` §9).

| Зона | Паттерн | Запрещено |
|------|---------|-----------|
| Список абонементов | stacked cards / compact list | Сырой UUID записи в primary UI |
| Сеансы по абонементу | таблица или stacked rows; фильтр «Показать прошедшие» | Поле «ID записи» для отвязки |
| Диалоги отвязки / поздняя отвязка | shadcn `Dialog` §14; `Button default sm` | Молчаливое списание без выбора (ROADMAP §9.7) |
| Ошибки mapping | `Badge` / текст «нет связи услуги» | Silent debit при unmapped (регрессия 2.2) |

### Самопроверка UI (3.5)

```bash
rg "placeholder=.*uuid|ID записи" apps/webapp/src/app/app/doctor/clients/DoctorClientMembershipsPanel.tsx
rg "DoctorSection|doctorClientStackedCardClass" apps/webapp/src/app/app/doctor/clients/DoctorClientMembershipsPanel.tsx
pnpm --dir apps/webapp exec vitest run \
  src/app/app/doctor/clients/DoctorClientMembershipsPanel.test.tsx \
  src/app/api/doctor/booking-engine/patient-packages/route.test.ts \
  src/modules/memberships/service.test.ts \
  --project fast
```

---

## Текущее состояние (baseline до этапа 3 — историческая справка)

| Область | Было до 3.0–3.6 | Закрыто этапом 3 (2026-06-04) |
|---------|------------------|-------------------------------|
| DDL | `be_patient_packages.notes`, history events | UI «Комментарий», PATCH |
| Create API | manual + catalog; `notes` только на manual | catalog `notes`; manual без обязательного `title` |
| Reserve/consume/cancel | FEFO, hooks (этап 2) | Список сеансов + linkage/mapping в UI |
| Mapping | fail-closed на create (2.2) | Бейдж «нет связи услуги» в sessions |
| Staff detach | unlink/refund | `detach`, sessions actions, late/past guards, settings |
| Policies | `freeCancelHoursBefore` | Поздняя ручная отвязка через detach + политику |
| UI | UUID + поле «Название» | `PatientPackageCard`, sessions, history, без UUID |

Канон модуля: [`apps/webapp/src/modules/memberships/memberships.md`](../../apps/webapp/src/modules/memberships/memberships.md).

---

## Обзор блоков

| Блок | Цель | Breaking API |
|------|------|--------------|
| **3.0** | Комментарий + PATCH пакета | Нет (расширение) |
| **3.1** | Индивидуальный абонемент без обязательного названия в UI | Нет (server default title) |
| **3.2** | Списание по canonical service + видимость mapping | Нет |
| **3.3** | Read-model «сеансы по абонементу» | Нет (новый GET) |
| **3.4** | Detach: late choice, guards, settings | Расширение body существующих POST |
| **3.5** | Карточка клиента (основной UX) | Нет |
| **3.6** | Admin parity, docs, acceptance | Нет |

**Gate:** 3.5 не закрывается без 3.3 + 3.4. 3.4 late-choice использует политику отмены (3.4.2) и флаг §9.6 (3.4.1).

---

## 3.0 — Комментарий абонемента (API + отображение)

### Цель

Опциональный **комментарий врача** на экземпляре абонемента клиента (ROADMAP §9.1): при индивидуальном создании и при назначении из шаблона; виден в карточке клиента и в детали пакета.

### Решение по данным

Использовать существующее поле **`be_patient_packages.notes`** (не новая колонка). В UI везде подпись **«Комментарий»**.

### Scope

- `apps/webapp/src/app/api/doctor/booking-engine/patient-packages/route.ts` — добавить поле `notes` в `offerSchema`
- `apps/webapp/src/app/api/admin/booking-engine/patient-packages/route.ts` — mirror
- `PATCH` (новый) `.../patient-packages/[id]` — `{ notes: string | null }`, max 2000
- `modules/memberships/ports.ts` — добавить `updatePatientPackageNotes(...)`
- `infra/repos/pgMemberships.ts`
- `getPatientPackageDetail` / `listPatientPackagesForUser` — отдавать `notes` в JSON (если ещё не в типе ответа)

### Вне scope

- Комментарий к отдельной **записи** (staff notes appointment) — не путать с notes пакета
- Patient-facing purchase comment — только если появится отдельный продуктовый запрос; staff comment на catalog offer — **в scope** §9.1

### DoD 3.0

- [x] Manual POST принимает `notes`; catalog offer POST принимает `notes`
- [x] PATCH notes работает (doctor + admin mirror)
- [x] Route tests: create with notes, patch, GET detail содержит notes
- [x] Нет новых env; нет raw SQL в modules

---

## 3.1 — Индивидуальный абонемент без названия

### Цель

Врач **не вводит название** для индивидуального абонемента (ROADMAP §9.1). В БД `title` остаётся NOT NULL — **генерация на сервере**.

### Норматив: auto-title

Если `title` пустой / не передан:

```text
Индивидуальный · {N} {позиций|позиция} · {DD.MM.YYYY}
```

`N` = число позиций; дата = `soldAt` или `now` в TZ организации (тот же helper, что для doctor appointments formatting).

Если передан непустой `title` — сохранить (compat admin scripts).

### Scope

- Zod `manualSchema`: `title` → `z.string().trim().max(200).optional()` (не `min(1)`)
- `createManualPatientPackage` в service: подставить auto-title до port
- `DoctorClientMembershipsPanel.tsx` — убрать поле «Название»
- `BookingPatientPackagesSection.tsx` — тот же UX для admin/ops: без поля названия

### DoD 3.1

- [x] UI индивидуального абонемента без поля названия (client + admin section)
- [x] POST manual без `title` → 200, в ответе осмысленный `title`
- [x] Unit test auto-title
- [x] Существующие клиенты с title не ломаются

---

## 3.2 — Позиции и списание по реальной услуге

### Цель

Подтвердить и **показать в UI** правило ROADMAP §9.2: списание/резерв только по **canonical `serviceId`**; Rubitime-запись — через mapping; unmapped → fail-closed (этап 2), без silent wrong debit.

### Уже сделано (этап 2 — регрессия, не переписывать)

- `reserveForAppointment({ serviceId })`, FEFO `listActivePackagesForBooking(platformUserId, org, serviceId)`
- Create/cancel/visit hooks в `memberships` + `canonicalCreate`
- `GET .../memberships/available` + products → `branch_service_mapping_missing`

### Scope 3.2 (дельта)

- `listSessionsForPatientPackage` (3.3) — поле `serviceResolution: 'canonical' | 'mapping_missing' | 'legacy_only'` на строке; если appointment имеет `serviceId`, но списание невозможно, показывать `mapping_missing`
- При manual consume из UI: если `appointment.serviceId` не совпадает ни с одной позицией пакета, возвращать `package_no_balance` с человекочитаемым текстом в UI
- Документировать в `memberships.md` §Booking integration один абзац «canonical-only debit path»

### DoD 3.2

- [x] Нет кода, снимающего fail-closed при unmapped
- [x] Session row (3.3) показывает статус mapping, если применимо
- [x] `membership-routes.test.ts` / `service.test.ts` — регрессия unmapped не debit
- [x] INVENTORY §4.1 ссылка на этап 3 закрыт в LOG

---

## 3.3 — Read-model: сеансы по абонементу

### Цель

Заменить ввод UUID (ROADMAP §9.4): список записей, привязанных к абонементу, с остатками, статусом связи и действиями.

### Scope

- `modules/memberships/ports.ts` — `listPackageAppointmentSessionSources(...)`; service — `listPatientPackageSessions`
- `infra/repos/pgMemberships.ts` — join `be_package_usages` + `be_appointments` + canonical titles (`be_branches`, `be_clinic_services`) без второго read-pass
- `memberships/service.ts` — `listPatientPackageSessions(...)`
- `GET /api/doctor/booking-engine/patient-packages/[id]/sessions?includePast=false`
- Admin mirror: `/api/admin/booking-engine/patient-packages/[id]/sessions`

### Формат строки (нормативно)

```ts
type PatientPackageSessionRow = {
  appointmentId: string;
  startsAt: string;       // ISO
  endsAt: string | null;
  status: string;         // appointment FSM status
  branchTitle: string | null;
  serviceTitle: string;
  serviceId: string | null;
  linkage: "reserved" | "consumed" | "penalty" | "released" | "refunded" | "none";
  mappingStatus: "ok" | "mapping_missing" | "not_applicable";
  isPast: boolean;        // startsAt < now (org TZ)
  actions: {
    canUnlinkReserve: boolean;
    canRefundConsumed: boolean;
    canManualConsume: boolean;
    canOpenInCalendar: boolean;
  };
};
```

**Правила `actions` (server-side, UI не вычисляет):**

| linkage | canUnlinkReserve | canRefundConsumed |
|---------|------------------|-------------------|
| reserved (net reserve) | true | false |
| consumed / penalty | false | true |
| none | false | false (или manual consume если appointment без связи) |

`includePast=false` → только `startsAt >= now`.  
`includePast=true` → будущие + прошедшие записи из того же набора.

### Шаги

| # | Шаг | Проверка |
|---|-----|----------|
| 3.3.1 | Port + repo query | unit test repo or service with fixtures |
| 3.3.2 | GET sessions route | route test doctor + admin |
| 3.3.3 | Оставить `getPatientPackageDetail` без `sessions`; использовать отдельный GET `/sessions` | route test подтверждает раздельные контракты |

### DoD 3.3

- [x] GET sessions возвращает rows по контракту выше
- [x] `includePast` переключает прошедшие
- [x] Route tests green
- [x] Performance: один SQL-путь в repo (`listPackageAppointmentSessionSources`); формальный SLA <500ms не замерялся

---

## 3.4 — Detach API, политики, настройки

### Цель

ROADMAP §9.3–§9.7: автоматический возврат резерва при отмене (уже есть), поздняя отмена → penalty (policies), **ручная отвязка** с выбором исхода, защита прошедших, флаг врача.

### 3.4.1 — system_settings (§9.6)

| Ключ | scope | Тип | Default |
|------|-------|-----|---------|
| `booking_allow_doctor_unlink_past_package_sessions` | `admin` | boolean | `false` |

- Добавить в `ALLOWED_KEYS` (`system-settings/types.ts`)
- Admin Settings UI (блок записи / политики) — одна строка с подписью ROADMAP §9.6
- `syncSettingToIntegrator` — по правилу mirror

**Правило UI:** если `false` — строки с `isPast=true` в sessions list **без** кнопок отвязки/возврата (read-only).

### 3.4.2 — Поздняя ручная отвязка (§9.7)

Использовать **существующую** политику отмены организации (`booking-policies`, `freeCancelHoursBefore`), не дублировать часы в новом ключе.

Алгоритм `evaluateManualDetach(appointment, policy)`:

1. Вычислить `hoursUntilStart` от `now` до `appointment.startAt`.
2. Если `hoursUntilStart >= policy.freeCancelHoursBefore` → простой detach (release или refund по linkage).
3. Если **поздно** и `outcome` не передан → API возвращает `409` + `code: "late_detach_choice_required"`.
4. Если **поздно** и `outcome` передан → выполнить выбранное действие.

**POST body** (расширение, backward compatible):

`POST /api/doctor/booking-engine/appointments/[id]/package/detach`

```json
{
  "outcome": "release_reserve" | "charge_as_delivered" | "refund_consumed",
  "confirmPast": false,
  "confirmPastTwice": false
}
```

Маппинг:

| outcome | Действие service |
|---------|------------------|
| `release_reserve` | `unlinkAppointmentFromPackage` |
| `charge_as_delivered` | при `linkage=reserved` → `consumeForAppointment`; при `linkage=none` и явно выбранной позиции пакета → `manualConsume` |
| `refund_consumed` | `refundConsumedAppointmentPackage` |

Сохранить старые routes `unlink` / `refund` как thin wrappers → `detach` (deprecated в api.md, не удалять в 3.4).

**Двойное подтверждение (§9.5):** для `isPast` + `booking_allow_doctor_unlink_past_package_sessions=true` требовать `confirmPastTwice=true` в body, иначе `400 past_detach_confirmation_required`.

### 3.4.3 — Cancel automation (§9.3)

Регрессия только:

- patient cancel → `applyCancelPackageOutcome` с `packageLessonDeducted` из `policyResolver`
- staff manual-cancel → то же

Добавить **history event** / usage `comment` при auto release/penalty, если ещё не пишется — для блока «история ручных решений» (§9.8).

### Scope

- `modules/memberships/service.ts` — `detachAppointmentPackage({ outcome, guards... })`
- `modules/booking-policies` — read policy for appointment context в route
- Doctor route: `POST /api/doctor/booking-engine/appointments/[id]/package/detach`
- Legacy wrappers: существующие `.../package/unlink` и `.../package/refund` вызывают detach-service
- Tests: late window → choice required; past disabled when setting false; double confirm

### DoD 3.4

- [x] Флаг §9.6 в DB + UI + читается в detach guard
- [x] Поздняя отвязка без `outcome` не выполняется молча
- [x] Прошедшие: двойной confirm при разрешённом флаге (UI: late-choice → `beginDetach`, не обход диалогов)
- [x] `service.test.ts` + route tests для detach matrix
- [x] Cancel/late cancel package outcome — регрессия зелёная

---

## 3.5 — Карточка клиента (основной UX)

### Цель

ROADMAP §9.4, §9.8: блок абонемента в `DoctorClientRecordsTab` — состав, остатки, комментарий, сеансы, история, действия без UUID.

### Scope

- `DoctorClientMembershipsPanel.tsx` — рефактор
- Новый presentational: `PatientPackageCard.tsx` + `PatientPackageSessionsList.tsx` в `apps/webapp/src/app/app/doctor/clients/`
- `DoctorClientRecordsTab.tsx` — без изменений структуры секций, только дочерний panel
- Dialog тексты §9.5 дословно (ROADMAP)
- Checkbox «Показать прошедшие» → `includePast=true` на GET sessions
- CTA: «Открыть в календаре» → deeplink на `/app/doctor/calendar` с `appointmentId`
- Покупка шаблона: поле комментария (3.0)
- Индивидуальный: без title (3.1), состав позиций из `GET .../services` (canonical list)

### Структура UI (сверху вниз)

1. Список активных пакетов (title, status, soldAt, остатки по услугам, comment preview).
2. Раскрытие пакета → sessions list (3.3) + history collapsible (`getPatientPackageDetail` history).
3. Формы в `Dialog` / `details`: «Назначить из каталога», «Индивидуальный» — не раздувать copy (ui-copy-no-excess-labels).

### Шаги

| # | Шаг | Проверка |
|---|-----|----------|
| 3.5.1 | 3.0–3.4 закрыты | DoD ниже |
| 3.5.2 | Sessions list UI | RTL test: render sessions, toggle past |
| 3.5.3 | Detach dialogs | test: double confirm; late choice |
| 3.5.4 | Убрать UUID inputs | `rg "ID записи"` пусто |
| 3.5.5 | ACCEPTANCE §3.5 | владелец |

### DoD 3.5

- [x] Нет ввода appointment id
- [x] Будущие сеансы по умолчанию; прошедшие по галочке
- [x] Все действия §9.4 доступны с понятными подписями
- [x] Комментарий редактируется и виден
- [x] `DoctorClientMembershipsPanel.test.tsx` обновлён

---

## 3.6 — Admin parity, документация, закрытие этапа

### Цель

Вкладка «Абонементы и продукты» / «Операции» не отстаёт от карточки клиента; docs синхронизированы.

### Scope

- `BookingPatientPackagesSection.tsx` — 3.1 + 3.0 (notes, no title)
- `BookingOperationsPageClient` / memberships tab — parity по полям и валидациям с doctor-card, без добавления нового copy
- [`memberships.md`](../../apps/webapp/src/modules/memberships/memberships.md) — sessions API, detach, settings key
- [`api.md`](../../apps/webapp/src/app/api/api.md) — новые endpoints
- [`LOG.md`](LOG.md) — запись закрытия 3.0–3.6
- [`ROADMAP.md`](ROADMAP.md) — статус этапа 3 → `done` после ACCEPTANCE
- [`ACCEPTANCE_STAGE3.md`](ACCEPTANCE_STAGE3.md) — владелец

### Targeted tests (финал этапа)

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/memberships/service.test.ts \
  src/modules/memberships/packageManualTitle.test.ts \
  src/modules/memberships/packageSessionLinkage.test.ts \
  src/app/api/booking/membership-routes.test.ts \
  src/app/api/doctor/booking-engine/patient-packages/route.test.ts \
  src/app/api/doctor/booking-engine/patient-packages/\[id\]/route.test.ts \
  src/app/api/doctor/booking-engine/patient-packages/\[id\]/sessions/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/\[id\]/package/detach/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/\[id\]/package/unlink/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/\[id\]/package/refund/route.test.ts \
  src/app/app/doctor/clients/DoctorClientMembershipsPanel.test.tsx \
  src/app/app/doctor/clients/PatientPackageSessionsList.test.tsx \
  --project fast
pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json
```

Полный `pnpm run ci` — барьер перед push, не после каждого подблока (см. plan-authoring rule).

### DoD 3.6 (этап 3 целиком)

- [x] ACCEPTANCE_STAGE3 все пункты `[x]` или defer с LOG
- [x] ROADMAP §9 проверки (605–617) покрыты acceptance (ручной smoke ops — по желанию)
- [x] README инициативы ссылается на STAGE3 + ACCEPTANCE3

---

## Риски

| Риск | Митигация |
|------|-----------|
| Дублировать `freeCancelHours` в system_settings | §9.7 → только `booking-policies` |
| Past unlink без guard | 3.4.1 + server-side `actions` |
| Список сеансов N+1 | один SQL / batched titles в repo |
| Regressия 2.2 fail-closed | 3.2 регрессионные тесты |
| UUID UX остаётся в admin | 3.6 parity |

---

## Документы

- [`ACCEPTANCE_STAGE3.md`](ACCEPTANCE_STAGE3.md)
- [`ROADMAP.md`](ROADMAP.md) §9
- [`INVENTORY_AND_IA.md`](INVENTORY_AND_IA.md) §4.1, §5
- [`STAGE2_DECOMPOSITION.md`](STAGE2_DECOMPOSITION.md) — mapping baseline
- [`apps/webapp/src/modules/memberships/memberships.md`](../../apps/webapp/src/modules/memberships/memberships.md)
- [`../OWN_BOOKING_ENGINE_INITIATIVE/DATA_MODEL_REFERENCE.md`](../OWN_BOOKING_ENGINE_INITIATIVE/DATA_MODEL_REFERENCE.md)
