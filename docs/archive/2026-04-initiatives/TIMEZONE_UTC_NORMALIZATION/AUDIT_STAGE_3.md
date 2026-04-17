# Аудит Stage 3 — ingest, проекция, SQL-касты, Variant A, сигналы качества

**Дата аудита:** 2026-04-04 (UTC)  
**Область:** нормализация Rubitime на входе (`prepareRubitimeWebhookIngress` / `normalizeRubitimeIncomingForIngest`), запись в integrator DB (`rubitime_records`), outbox проекции → webapp `appointment_records`, инциденты `integration_data_quality_incidents`, Telegram-алерты, `getBranchTimezone`.

---

## Verdict

**REWORK_REQUIRED**

Основной блокер: при fallback / невалидной IANA для филиала нет обязательного операционного сигнала (инцидент + Telegram) — только предупреждения в логе (`branchTimezone.ts`). Это прямое нарушение проверяемого пункта 5 и carry-over из Stage 2 / `MASTER_PLAN` (S1.T06).

Остальные пункты 1–4, 6–7 в основном закрыты по каноническому Rubitime-пайплайну и тестам; ниже — нюансы и остаточные риски.

---

## Проверенные критерии (чеклист)

| # | Критерий | Результат |
|---|-----------|-----------|
| 1 | Наивная дата не проходит в БД как raw string | **Частично OK / доверие к границе:** для **Rubitime webhook / record_success** сырой наивный `datetime` проходит `normalizeRubitimeIncomingForIngest` → в мутацию и SQL уходит **ISO-Z или `null`**. См. `ingestNormalization.ts`, `webhook.ts` → `prepareRubitimeWebhookIngress`. **Остаток:** `createDbWritePort` → `booking.upsert` не валидирует формат `recordAt`; прямой вызов write с наивной строкой всё ещё возможен и с `$n::timestamptz` интерпретируется в **session TimeZone** PG — это не замена нормализации. |
| 2 | `recordAt` в projection всегда ISO-Z | **OK по дизайну Rubitime → outbox:** после нормализации в payload — строки с суффиксом `Z` (см. тесты). **Чтение из PG:** `getActiveRecordsByPhone` / webapp `mapRow` отдают `toISOString()` → **Z**. **Остаток:** обработчик webapp `appointment.record.upserted` принимает любой `string` без проверки на Z; гарантия — доверие к integrator. |
| 3 | SQL-cast защита `::timestamptz` | **OK:** `apps/integrator/src/infra/db/repos/bookingRecords.ts` — `$3::timestamptz`; `apps/webapp/src/infra/repos/pgAppointmentProjection.ts` — `$3::timestamptz`, `$7::timestamptz`. Доп. проверка: `bookingRecords.sql.test.ts`. |
| 4 | Variant A (невалидный datetime): запись не теряется, инцидент + Telegram | **OK в коде ingest:** при невалидном `recordAt` поле снимается, `upsertIntegrationDataQualityIncident` + `dispatchOutgoing` при первом dedup-insert (`occurrences === 1`). `writePort` кладёт `recordAt: null` и прокидывает `timeNormalizationStatus` / `timeNormalizationFieldErrors` в проекцию (см. `writePort.appointments.test.ts`). **Тест:** `ingestNormalization.test.ts` «Variant A…». **Замечание:** нет отдельного e2e-теста «после webhook строка в `rubitime_records` существует с `record_at IS NULL`» — логика выводится из цепочки. |
| 5 | Fallback / невалидная timezone: инцидент + Telegram, без тихого fallback | **НЕ выполнено:** `getBranchTimezone` при любых fallback-кейсах только `logger.warn` и кэширование `Europe/Moscow`. Нет вызова `upsertIntegrationDataQualityIncident` и нет Telegram-алерта. Файл: `apps/integrator/src/infra/db/branchTimezone.ts`. |
| 6 | Тесты MSK и Samara | **OK:** `ingestNormalization.test.ts` — `Europe/Moscow` и `Europe/Samara` для одной и той же наивной стенки. |
| 7 | CI evidence | **OK:** `pnpm install --frozen-lockfile && pnpm run ci` — **exit code 0** на момент аудита (2026-04-04). |

---

## Findings по серьёзности

### BLOCKER

1. **Нет операционного сигнала при fallback timezone филиала**  
   **Где:** `apps/integrator/src/infra/db/branchTimezone.ts` (`invalid_branch_id`, `query_failed`, пустая строка, невалидная IANA, отсутствие строки в БД).  
   **Почему важно:** план (S1.T06, Stage 2 carry-over) требует **инцидент + Telegram (dedupe)**, иначе ошибка конфигурации маскируется под «тихий» Moscow.  
   **Fix path:** расширить `getBranchTimezone` (или обёртку в `webhook.ts`) зависимостями `db` + `dispatchPort` и общим хелпером как в `ingestNormalization.ts` → `recordFailureAndMaybeAlert`; тип инцидента: отдельное `field` (например `branch_timezone`) и `error_reason` из множества `{ invalid_branch_id, query_failed, missing_or_empty, invalid_iana }`; dedupe по `(integration, entity, external_id, field, error_reason)` согласно текущей схеме уникальности.

### HIGH

1. **Граница доверия `booking.upsert` без валидации ISO-Z**  
   **Где:** `apps/integrator/src/infra/db/writePort.ts` — `recordAt` = любая непустая строка.  
   **Риск:** обход нормализации → наивная строка в PG.  
   **Fix path (на выбор):** (a) assert ISO instant с `Z` / offset в writePort или в одном месте перед SQL; (b) документировать, что единственный продьюсер — нормализованный Rubitime-путь, и закрыть другие входы.

### MEDIUM

1. **Webapp не проверяет формат `recordAt` на входе проекции**  
   **Где:** `apps/webapp/src/modules/integrator/events.ts` — `typeof p.recordAt === "string"`.  
   **Fix path:** опционально нормализовать/отклонять не-Z строки или писать инцидент на webapp-стороне (если нужна симметрия защиты).

### LOW

1. **Telegram-алерт не уходит, если не задан валидный `telegramConfig.adminTelegramId`**  
   **Где:** `ingestNormalization.ts` — ранний `return` без альтернативного канала.  
   **Fix path:** явная политика в проде (обязательный admin id) или дублирование в лог/метрики с уровнем error.

2. **Инцидент с `occurrences: 0` при ошибке SQL**  
   **Где:** `integrationDataQualityIncidents.ts` — catch → `{ occurrences: 0 }` → алерт не шлётся.  
   **Fix path:** логировать как error + счётчик метрик; при необходимости retry.

---

## Канонические пути к коду

| Тема | Путь |
|------|------|
| Нормализация ingest | `apps/integrator/src/integrations/rubitime/ingestNormalization.ts` |
| Точка входа webhook | `apps/integrator/src/integrations/rubitime/webhook.ts` |
| Маппинг payload | `apps/integrator/src/integrations/rubitime/connector.ts` |
| Запись integrator + outbox | `apps/integrator/src/infra/db/writePort.ts`, `apps/integrator/src/infra/db/repos/bookingRecords.ts` |
| Проекция webapp | `apps/webapp/src/infra/repos/pgAppointmentProjection.ts`, `apps/webapp/src/modules/integrator/events.ts` |
| Timezone филиала | `apps/integrator/src/infra/db/branchTimezone.ts` |
| Инциденты | `apps/integrator/src/infra/db/repos/integrationDataQualityIncidents.ts` |
| Тесты Stage 3 ingest | `apps/integrator/src/integrations/rubitime/ingestNormalization.test.ts` |
| SQL cast тест | `apps/integrator/src/infra/db/repos/bookingRecords.sql.test.ts` |

---

## MANDATORY FIX INSTRUCTIONS (Stage 3 FIX)

Ниже обязательные действия для повторного аудита Stage 3 с вердиктом **PASS**.

1. **[BLOCKER] Fallback / невалидная timezone — инцидент + Telegram**  
   - **Файлы:** `apps/integrator/src/infra/db/branchTimezone.ts`, вызывающий код (`webhook.ts` или DI), при необходимости вынести общий хелпер с `ingestNormalization.ts`.  
   - **Сделать:** на каждый сценарий fallback (невалидный `branchId`, ошибка SELECT, нет строки, пустой timezone, невалидная IANA) вызывать `upsertIntegrationDataQualityIncident` с согласованным контрактом `integration` / `entity` / `external_id` (например `rubitime` + `branch` + строковый branch id) / `field` / `error_reason`, и при `occurrences === 1` отправлять Telegram через `dispatchPort` (тот же dedup-паттерн, что для `recordAt`).  
   - **Done-критерий:** в тестах мокается DB инцидентов + dispatch; проверяется вызов при fallback; в проде нет единственного сигнала «только warn в логе».

2. **[HIGH] Зафиксировать границу для `recordAt` на `booking.upsert`**  
   - **Файлы:** `writePort.ts` и/или контракт executor/scripts.  
   - **Сделать:** либо жёсткая валидация «только ISO instant с offset или Z», либо явный documented invariant + запрет альтернативных продьюсеров.  
   - **Done-критерий:** наивная строка не может оказаться в параметре SQL без явного осознанного пути.

3. **[MEDIUM] (Опционально) Webapp: защита входа `recordAt`**  
   - **Файлы:** `apps/webapp/src/modules/integrator/events.ts`.  
   - **Сделать:** отклонять или нормализовать нестандартные строки согласно политике продукта.  
   - **Done-критерий:** либо явный reject с причиной, либо вторичная нормализация с метрикой.

4. **[LOW] Настройка admin Telegram**  
   - **Сделать:** в доке деплоя / runbook указать, что для data-quality алертов обязателен валидный admin chat id; при отсутствии — видимый error в логах или метрика «alerts_suppressed».

5. **Повторная верификация**  
   - **Команды:**  
     `pnpm install --frozen-lockfile && pnpm run ci`  
     `pnpm --dir apps/integrator test -- src/integrations/rubitime/ingestNormalization.test.ts src/infra/db/branchTimezone.test.ts`

---

## CI evidence (момент аудита)

```text
pnpm install --frozen-lockfile && pnpm run ci
# Exit code: 0
# integrator: 545 passed | 6 skipped
# webapp: 1144 passed | 5 skipped
# lint, typecheck, build, audit --prod: OK
```

---

## Связанные документы

- `docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md` — Stage 3  
- `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_2.md` — нормализация и carry-over  
- `docs/TIMEZONE_UTC_NORMALIZATION/STAGE_3_INGEST_NORMALIZATION.md` (если есть в репозитории)
