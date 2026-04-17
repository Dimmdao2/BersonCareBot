# Audit — Stage 5 (убрать хардкоды +03:00 в слот-потоке)

**Дата аудита:** 2026-04-04  
**Основание:** `docs/TIMEZONE_UTC_NORMALIZATION/STAGE_5_REMOVE_HARDCODED_OFFSETS.md`

## Verdict

**REWORK_REQUIRED**

Основной слот-пайплайн (integrator `scheduleNormalizer` → M2M `/rubitime/slots` → webapp `bookingM2mApi` v2 → `patient-booking` с `branchTimezone` из каталога) соответствует целям Stage 5.  
Однако **формальный Gate** из Stage 5 («в продуктовом коде нет хардкодов `+03:00` / `+03`, кроме тестов») **не выполнен**: в webapp остаётся литерал `+03:00` в `formatBusinessDateTime.ts` (см. findings).

---

## Проверки

### 1) Нет активных хардкодов `+03:00` / `+03` в slot runtime code

| Область | Статус | Комментарий |
|--------|--------|-------------|
| Integrator Rubitime slot normalization | **OK** | `scheduleNormalizer.ts` использует только `normalizeToUtcInstant(naiveWall, branchTimezone)` — без фиксированного смещения. |
| Integrator M2M slots / create-record v2 | **OK** | `recordM2mRoute.ts`: `normalizeRubitimeSchedule(..., branchTimezone)` и `formatIsoInstantAsRubitimeRecordLocal(..., branchTimezone)` после `getBranchTzWithIncident`. |
| Webapp `bookingM2mApi.ts` (v2 `times[]`) | **OK** | `rubitimeWallSlotToUtcIso` через Luxon `DateTime.fromISO(..., { zone: branchTimezone })`. |
| Webapp `patient-booking/service.ts` | **OK** | В `fetchSlots` для in-person передаётся `branchTimezone: resolved.branch.timezone`. |
| Прочий продуктовый TS (вне тестов) | **FAIL (Gate)** | См. finding **S5-A** ниже. |

Поиск по `apps/integrator/src/**/*.ts` и слот-связанным путям webapp: литералов `+03:00` / `+03` в рабочей логике Rubitime-слотов нет; в тестах и фикстурах — допустимо по Gate.

### 2) Везде используется timezone филиала

| Место | Поведение |
|-------|-----------|
| `recordM2mRoute.ts` (v2 slots, v2 create) | TZ из БД по `integrator_branch_id` через `createGetBranchTimezoneWithDataQuality` → `normalizeRubitimeSchedule` / `formatIsoInstantAsRubitimeRecordLocal`. |
| `bookingM2mApi.ts` (v2) | Основной путь: валидный `query.branchTimezone` → интерпретация `times[]`. |
| Legacy v1 (integrator + webapp) | TZ из маппинга профиля (`scheduleParams.branchId` / resolve), не из «магического +03» в normalizer. |

### 3) Fallback-поведение безопасно

| Компонент | Поведение | Оценка |
|-----------|-----------|--------|
| `apps/integrator/src/infra/db/branchTimezone.ts` | При отсутствии/невалидной TZ → `Europe/Moscow`, логирование, кэш TTL; в M2M — **инцидент data quality + Telegram** через `createGetBranchTimezoneWithDataQuality`. | **Безопасно**, наблюдаемо. |
| `bookingM2mApi.ts` | Если `branchTimezone` пустой/невалидный → `getAppDisplayTimeZone()` (system_settings). | **Функционально безопасно** как резерв отображения; **без** симметричного инцидента integrator-уровня (см. finding **S5-B**). |
| Каталог `pgBookingCatalog.ts` | Пустой timezone при insert → `"Europe/Moscow"` (IANA), не числовой оффсет. | Согласовано с дефолтом филиала. |

### 4) Тесты покрывают разные timezone

| Файл | Что проверяется |
|------|-----------------|
| `apps/integrator/src/integrations/rubitime/scheduleNormalizer.test.ts` | `Europe/Samara` vs `Europe/Moscow` для стены `2026-04-07 11:00` → `07:00Z` / `08:00Z`; регрессии MSK-кейсов. |
| `apps/webapp/src/modules/integrator/bookingM2mApi.test.ts` | Тот же сценарий для v2 `times[]` через mock integrator response. |
| `apps/integrator/src/infra/db/branchTimezone.test.ts` | Чтение TZ из БД, fallback при пустой/невалидной строке. |
| `apps/integrator/src/shared/normalizeToUtcInstant.test.ts` | Явные `+03:00` как **входные** строки для нормализации — тестовые фикстуры, OK. |

**Замечание (низкая важность):** в `apps/webapp/src/modules/patient-booking/service.test.ts` нет отдельного кейса Samara/Moscow на уровне сервиса; покрытие разницы TZ для слотов сосредоточено в `bookingM2mApi.test.ts` и integrator.

### 5) CI evidence подтверждён

Команда (корень репозитория), **exit code 0**, 2026-04-04:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Результат: lint, typecheck, integrator test (563 passed, …), webapp test (1146 passed, …), build integrator + webapp, `pnpm audit --prod` — без ошибок.

---

## Findings

### S5-A — **HIGH** (нарушение Gate Stage 5 по продуктовому коду)

**Файл:** `apps/webapp/src/shared/lib/formatBusinessDateTime.ts`  
**Строки:** константа `MSK_WALL_OFFSET = "+03:00"` и использование в `parseBusinessInstant` при `displayTimeZone === "Europe/Moscow"` и «наивном» ISO без `Z`/offset.

**Почему важно:** комментарий в файле прямо связывает поведение с трактовкой «как слоты Rubitime»; литерал `+03:00` — ровно то, что Gate Stage 5 запрещает вне тестов. Для филиалов с иной IANA-зоной путь с наивной строкой и не-Moscow display TZ идёт в `new Date(t)` и остаётся зависимым от окружения — отдельный риск, но не смещение +03.

### S5-B — **LOW** (наблюдаемость / симметрия с integrator)

**Файл:** `apps/webapp/src/modules/integrator/bookingM2mApi.ts` (ветка v2: выбор `branchTz` перед `normalizeV2SlotsPayload`).  
**Суть:** fallback на `getAppDisplayTimeZone()` при отсутствии/невалидном `branchTimezone` **без** записи data-quality инцидента (в отличие от integrator `getBranchTzWithIncident`). Для Stage 5 это допустимо как «тихий» резерв отображения, но операционная симметрия с integrator отсутствует.

### S5-C — **INFO** (покрытие тестами)

**Файл:** `apps/webapp/src/modules/patient-booking/service.test.ts`  
**Суть:** нет явного теста «Samara vs Moscow» на уровне `PatientBookingService.getSlots`; поведение v2 нормализации покрыто в `bookingM2mApi.test.ts`.

---

## MANDATORY FIX INSTRUCTIONS (Stage 5 FIX)

Цель: закрыть Gate Stage 5 по отсутствию литералов `+03:00` / `+03` в продуктовом коде и убрать MSK-only хак для наивных ISO.

### FIX-1 — `parseBusinessInstant` без `+03:00` (обязательно)

**Файл:** `apps/webapp/src/shared/lib/formatBusinessDateTime.ts`

1. Удалить константу `MSK_WALL_OFFSET` и ветку, добавляющую `+03:00` к наивному ISO.
2. Для строк вида `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?$` без зоны:
   - интерпретировать как **настенное время в `displayTimeZone`** (любая валидная IANA, не только `Europe/Moscow`), по той же семантике, что integrator: naive wall + IANA → один UTC instant.
   - реализация: например `DateTime.fromISO(normalized, { zone: displayTimeZone.trim() })` (Luxon уже зависимость webapp через `bookingM2mApi`) либо общий хелпер, выровненный с `apps/webapp/src/shared/normalizeToUtcInstant.ts` / integrator `normalizeToUtcInstant`.
3. При невалидной `displayTimeZone` или невалидной дате — сохранить предсказуемый деградационный путь (как сейчас для пустой строки / `NaN`).

**Тесты:** расширить `apps/webapp/src/shared/lib/formatBusinessDateTime.test.ts`:

- наивная строка + `Europe/Moscow` → тот же instant, что ожидался с прежним `+03:00` для фиксированной даты (например летнее время 2026-04);
- наивная строка + `Europe/Samara` → иной UTC instant vs Moscow для той же наивной метки;
- строки с `Z` или явным offset — без регрессий.

### FIX-2 (опционально, низкий приоритет) — наблюдаемость webapp fallback

**Файл:** `apps/webapp/src/modules/integrator/bookingM2mApi.ts`

Если требуется паритет с integrator: при fallback с каталожного `branchTimezone` на `getAppDisplayTimeZone()` логировать структурированно или писать инцидент (если появится webapp-путь к той же таблице/алерту). Не блокирует Gate Stage 5 по +03.

### FIX-3 (опционально) — интеграционный тест сервиса

Добавить в `patient-booking/service.test.ts` один тест с моком каталога и `syncPort.fetchSlots`, проверяющий прокидывание `Europe/Samara` в запрос v2 (если нужна явная трассировка «от UI до порта»).

### Критерии приёмки после FIX

- `rg '\+03:00|\+03\\b' apps/webapp/src --glob '*.ts' --glob '*.tsx'` не находит литералов вне `*.test.ts` / `*.test.tsx` (и иных явных фикстур по соглашению команды).
- `pnpm run ci` зелёный.
- Актуализировать `AGENT_EXECUTION_LOG.md` (если ведётся) списком изменённых файлов и результатом CI.

---

## Краткое резюме для владельца этапа

- **Слоты Rubitime (normalizer + M2M + v2 webapp):** ветка Stage 5 реализована корректно, CI подтверждён.
- **Gate «нет +03 в продуктовом коде»:** не закрыт из-за `formatBusinessDateTime.ts` → **REWORK_REQUIRED** до FIX-1.
