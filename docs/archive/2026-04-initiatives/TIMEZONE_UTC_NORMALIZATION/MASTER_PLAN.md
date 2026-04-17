# Единая модель времени: UTC-нормализация и IANA-зоны филиалов

## Проблема

Rubitime и другие внешние источники присылают «наивные» даты (`"2026-04-07 11:00:00"` — настенное время филиала, без указания зоны). Строка проходит весь путь от webhook до PostgreSQL **без нормализации**. PG кастит её по session TZ (обычно UTC), записывая **неверный** абсолютный момент. Дальше все downstream-слои (webapp, бот, журнал, напоминания) форматируют «правильно», но **от неправильного instant**.

Дополнительно: display-timezone для бизнес-отображения согласована между webapp и integrator через `system_settings.app_display_timezone` (scope `admin`); legacy env-имена в integrator остаются только для узких скриптов и логируют предупреждение.

## Принцип

```
ВНЕШНИЙ ИСТОЧНИК           ГРАНИЦА СИСТЕМЫ                 ВНУТРИ СИСТЕМЫ
───────────────            ───────────────                 ──────────────
naive datetime  ──→  normalizeToUtcInstant(raw, tz)  ──→  UTC instant ("...Z")
                      ↑                                         │
               branch.timezone                                  │
               (IANA из БД)                                     ▼
                                                     timestamptz (PG) / ISO-Z (JSON)
                                                              │
                                                     formatForDisplay(instant, displayTz)
                                                              │
                                                              ▼
                                                     "7 апр. 2026 г., 11:00"
```

**Три инварианта:**
1. Внутри системы (БД, события, JSON между сервисами) — **только** ISO-8601 с `Z` или явным offset.
2. Интерпретация входящих наивных дат — **всегда** через IANA-зону источника (филиала).
3. Форматирование для UI — **всегда** через единую display-timezone из `system_settings`.

**Инвариант качества данных (выбранный режим обработки):**
4. Если у входного события есть бизнес-обязательное время, а нормализация не удалась:
   - запись не теряется (вариант A): сохраняем факт события, но время в доменной записи = `null`;
   - обязательно создаём инцидент качества данных в отдельном хранилище;
   - обязательно отправляем критичное уведомление администратору в Telegram;
   - правило должно быть общим для всех интеграций, а не только для Rubitime.

---

## Текущее состояние

Актуальный снимок **после** Stages 1–8 в репозитории (см. DoD ниже и `AGENT_EXECUTION_LOG.md`). Историческое описание проблемы — в §«Проблема».

### Реализовано в коде и CI

- **Нормализация:** `normalizeToUtcInstant` / `tryNormalizeToUtcInstant`; ingest Rubitime (webhook) приводит `recordAt` / `dateTimeEnd` к ISO-Z по `branches.timezone`; Variant A + инциденты качества данных при деградации времени.
- **Защита БД:** `rubitime_records` — параметр `record_at` с явным `::timestamptz`; `booking.upsert` принимает в SQL только явный zoned ISO (`explicitZonedIsoInstant`) для времени записи.
- **Display timezone (integrator):** `getAppDisplayTimezone({ db, dispatchPort? })` из `system_settings` (admin); в zod `env.ts` нет timezone-переменных. Deprecated `getAppDisplayTimezoneSync()` читает только `process.env` для скриптов без БД и логирует предупреждение.
- **Слоты / M2M:** `scheduleNormalizer` — настенное время филиала через IANA (`branchTimezone`); webapp — timezone из каталога филиалов (см. Stage 5).
- **Downstream:** resync / Google Calendar / `formatBusinessDateTime` — канонический normalizer или Luxon+IANA; `parseBusinessInstant` — safety-net с предупреждением (Stage 7).
- **Контракт:** `timezoneContract.stage8.*` (integrator + webapp).

### Операционные остатки

- **Исторические строки в БД:** бэкфилл на **целевой** среде по `docs/TIMEZONE_UTC_NORMALIZATION/stage6/APPLY_PLAN.md` (до выполнения — отдельный gate).

### Таблицы, хранящие время записей

| Таблица (БД) | Колонка | Тип | Кто пишет | Примечание |
|---|---|---|---|---|
| `rubitime_records` (integrator) | `record_at` | `timestamptz` | `writePort` → `upsertRecord` | Ожидается UTC instant после нормализации на входе |
| `appointment_records` (webapp) | `record_at` | `timestamptz` | проекция webapp | Payload из integrator — ISO-Z |
| `patient_bookings` (webapp) | `slot_start`, `slot_end` | `timestamptz` | `pgPatientBookings` и др. | Native из слотов; compat-ветка для projection задокументирована в коде |

---

## Этапы реализации

### Stage 1. IANA-зона филиала в БД

**Цель:** каждый филиал хранит свою IANA-зону; дефолт `Europe/Moscow`.

**Задачи:**

- **S1.T01** — Миграция `056_branches_timezone.sql`: `ALTER TABLE branches ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Moscow'`.
- **S1.T02** — Миграция для booking_branches: `ALTER TABLE booking_branches ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Moscow'`.
- **S1.T03** — Seed: для существующего филиала 17356 (Москва) — `Europe/Moscow`. Для будущих: маппинг Rubitime `Местное время` offset → IANA (таблица ниже).
- **S1.T04** — Админка webapp: поле timezone в настройках филиала (строка IANA, плейсхолдер `Europe/Moscow`).
- **S1.T05** — Integrator: функция `getBranchTimezone(branchId)` с in-memory TTL-кэшем (60 сек), fallback `Europe/Moscow`.
- **S1.T06** — При fallback (branch не найден / timezone пустая / IANA невалидна): писать инцидент конфигурации и отправлять админ-алерт в Telegram (с дедупом по `integration + branchId + reason`), чтобы ошибка не маскировалась.

**Маппинг Rubitime offset → IANA:**

| Rubitime «Местное время» | UTC offset | IANA |
|:---:|:---:|---|
| -1 | +2 | `Europe/Kaliningrad` |
| 0 | +3 | `Europe/Moscow` |
| +1 | +4 | `Europe/Samara` |
| +2 | +5 | `Asia/Yekaterinburg` |
| +3 | +6 | `Asia/Omsk` |
| +4 | +7 | `Asia/Krasnoyarsk` |
| +5 | +8 | `Asia/Irkutsk` |
| +6 | +9 | `Asia/Yakutsk` |
| +7 | +10 | `Asia/Vladivostok` |
| +8 | +11 | `Asia/Magadan` |
| +9 | +12 | `Asia/Kamchatka` |

**Gate:** `branches.timezone` заполнена для всех филиалов; `getBranchTimezone` возвращает `Europe/Moscow` по умолчанию; fallback-кейсы наблюдаемы через инцидент-хранилище и Telegram-алерты.

---

### Stage 2. Единая функция нормализации `normalizeToUtcInstant`

**Цель:** одна точка конвертации «наивная строка + IANA → UTC instant» для всего проекта.

**Задачи:**

- **S2.T01** — Создать `apps/integrator/src/shared/normalizeToUtcInstant.ts`:

```typescript
/**
 * Нормализует строку времени в UTC instant (ISO-8601 с Z).
 *
 * - Строка с Z или ±offset → new Date(str).toISOString()
 * - Наивная строка (YYYY-MM-DD HH:mm:ss или T-вариант) → приклеить offset
 *   из IANA-зоны для этого момента → .toISOString()
 * - Невалидная строка → null
 */
export function normalizeToUtcInstant(
  raw: string,
  sourceTimezone: string,
): string | null;

/** Причины неуспеха: invalid_datetime | invalid_timezone | unsupported_format */
export function tryNormalizeToUtcInstant(
  raw: unknown,
  sourceTimezone: unknown,
): { ok: true; utcIso: string } | {
  ok: false;
  reason: "invalid_datetime" | "invalid_timezone" | "unsupported_format";
};
```

- **S2.T02** — Тесты `normalizeToUtcInstant.test.ts`:
  - Наивная `"2026-04-07 11:00:00"` + `Europe/Moscow` → `"2026-04-07T08:00:00.000Z"`
  - Наивная `"2026-04-07 11:00:00"` + `Europe/Samara` → `"2026-04-07T07:00:00.000Z"`
  - ISO с Z → identity
  - ISO с offset → корректный UTC
  - Пустая строка / мусор → null
  - Через T: `"2026-04-07T11:00:00"` + MSK → тот же результат

- **S2.T03** — Экспортировать из `shared/` для использования в webapp (shared package или копия с одинаковой сигнатурой).
- **S2.T04** — Companion API `tryNormalizeToUtcInstant` с дискретной причиной неуспеха (`invalid_datetime`, `invalid_timezone`, `unsupported_format`) для алертов и инцидентов; `normalizeToUtcInstant` остаётся обёрткой `string | null`.

**Gate:** тесты зелёные; функция покрывает все известные форматы Rubitime; причина ошибок нормализации доступна вызывающему коду через `tryNormalizeToUtcInstant`.

---

### Stage 3. Нормализация на входе (integrator connector)

**Цель:** `recordAt` и `dateTimeEnd` из Rubitime-вебхука нормализуются в UTC instant **до** записи в БД и отправки в проекцию.

**Задачи:**

- **S3.T01** — `connector.ts:109`: нормализовать `recordAt`:
  ```
  const recordAtRaw = asString(source.record) ?? asString(source.datetime);
  const branchTz = await getBranchTimezone(integratorBranchId);
  const recordAt = recordAtRaw ? normalizeToUtcInstant(recordAtRaw, branchTz) ?? undefined : undefined;
  ```
- **S3.T02** — `connector.ts:121`: нормализовать `dateTimeEnd` аналогично.
- **S3.T03** — `bookingRecords.ts:57`: добавить `$3::timestamptz` в VALUES для защиты от будущих наивных строк.
- **S3.T04** — Тесты connector: вебхук с наивной датой → проверить, что `recordAt` в IncomingEvent уже ISO-Z.
- **S3.T05** — Тесты writePort: `booking.upsert` с ISO-Z строкой → `upsertRecord` вызван с корректным instant.
- **S3.T06** — Внедрить политику варианта A для `recordAt`: если raw-время есть, но нормализация не удалась, сохранять запись с `recordAt = null`, фиксировать инцидент качества данных в отдельном хранилище и отправлять критичный Telegram-алерт админу.
- **S3.T07** — В payload/проекцию добавлять признак качества данных (например `timeNormalizationStatus`) для наблюдаемости и последующего ручного/автоматического исправления.
- **S3.T08** — Явно разделить бизнес-семантику `recordAt` (обязательное время записи) и `dateTimeEnd` (вспомогательное поле): для `dateTimeEnd` отсутствие допустимо, но при невалидном raw-значении инцидент + алерт также обязательны.

**Gate:** webhook с `"2026-04-07 11:00:00"` от филиала MSK → в `rubitime_records.record_at` лежит `2026-04-07 08:00:00+00`. В проекции `appointment.record.upserted` → `recordAt = "2026-04-07T08:00:00.000Z"`. **Variant A обязателен** (см. инвариант качества данных выше): при невалидной дате/зоне при наличии raw-времени событие не теряется, `recordAt`/`dateTimeEnd` в домене могут стать `null`, инцидент и Telegram-алерт создаются обязательно; поле `errorReason` инцидента берётся из `tryNormalizeToUtcInstant` при необходимости.

---

### Stage 4. Integrator display-timezone из БД

**Цель:** integrator читает `app_display_timezone` из `system_settings` вместо env.

**Задачи:**

- **S4.T01** — `appTimezone.ts`: `getAppDisplayTimezoneSync` → заменить на async `getAppDisplayTimezone` с SQL-запросом к `system_settings` + in-memory TTL-кэш (60 сек).
- **S4.T02** — Обновить callsites: `recordM2mRoute.ts`, `bookingNotificationFormat.ts`, `scheduleBookingReminders`, `formatIsoInstantAsRubitimeRecordLocal`.
- **S4.T03** — `env.ts`: убрать `APP_DISPLAY_TIMEZONE`, `BOOKING_DISPLAY_TIMEZONE` из zod-схемы (**сделано**). Оффсет Rubitime для форматирования/скриптов — через `resolveRubitimeRecordAtUtcOffsetMinutes` / `getRubitimeRecordAtUtcOffsetMinutesForInstant` (IANA из БД), без env-оверрайда (`RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES` снят в Stage 7).
- **S4.T04** — Тесты: мок `system_settings` с `Europe/Samara` → уведомление форматирует время в +4.
- **S4.T05** — При fallback display-timezone (ключ не найден/невалиден) создавать инцидент конфигурации + Telegram-алерт админу (dedupe).

**Gate:** integrator и webapp читают display-timezone из одного места (БД). Env-переменные удалены. Fallback display-timezone не "тихий": инцидент и Telegram-алерт обязательны.

---

### Stage 5. Убрать хардкоды `+03:00`

**Цель:** слоты и M2M-маршруты используют timezone филиала вместо хардкода.

**Задачи:**

- **S5.T01** — `scheduleNormalizer.ts`: `RUBITIME_SLOT_WALL_OFFSET` → параметр `branchTimezone` в `normalizeRubitimeSchedule`.
- **S5.T02** — `recordM2mRoute.ts` (slots endpoint): передать timezone филиала из каталога.
- **S5.T03** — `bookingM2mApi.ts` (webapp): `DEFAULT_SLOT_TZ` → timezone из `booking_branches` (или display-timezone как fallback).
- **S5.T04** — Тесты: слоты для филиала `Europe/Samara` → ISO с правильным UTC offset.

**Gate:** нет хардкодов `+03:00` / `+03` в продуктовом коде (кроме тестовых фикстур).

---

### Stage 6. Бэкфилл исторических данных

**Цель:** исправить `record_at` / `slot_start` для записей, созданных с неверным instant.

**Задачи:**

- **S6.T01** — Диагностический SQL: найти записи, где `record_at` записано со сдвигом (сравнить `payload_json->>'record'` или `rubitime_events` с хранимым `record_at`) и записи с `record_at IS NULL`, где raw-время в payload присутствует.
- **S6.T02** — Скрипт бэкфилла `rubitime_records`: вычислять корректный UTC instant из сохраненного raw payload + timezone филиала на момент события. Никаких слепых фиксированных сдвигов по всей выборке.
- **S6.T03** — Скрипт бэкфилла `appointment_records` (аналогично).
- **S6.T04** — Скрипт бэкфилла `patient_bookings` (только `source = 'rubitime_projection'`).
- **S6.T05** — Dry-run с `BEGIN; ... ROLLBACK;` и подсчётом затронутых строк.
- **S6.T06** — Применить на проде в maintenance window.
- **S6.T07** — Отдельная обработка `record_at IS NULL`: попытка восстановить instant из сырого payload + timezone филиала; если восстановить нельзя — пометить как unresolved в инцидент-хранилище.

**Gate:** resync-скрипт (`compare-rubitime-records`) показывает `diffMin=0` для всех активных записей.

---

### Stage 7. Зачистка downstream-костылей

**Цель:** убрать компенсаторные механизмы, которые больше не нужны после нормализации на входе.

**Задачи:**

- **S7.T01** — `parseBusinessInstant` в webapp: ветка «наивная строка → приклеить MSK offset» → добавить лог warn (данные не должны туда попадать после Stage 3). Не удалять сразу — пусть работает как safety net для legacy.
- **S7.T02** — `pgPatientBookings.ts`: `CASE WHEN source = 'rubitime_projection'` для `slot_start/slot_end` — оставить (защита от edge case), но задокументировать, что после Stage 3 новые строки не должны в неё попадать.
- **S7.T03** — Удалить `rubitimeMaybeDateToIso` из resync-скриптов, заменить на `normalizeToUtcInstant`.
- **S7.T04** — Удалить `parseRecordAtToIso` из `google-calendar/sync.ts`, заменить на `normalizeToUtcInstant`.
- **S7.T05** — Удалить `RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES` из env.
- **S7.T06** — Обновить `CONFIGURATION_ENV_VS_DATABASE.md`.

**Gate:** `pnpm run ci` зелёный. Grep по `+03:00` и `RUBITIME_RECORD_AT_UTC_OFFSET` в `apps/**/src` — ноль вхождений вне тестовых фикстур и комментариев. Имена legacy `APP_DISPLAY_TIMEZONE` / `BOOKING_DISPLAY_TIMEZONE` допускаются только внутри deprecated `getAppDisplayTimezoneSync` и связанных тестов или текста предупреждений в логе (скрипты без БД), согласно §«Текущее состояние» (строка про integrator display timezone) — не в zod `env.ts` и не в основном HTTP-пути integrator.

---

### Stage 8. Контрактные тесты

**Цель:** сквозной тест, гарантирующий единство instant через все слои.

**Задачи:**

- **S8.T01** — Фикстура: Rubitime webhook с `"2026-04-07 11:00:00"` от филиала `Europe/Moscow`.
- **S8.T02** — Ассерты:
  - `rubitime_records.record_at` = `2026-04-07 08:00:00+00`
  - Projection event `recordAt` = `"2026-04-07T08:00:00.000Z"`
  - `appointment_records.record_at` = `2026-04-07 08:00:00+00`
  - `patient_bookings.slot_start` = `2026-04-07 08:00:00+00`
  - Текст бота: `"7 апр. 2026 г., 11:00"` (при display_tz = `Europe/Moscow`)
  - Журнал кабинета пациента: `"7 апр. 2026 г., 11:00"`
  - Дашборд врача: `"11:00 07.04"`
- **S8.T03** — Аналогичный тест для филиала `Europe/Samara` (offset +1):
  - Webhook `"2026-04-07 11:00:00"` → `record_at = 2026-04-07 07:00:00+00`
  - Текст при display_tz Moscow: `"7 апр. 2026 г., 10:00"`
  - Текст при display_tz Samara: `"7 апр. 2026 г., 11:00"`
- **S8.T04** — Негативный контракт: невалидный `recordAt` (`"abc"`/невалидный календарь) при наличии raw-поля → запись сохраняется с `recordAt = null`, создаются инцидент качества данных и Telegram-алерт, Google Calendar не создаёт/не обновляет событие.
- **S8.T05** — Негативный контракт: невалидная IANA у филиала → fallback применяется, но обязательно создаются инцидент конфигурации и Telegram-алерт.

**Gate:** тесты зелёные.

---

## Порядок выполнения

```
Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 6 → Stage 7 → Stage 8
  │          │          │
  │          │          └─── Закрывает текущий баг с журналом (+1 час)
  │          └────────────── Единая функция нормализации
  └───────────────────────── Зона филиала в БД
```

Stages 1–3 — **минимум для закрытия текущего бага**. Stages 4–8 — эволюция к мультитенанту и зачистка.

## Файлы (ожидаемые изменения)

| Файл | Stage | Действие |
|---|---|---|
| `apps/webapp/migrations/056_branches_timezone.sql` | 1 | Новый |
| `apps/integrator/src/shared/normalizeToUtcInstant.ts` | 2 | Новый |
| `apps/integrator/src/shared/normalizeToUtcInstant.test.ts` | 2 | Новый |
| `apps/integrator/src/integrations/rubitime/connector.ts` | 3 | Изменение (нормализация recordAt) |
| `apps/integrator/src/infra/db/repos/bookingRecords.ts` | 3 | Изменение (::timestamptz) |
| `apps/integrator/src/config/appTimezone.ts` | 4 | Изменение (БД вместо env) |
| `apps/integrator/src/config/env.ts` | 4 | Изменение (удаление TZ vars) |
| `apps/integrator/src/integrations/rubitime/scheduleNormalizer.ts` | 5 | Изменение (параметр tz) |
| `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` | 5 | Изменение (tz из каталога) |
| `apps/webapp/src/modules/integrator/bookingM2mApi.ts` | 5 | Изменение (tz из branches) |
| `apps/integrator/src/infra/scripts/resync-rubitime-records.ts` | 7 | Изменение (normalizeToUtcInstant) |
| `apps/integrator/src/integrations/google-calendar/sync.ts` | 7 | Изменение (normalizeToUtcInstant) |
| `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` | 7 | Изменение (обновление) |

## Критерии готовности (definition of done)

Статус на уровне **репозитория и CI** (после глобального аудита и Global FIX): пункты ниже, кроме бэкфилла на целевой БД, закрыты.

- [x] Внутри системы нет наивных дат в `record_at` / `slot_start` / `slot_end` на новых путях ingest; legacy safety-net в webapp — Stage 7.
- [x] Нет env-переменных для timezone (кроме секретов и DSN).
- [x] Нет хардкодов `+03:00` в продуктовом коде (кроме тестовых фикстур).
- [x] Integrator и webapp читают display-timezone из одного источника (БД).
- [x] Филиал хранит свою IANA-зону.
- [x] `normalizeToUtcInstant` — единственная функция интерпретации наивных дат.
- [x] Для невалидных времени/зоны реализован вариант A: запись не теряется, но инцидент + Telegram-алерт обязательны.
- [x] Механизм инцидентов и алертов одинаково применим для всех интеграций, где есть бизнес-обязательные datetime.
- [x] Контрактные тесты (Stage 8) зелёные.
- [x] `pnpm run ci` зелёный.
- [ ] Бэкфилл исторических данных применён **на целевой БД** — **pending production (оператор)**; runbook: `docs/TIMEZONE_UTC_NORMALIZATION/stage6/APPLY_PLAN.md`.

**Grep gate (`+03` / артефакты сборки):** проверять только исходники приложений, без копий из билда — например:

`rg '+03:00' apps/integrator/src apps/webapp/src --glob '*.ts' --glob '!*.test.ts'` (при необходимости отдельно искать границу слова `+03` в нестроковых литералах).

Не использовать как источник истины каталоги `.next/`, `dist/`, `node_modules/`.

## Связанные документы

- `docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md` — журнал этапов и глобальный аудит.
- `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_GLOBAL.md` — итог глобального аудита и operational follow-up (Stage 6 prod).
- `docs/BRANCH_UX_CMS_BOOKING/PLAN_BOOKING_TIMEZONE_TO_DB.md` — предыдущий план (частично реализован для webapp; integrator не мигрирован).
- `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` — правила разделения env vs БД.
- `docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md` — описание display-timezone в дашборде.
