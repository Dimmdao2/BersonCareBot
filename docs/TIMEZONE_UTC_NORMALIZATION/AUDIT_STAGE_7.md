# Stage 7 — Audit (Downstream cleanup)

**Scope:** `docs/TIMEZONE_UTC_NORMALIZATION/STAGE_7_DOWNSTREAM_CLEANUP.md` + §Stage 7 в `MASTER_PLAN.md`  
**Audit date (UTC):** 2026-04-05  
**Repository HEAD at CI:** `869f00fd285aa27f0609f7de88dae757d61cf3b0`

---

## Verdict

**PASS**

Инкрементальные задачи Stage 7 (S7.T01–S7.T06) закрыты в коде и документации по конфигурации; полный `pnpm run ci` успешен. Ниже — проверки, находки и инструкции для возможной доработки (FIX).

---

## 1) Legacy timezone helper'ы — удалены/заменены по плану

| Требование | Статус | Доказательство |
|------------|--------|----------------|
| S7.T01 `parseBusinessInstant` — safety-net + warn | **OK** | Однократный `console.warn` при разборе наивной wall-clock строки: `apps/webapp/src/shared/lib/formatBusinessDateTime.ts` (флаг `warnedNaiveBusinessInstantParse`). |
| S7.T02 `pgPatientBookings` — защитный CASE + документация | **OK** | Комментарий «Legacy guard (not the normal path after Stage 3 ingest)» у `UPDATE` с `CASE WHEN source = 'rubitime_projection'`: `apps/webapp/src/infra/repos/pgPatientBookings.ts`. |
| S7.T03 resync — без `rubitimeMaybeDateToIso`, канонический normalizer | **OK** | `apps/integrator/src/infra/scripts/resync-rubitime-records.ts` импортирует `normalizeToUtcInstant`; символ `rubitimeMaybeDateToIso` в `apps/` отсутствует. |
| S7.T04 Google Calendar sync — без `parseRecordAtToIso` | **OK** | `apps/integrator/src/integrations/google-calendar/sync.ts` использует `normalizeToUtcInstant`; `parseRecordAtToIso` в `apps/` отсутствует. |
| Скрипт compare (доп. к плану в логе) | **OK** | `compare-rubitime-records.ts` использует `getAppDisplayTimezone` + `normalizeToUtcInstant`. |

**Finding F1 (info, не блокер):** В `MASTER_PLAN.md` §Stage 7 Gate указано «grep … `BOOKING_DISPLAY_TIMEZONE` … ноль вхождений», при этом в продуктовом коде остаётся устаревший **`getAppDisplayTimezoneSync()`** (`apps/integrator/src/config/appTimezone.ts`), который читает `process.env.APP_DISPLAY_TIMEZONE` / `BOOKING_DISPLAY_TIMEZONE` вне zod-схемы (с `logger.warn`). Это согласовано с §«Текущее состояние» (L54) и Stage 4, но **не** с буквальной формулировкой grep-gate в §Stage 7.

**Fix path (опционально):** см. §MANDATORY FIX INSTRUCTIONS — блок «Строгое выравнивание grep-gate».

---

## 2) Deprecated env — не участвуют в runtime (валидированный путь)

| Проверка | Результат |
|----------|-----------|
| `RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES` в `apps/integrator/src/config/env.ts` (zod) | **Отсутствует** — в реестре только инфраструктура и перечисленные ключи (см. текущий `env.ts`). |
| Grep `RUBITIME_RECORD_AT_UTC_OFFSET` по `apps/**/*.ts` | **0 совпадений** |
| Основной HTTP/доменный путь integrator | Использует **`getAppDisplayTimezone({ db, … })`** из БД (например `recordM2mRoute.ts` для create-record/slots — проверено по импортам). |
| `getAppDisplayTimezoneSync` | Вызывается из **тестов** и реэкспортируется из `bookingDisplayTimezone.ts`; **импортов** `bookingDisplayTimezone` в кодовой базе **нет** — в рантайме сервиса синхронный путь не подключён. |

**Вывод:** Валидированные при старте env-переменные не содержат deprecated timezone offset; операторский deploy не получает «тихого» сдвига через zod. Остаточное чтение legacy имён — только внутри неиспользуемого в проде sync-хелпера (плюс тесты).

---

## 3) Grep-проверки: `+03:00` и старые ключи

Команды (выполнены в контексте аудита):

- `+03:00` в `apps/webapp/src/**/*.ts` — **только тесты** (`formatBusinessDateTime.test.ts`, `bookingM2mApi.test.ts`, `route.test.ts` и т.д.).
- `+03:00` в `apps/integrator/src/**/*.ts` — **только тесты** (`normalizeToUtcInstant.test.ts`, `resync-rubitime-records.test.ts`, `sync.test.ts`, `explicitZonedIsoInstant.test.ts`, `appTimezone.test.ts`).
- `RUBITIME_RECORD_AT_UTC_OFFSET` в `apps/**/*.ts` — **0**.
- `BOOKING_DISPLAY_TIMEZONE` / `APP_DISPLAY_TIMEZONE` как **имена env** — встречаются в `appTimezone.ts` (legacy sync + текст warn) и в `appTimezone.test.ts`; константа `DEFAULT_APP_DISPLAY_TIMEZONE` в webapp — **не env**, а IANA-дефолт в коде.

**Finding F2 (документация вне scope Stage 7):** `docs/BRANCH_UX_CMS_BOOKING/TODO_BACKLOG.md` содержит устаревшую ссылку на `getAppDisplayTimezoneSync()` для create-record; фактический путь — `getAppDisplayTimezone` + branch timezone. Исправление — отдельным PR в backlog-док.

---

## 4) Документация обновлена

| Артефакт | Статус |
|----------|--------|
| `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` | **OK** — §timezone: `app_display_timezone`, IANA филиалов, отсутствие env offset / `RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES`, ссылка на `normalizeToUtcInstant`. |
| `AGENT_EXECUTION_LOG.md` §Stage 7 | Содержит запись EXEC и grep/CI (согласовано с текущим состоянием). |

---

## 5) CI evidence

| Команда | Результат | Дата |
|---------|-----------|------|
| `pnpm run ci` | **Exit 0** | 2026-04-05 |

Полный pipeline: `eslint` → root + webapp `eslint` → `typecheck` (integrator + webapp) → `vitest` integrator (**574 passed**, 6 skipped) → `vitest` webapp (**1149 passed**, 5 skipped) → повторный webapp typecheck → `build` integrator → `next build` webapp → `pnpm audit --prod` (no known vulnerabilities).

---

## Findings summary + fix path

| ID | Severity | Finding | Fix path |
|----|----------|---------|----------|
| F1 | Low | Расхождение буквального grep-gate в `MASTER_PLAN.md` §Stage 7 с наличием `getAppDisplayTimezoneSync` | Обновить формулировку gate в `MASTER_PLAN.md` **или** удалить/сузить legacy sync (см. §MANDATORY FIX ниже). |
| F2 | Low (вне обязательного scope) | Устаревшая строка в `TODO_BACKLOG.md` про create-record и sync | Правка backlog-документа при следующем проходе по докам. |

---

## MANDATORY FIX INSTRUCTIONS (Stage 7 FIX)

Использовать **только** если последующий прогон требует устранить замечания или ужесточить gate. При текущем **verdict: PASS** обязательных блокирующих действий **нет**.

### Если FIX вызван строгим grep-gate (`BOOKING_DISPLAY_TIMEZONE` / `APP_DISPLAY_TIMEZONE` = 0 в `src`)

1. **Вариант A (предпочтительно для минимального diff):** В `docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md` в §Stage 7 Gate уточнить: «ноль вхождений **кроме** deprecated `getAppDisplayTimezoneSync` и связанных тестов / сообщений лога, оставленных для скриптов без БД» — в соответствии с §«Текущее состояние» (L54).
2. **Вариант B (код):** Удалить или сделать no-op `getAppDisplayTimezoneSync()` (всегда возвращать `DEFAULT_APP_DISPLAY_TIMEZONE`), удалить реэкспорт в `apps/integrator/src/infra/db/repos/bookingDisplayTimezone.ts`, обновить/удалить тесты в `appTimezone.test.ts`. Перед удалением убедиться, что ни один внешний скрипт/пакет не импортирует символ (grep по монорепо).

### Если FIX вызван «мёртвым» модулем

- Файл `bookingDisplayTimezone.ts` не имеет импортов: при политике «без мёртвого кода» — удалить файл и реэкспорты, прогнать `pnpm run ci`.

### Регрессия после FIX

- `pnpm run ci` обязателен.
- Повторить grep: `+03:00`, `RUBITIME_RECORD_AT_UTC_OFFSET`, `rubitimeMaybeDateToIso`, `parseRecordAtToIso` в `apps/` (без артефактов `.next`).

---

## Sign-off

- **Auditor role:** automated audit + repository inspection  
- **Recommendation:** Proceed to **Stage 8** (contract tests) по `MASTER_PLAN.md`.
