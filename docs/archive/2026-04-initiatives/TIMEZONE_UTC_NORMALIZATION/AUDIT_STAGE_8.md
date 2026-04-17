# Stage 8 — Audit (контрактные тесты времени)

**Scope:** `docs/TIMEZONE_UTC_NORMALIZATION/STAGE_8_CONTRACT_TESTS.md` + §Stage 8 в `docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md`  
**Audit date (UTC):** 2026-04-05  
**Repository HEAD at audit:** `869f00fd285aa27f0609f7de88dae757d61cf3b0` (дерево с незакоммиченными Stage 8 артефактами; после коммита перезапустить `git rev-parse HEAD` для фиксации SHA в логе)

---

## Verdict

**REWORK_REQUIRED**

UTC/local ожидания и негативные сценарии в integrator-тестах согласованы с планом; CI зелёный; повторные прогоны Stage 8 без флаков. При этом **сквозное покрытие «всех заявленных слоёв» из STAGE_8 / MASTER_PLAN не выполнено**: в автотестах нет проверок `appointment_records.record_at` и `patient_bookings.slot_start` через код репозиториев/SQL webapp; для негатива по datetime не зафиксирован bind `record_at = NULL` на пути записи в БД.

---

## 1) Сквозные тесты и заявленные слои

| Слой (по плану) | Ожидание | Фактическое покрытие |
|-----------------|----------|----------------------|
| Ingest `normalizeToUtcInstant` / `recordAt` ISO-Z | Moscow / Samara | **OK** — `timezoneContract.stage8.test.ts` + `timezoneContract.fixtures.ts` |
| `rubitime_records.record_at` (bind SQL) | UTC instant | **OK** — захват `$3` в моке `writePort` (S8.T02) |
| Projection `recordAt` в outbox | ISO-Z | **OK** — JSON payload `projection_outbox` (S8.T02) |
| `appointment_records.record_at` | timestamptz = тот же instant | **GAP** — нет ассерта через `pgAppointmentProjection` / SQL / фикстуру webapp DB |
| `patient_bookings.slot_start` | timestamptz = тот же instant | **GAP** — тест `timezoneContract.stage8.test.ts` (webapp) содержит только `new Date(...).toISOString()`, без `pgPatientBookings` и без проекции |
| Бот `formatBookingRuDateTime` | MSK строки | **OK** — integrator S8.T02 / S8.T03 |
| Кабинет пациента / дашборд врача | строки UI | **OK** — `formatBookingDateTimeMediumRu` / `formatDoctorAppointmentRecordAt` в webapp Stage 8 файле |

**Вывод:** цепочка заявлена как ingest → **все** перечисленные таблицы webapp → UI; реализовано как **ingest → integrator write (частично) → форматтеры UI**. Таблицы webapp из gate не подтверждены тестами.

**Артефакты:**  
- `apps/integrator/src/integrations/rubitime/timezoneContract.fixtures.ts`  
- `apps/integrator/src/integrations/rubitime/timezoneContract.stage8.test.ts`  
- `apps/webapp/src/shared/lib/timezoneContract.stage8.test.ts`

---

## 2) Ожидаемые значения UTC / local vs план

| Сценарий | MASTER_PLAN / STAGE_8 | В коде тестов |
|----------|------------------------|---------------|
| Moscow wall `2026-04-07 11:00:00` | `record_at` / instant `2026-04-07 08:00:00+00` | `STAGE8_EXPECTED_MOSCOW_UTC_ISO` = `2026-04-07T08:00:00.000Z` — **совпадает** |
| Samara wall то же | `2026-04-07 07:00:00+00` | `STAGE8_EXPECTED_SAMARA_UTC_ISO` = `2026-04-07T07:00:00.000Z` — **совпадает** |
| Бот / кабинет MSK | `7 апр. 2026 г., 11:00` (Moscow instant) | **совпадает** |
| Samara instant, display MSK | `7 апр. 2026 г., 10:00` | **совпадает** |
| Samara instant, display Samara | `7 апр. 2026 г., 11:00` | **совпадает** |
| Дашборд врача | `11:00 07.04` | **совпадает** (webapp + Samara кейс для врача) |

---

## 3) Негативные кейсы: Variant A + алерты

### S8.T04 — invalid datetime

| Требование STAGE_8 | Покрытие |
|--------------------|----------|
| Запись не потеряна (A) | **OK** — `recordId` сохранён, объект `record` на месте |
| `record_at` → NULL в хранилище | **Частично** — в ingest `recordAt` очищен (`undefined`), `timeNormalizationStatus` = `degraded`; **нет** ассерта, что `createDbWritePort` / параметр SQL для `rubitime_records.record_at` получает `NULL` |
| Инцидент качества | **OK** — мок `upsertIntegrationDataQualityIncident` вызывается |
| Telegram админу | **OK** — `dispatchOutgoing` вызывается |
| Google Calendar не создаёт/не обновляет | **OK** — `syncAppointmentToCalendar` без `recordAt`: `upsertEvent` / `deleteEvent` не вызываются |

**Webapp «S8.T04 (UI)»:** проверяются только пустые форматтеры при `null` / `""` — это **не** дублирует контракт инцидента/алерта, а лишь граничное поведение UI.

### S8.T05 — invalid branch IANA

| Требование | Покрытие |
|------------|----------|
| Runtime не падает | **OK** |
| Fallback (MSK) | **OK** — нормализация даёт Moscow UTC ISO |
| Инцидент конфигурации | **OK** — `upsertIncidentMock` с `field: branch_timezone`, `errorReason: invalid_iana` |
| Telegram | **OK** — `dispatchOutgoing` |

Разрешение ветки идёт через замоканный **`db` из `infra/db/client`** (`query` → `Invalid/Timezone`); `createGetBranchTimezoneWithDataQuality` получает отдельный stub-`db` для пути алерта — согласовано с реализацией `branchTimezone.ts` (SELECT через модульный `db`).

---

## 4) Flaky-поведение

- Прогоны **3×** подряд: только `timezoneContract.stage8.test.ts` (integrator + webapp) — стабильно **PASS**.
- Использование `vi.useFakeTimers({ now: 0 })` в integrator-файле не привело к расхождениям в этих прогонах; риск остаётся низким при фиксированных ISO в ассертах.

---

## 5) CI evidence

| Команда | Результат | Дата (UTC) |
|---------|-----------|------------|
| `pnpm install --frozen-lockfile && pnpm run ci` | **Exit 0** | 2026-04-05 |

**Фактический прогон (локально, полный pipeline):** lint → typecheck (integrator + webapp) → integrator vitest **579 passed** (6 skipped) → webapp vitest **1153 passed** (5 skipped) → webapp typecheck → build integrator → `next build` webapp → `pnpm audit --prod` (no known vulnerabilities).

Повторный полный CI после коммита Stage 8 файлов обязателен для фиксации SHA в `AGENT_EXECUTION_LOG.md`.

---

## Findings by severity

| ID | Severity | Finding |
|----|----------|---------|
| S8-A1 | **High** | В `STAGE_8_CONTRACT_TESTS.md` (S8.T02) и `MASTER_PLAN.md` §S8.T02 перечислены `appointment_records.record_at` и `patient_bookings.slot_start`; в репозитории нет теста, который проходит этот путь (репозиторий/SQL/integration с webapp БД). |
| S8-A2 | **Medium** | Для S8.T04 не подтверждено сохранение **`record_at` = NULL** на уровне SQL/bind integrator `writePort` при деградации (только очищенный inbound payload). |
| S8-A3 | **Low** | Webapp-тест названием «S8.T04» дублирует номер интеграционного негатива, но по смыслу — только UI при пустом instant; возможна путаница при сопровождении. |
| S8-I1 | **Info** | `MASTER_PLAN.md` чекбокс «Контрактные тесты (Stage 8) зелёные» остаётся неснятым до явного обновления документа после закрытия gap слоёв. |

---

## MANDATORY FIX INSTRUCTIONS (Stage 8 FIX)

Выполнять **только** в рамках закрытия замечаний Stage 8 (контрактные тесты и при необходимости тестовые хелперы), без новых продуктовых фич.

1. **Закрыть S8-A1 (обязательно для PASS по gate «все слои»):**  
   - Добавить тест(ы), которые при том же каноническом instant (`2026-04-07T08:00:00.000Z` / Samara `07:00:00Z`) проверяют запись/чтение **`appointment_records.record_at`** и **`patient_bookings.slot_start`** через существующие webapp-репозитории, **или** через контролируемую интеграционную фикстуру (PG testcontainer / транзакционный тест), **или** через явный вызов функций проекции с захватом параметров SQL — по тому же паттерну, что integrator уже делает для `rubitime_records` + `projection_outbox`.  
   - Цель: один источник истины по instant на стороне webapp DB, зафиксированный в CI.

2. **Закрыть S8-A2:**  
   - В `timezoneContract.stage8.test.ts` (integrator) добавить сценарий: после `normalizeRubitimeIncomingForIngest` с invalid datetime вызвать `writePort.writeDb` (или минимальный путь записи) и assert, что параметр для `record_at` / колонка соответствует **NULL** (или эквиваленту в слое bind), согласно Variant A.

3. **S8-A3 (опционально):**  
   - Переименовать webapp-кейс, например в «S8.T04b UI empty instant», или объединить описание в `describe`, чтобы не смешивать с S8.T04 integrator.

4. **Документация:**  
   - После FIX обновить `AGENT_EXECUTION_LOG.md` §Stage 8 (expected values, список тестов, результат `pnpm run ci`, SHA).  
   - При необходимости уточнить `STAGE_8_CONTRACT_TESTS.md`, если gate формулируется как «все слои **включая webapp таблицы**» — чтобы совпадало с реализацией.

5. **Gate перед merge:**  
   - `pnpm run ci` — **зелёный** после изменений.

---

## References

- План этапа: `docs/TIMEZONE_UTC_NORMALIZATION/STAGE_8_CONTRACT_TESTS.md`  
- Целевые значения UTC/UI: `docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md` §Stage 8  
- Исполнение (черновик): `docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md` §Stage 8
