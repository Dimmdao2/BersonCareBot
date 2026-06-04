# Приёмка — Этап 3 (абонементы: UX и корректное списание)

**Статус:** `done` (код + автотесты, 2026-06-04; smoke владельца §3.2 / §3.5 — по необходимости)  
**План:** [`STAGE3_DECOMPOSITION.md`](STAGE3_DECOMPOSITION.md) (`done`) · ROADMAP §9 (`done`) · [`LOG.md`](LOG.md)

**Зоны:** карточка клиента → вкладка «Записи» → блок «Абонементы»; admin `/app/doctor/admin/booking` (операции / абонементы); API `memberships`, `patient-packages`, `appointments/.../package/*`.

## Definition of Done

- [x] Закрыты разделы 3.0-3.6 ниже.
- [x] Для каждого раздела есть отметка разработки (владелец ops/smoke — при необходимости).
- [x] Обновлены `ROADMAP.md`, `README.md`, `LOG.md`, `memberships.md`, `api.md`.
- [x] Targeted auto-checks из раздела 3.6 прошли.

---

## 3.0 — Комментарий

- [x] При создании индивидуального абонемента можно указать комментарий (поле `notes`)
- [x] При назначении из каталога можно указать комментарий
- [x] Комментарий виден в списке/детали пакета в карточке клиента
- [x] Комментарий можно изменить (PATCH) без пересоздания пакета

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | route + UI + `PATCH` |
| Владелец | | smoke по желанию |

---

## 3.1 — Индивидуальный абонемент без названия

- [x] В UI нет обязательного поля «Название» для индивидуального абонемента
- [x] Сохранение без title создаёт пакет с автогенерированным заголовком
- [x] В списке пакета отображаются состав, цена, срок (если задан), статус оплаты/активации

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | auto-title + soldAt/validUntil/paid в карточке |
| Владелец | | |

---

## 3.2 — Списание по реальной услуге

- [x] Запись из BersonCare с `{ branchId, serviceId }` резервирует позицию пакета по canonical service (наследие этапа 2)
- [x] Запись из Rubitime при заполненном mapping резервирует/списывает ту же canonical услугу (наследие этапа 2)
- [x] При отсутствии mapping автоматическое списание не происходит; врач видит проблему (ошибка или статус строки сеанса)
- [x] Регрессия: `branch_service_mapping_missing` на available/create не снята

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | бейдж «нет связи услуги» в sessions list |
| Владелец / ops | | E2E Rubitime — вручную при cutover |

---

## 3.3 — Список сеансов

- [x] По абонементу виден список связанных записей (дата, время, услуга, локация, статус записи)
- [x] Видно, что зарезервировано / списано / возвращено
- [x] По умолчанию только будущие; галочка «Показать прошедшие» добавляет прошедшие
- [x] Нет поля ввода UUID записи для отвязки
- [x] `GET .../patient-packages/[id]/sessions?includePast=false` не возвращает прошедшие
- [x] `GET .../patient-packages/[id]/sessions?includePast=true` возвращает прошедшие

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | GET + UI + route tests |
| Владелец | | |

---

## 3.4 — Отвязка, отмена, политики

### Автоматика (§9.3)

- [x] Отмена будущей записи с резервом возвращает занятие в абонемент (наследие; регрессия `service.test`)
- [x] Поздняя отмена при включённой политике списывает сеанс (penalty / package_charged) (наследие)

### Ручные действия (§9.4, §9.7)

- [x] Отвязать будущий резерв из списка сеансов
- [x] Вернуть списанный сеанс (refund) из списка
- [x] Списать как оказанную (кнопка при `canManualConsume` + late dialog)
- [x] Поздняя ручная отвязка: диалог с выбором «Списать как оказанную» / «Вернуть в абонемент» — не молча
- [x] `POST /api/doctor/booking-engine/appointments/[id]/package/detach` при поздней отвязке без `outcome` возвращает `409` + `late_detach_choice_required`
- [x] Legacy routes `.../package/unlink` и `.../package/refund` продолжают работать как wrappers

### Прошедшие (§9.5–§9.6)

- [x] При выключенном флаге «Разрешить отвязывать прошедшие…» прошедшие нельзя отвязать
- [x] При включённом флаге — двойное подтверждение с текстами из ROADMAP §9.5
- [x] Флаг `booking_allow_doctor_unlink_past_package_sessions` хранится в `system_settings`, не в env

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | detach + settings UI + route/service tests |
| Владелец | | smoke past/late |

---

## 3.5 — Блок в карточке клиента (§9.8)

- [x] Состав и остатки по услугам
- [x] Будущие привязанные записи; прошедшие списания/отмены при «Показать прошедшие»
- [x] Комментарий абонемента
- [x] История ручных решений / usage отображается в collapsible-блоке пакета
- [x] Действие «Открыть запись» ведёт в календарь врача

| Роль | Дата | Результат |
|------|------|-----------|
| Владелец постановки | | UI smoke |
| Разработка | 2026-06-04 | `PatientPackageCard` + sessions + history |

---

## 3.6 — Admin и регрессия

- [x] `BookingPatientPackagesSection` / ops: индивидуальный без названия, комментарий (parity с 3.0–3.1)
- [x] Документация: `memberships.md`, `api.md` обновлены

### Авто (разработка)

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/memberships/service.test.ts \
  src/app/api/booking/membership-routes.test.ts \
  src/app/api/doctor/booking-engine/patient-packages/route.test.ts \
  src/app/api/doctor/booking-engine/patient-packages/[id]/route.test.ts \
  src/app/api/doctor/booking-engine/patient-packages/[id]/sessions/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/[id]/package/detach/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/[id]/package/unlink/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/[id]/package/refund/route.test.ts \
  src/app/app/doctor/clients/DoctorClientMembershipsPanel.test.tsx \
  src/app/app/doctor/clients/PatientPackageSessionsList.test.tsx \
  --project fast
```

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | 41 passed (fast) |

---

## Закрытие этапа 3

ROADMAP §9 → `done`: код, targeted tests, документация. Ops/smoke Rubitime и визуальная приёмка владельца — вне блокера merge.

**Не блокирует этап 3:** этап 4 (интерактивный календарь), 2.3b ops cutover.
