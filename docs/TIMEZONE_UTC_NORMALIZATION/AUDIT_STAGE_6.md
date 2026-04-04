# Audit — Stage 6 (исторический backfill времени / UTC normalization)

**Дата аудита:** 2026-04-04 (UTC)  
**Основание:** `docs/TIMEZONE_UTC_NORMALIZATION/STAGE_6_BACKFILL_HISTORICAL_TIMES.md`, артефакты `docs/TIMEZONE_UTC_NORMALIZATION/stage6/`, код integrator (`stage6-historical-time-backfill.ts`, `historicalTimeBackfillLogic.ts`), миграция `20260405_0001_integration_data_quality_stage6_backfill.sql`

---

## Verdict

**PASS**

Реализация backfill **не является** слепым массовым сдвигом: обновления точечные, с явными предикатами в SQL и классификацией строк в коде. Критерии выборки обоснованы и задокументированы. Ветка `record_at IS NULL` разделена на восстановление и `unresolved` (+ инциденты при apply). Backup и порядок apply отражены в `APPLY_PLAN.md`. CI на рабочем дереве проходит (см. раздел «CI evidence»).

**Оговорка (не переводит вердикт в REWORK для кода):** зафиксированных **артефактов** dry-run / post-check с **реальной** БД в репозитории нет — это ожидаемо до прогона оператором; для **production gate** Stage 6 их нужно приложить (см. findings **S6-B**, **MANDATORY FIX INSTRUCTIONS**).

---

## Чеклист запроса аудита

### 1) Backfill не слепой массовый сдвиг

| Аспект | Оценка | Комментарий |
|--------|--------|-------------|
| Выборка строк | **OK** | Сканируются строки с `created_at < cutoff`, но в план обновления попадают только прошедшие `classifyHistoricalRubitimeTiming` (см. `stage6-historical-time-backfill.ts`). |
| SQL UPDATE | **OK** | `UPDATE ... WHERE id = $id AND (record_at IS DISTINCT FROM ...)` (и аналоги для слотов) — нет `UPDATE table SET ... WHERE true`. |
| `patient_bookings` | **OK** | Только `source = 'rubitime_projection'` и только если есть согласованный план по `rubitime_id` из запланированных записей rubitime/appointment. |
| Режим расширения | **Риск (документирован)** | `--no-require-utc-match` расширяет выборку вне паттерна «naive как UTC»; в `APPLY_PLAN.md` указано использовать только с отдельным SQL-аудитом. |

### 2) Критерии целевой выборки обоснованы

| Критерий | Где зафиксирован | Реализация |
|----------|------------------|------------|
| Граница по времени внедрения фиксов | `stage6/README.md` | `created_at < cutoffExclusive` + повторная проверка в классификаторе (`on_or_after_cutoff`). |
| Наличие наивной стены в payload | README, `DIAGNOSTICS.sql` | `extractRubitimePayloadWallStart` + `isNaiveWallClockString` / `NAIVE_WALL_CLOCK_REGEX`. |
| Исправление только ошибочных non-NULL | README | `already_correct` → skip; default: `stored_not_matching_naive_as_utc_pattern` → skip если stored не совпадает с naive-as-UTC. |
| IANA зона филиала | README | `branches.timezone` / маппинг `integrator_branch_id`; fallback `Europe/Moscow` при отсутствии ключа. |
| Ограничение модели | README | Явно: используется **текущая** `branches.timezone`, не снимок на момент события — при смене TZ история теоретически может быть искажена; это честно задокументировано. |

### 3) Отдельный разбор `record_at IS NULL` (restored / unresolved)

| Путь | Поведение |
|------|-----------|
| **restore_null_record_at** | В `classifyHistoricalRubitimeTiming`: при `recordAtDb == null`, успешной нормализации raw → план с `newRecordAt` (и `newSlotEnd` при наличии). |
| **unresolved** | Нормализация не удалась → в массив `unresolved`, счётчик `unresolved_candidates`, опционально JSONL через `--unresolved-out`. |
| **Инциденты** | При `--apply` — `upsertBackfillUnresolvedIncident` в `integration_data_quality_incidents` с `error_reason = backfill_unresolvable`, `status = unresolved` (после миграции constraint). |
| Диагностика NULL | `DIAGNOSTICS.sql`: отдельные SELECT для `record_at IS NULL` + naive payload (rubitime и appointment). |

**Замечание:** при dry-run без `--unresolved-out` список `unresolved` только в aggregate `counts.unresolved_candidates`, без построчного файла — оператору нужно передавать флаг (см. **S6-C**).

### 4) Dry-run и post-check evidence задокументированы

| Элемент | Статус |
|---------|--------|
| Механизм dry-run | **OK** — две сессии `BEGIN` → точечные `UPDATE` → лог `rowsTouched` → `ROLLBACK` (`stage6-historical-time-backfill.ts`). |
| Инструкция сохранить вывод | **OK** — `APPLY_PLAN.md` (перенаправление в файл). |
| Post-check шаги | **OK** — `STAGE_6_BACKFILL_HISTORICAL_TIMES.md`, `APPLY_PLAN.md` (диагностика, UI, JSONL + инциденты). |
| **Сохранённые результаты прогона на реальной БД** | **Нет в репо** — в `AGENT_EXECUTION_LOG.md` явно: dry-run в среде агента не выполнялся; ожидается оператор. |

### 5) Backup перед apply

| Элемент | Статус |
|---------|--------|
| Прекондишн в плане | **OK** — `APPLY_PLAN.md`: свежий backup integrator + webapp (или кластера). |
| Риск двух БД | **OK (документирован)** — независимые транзакции; отказ между COMMIT описан в `APPLY_PLAN.md`. |
| Автоматизация backup в репо | Не требуется для PASS — это операционная процедура на хосте. |

### 6) CI evidence

Команда из корня репозитория, **exit code 0**, **2026-04-04** (повторный прогон в рамках аудита), commit `869f00fd285aa27f0609f7de88dae757d61cf3b0`:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Результат: `eslint`, typecheck (integrator + webapp), integrator vitest **572 passed | 6 skipped**, webapp vitest **1149 passed | 5 skipped**, `webapp:typecheck`, `pnpm build` (integrator), `pnpm build:webapp` (Next.js), `pnpm audit --prod` — без ошибок.

---

## Findings по серьёзности

### S6-A — **LOW** (тестовое покрытие классификатора)

**Файл:** `apps/integrator/src/scripts/stage6/historicalTimeBackfillLogic.test.ts`  

Покрыты: extract/coerce, naive detection, fix misinterpreted UTC, restore null, already_correct, `deriveCompatSlotEnd`.  

**Не покрыты:** ветки `unresolved` (невалидная TZ / parse), `skip` с `stored_not_matching_naive_as_utc_pattern`, `raw_start_not_naive_wall_clock`, `no_raw_start_in_payload`. Регрессии в этих ветках возможны без падения CI.

### S6-B — **MEDIUM** (операционные артефакты evidence)

**Файлы:** `docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md` (раздел Stage 6)  

Для формального закрытия **production gate** из `STAGE_6_BACKFILL_HISTORICAL_TIMES.md` («Backup и evidence сохранены») недостаточно описания процедуры: нужны **сохранённые** выводы dry-run (JSON), post-check SELECT (или выжимка), ссылка/идентификатор backup. Сейчас это место явно помечено как не выполненное в песочнице агента.

### S6-C — **LOW** (операторский UX CLI)

**Файл:** `apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts`  

- В `--help` строка про `--require-utc-match` вводит в заблуждение: отдельного флага нет, поведение по умолчанию уже «require match»; есть только `--no-require-utc-match`.  
- Для полного списка `unresolved` на dry-run рекомендуется всегда указывать `--unresolved-out=...` (в `APPLY_PLAN` сейчас флаг показан только для apply).

### S6-D — **INFO** (топология БД и диагностика)

**Файл:** `docs/TIMEZONE_UTC_NORMALIZATION/stage6/DIAGNOSTICS.sql`  

Запросы с `JOIN branches` для `rubitime_records` предполагают наличие таблицы `branches` в той же БД, куда направлен запрос. Скрипт backfill корректно читает филиалы через `WEBAPP_DATABASE_URL`. Оператору нужно запускать диагностику на той топологии, где join валиден (или адаптировать dblink/отдельные запросы) — в README это косвенно следует из описания источника TZ.

---

## Mandatory fixes

**Для кода/репозитория (желательно в рамках Stage 6 FIX):**

1. Уточнить текст `--help` в `stage6-historical-time-backfill.ts` (убрать несуществующий флаг `--require-utc-match`, описать дефолт явно).  
2. Добавить unit-тесты на `unresolved` и на skip `stored_not_matching_naive_as_utc_pattern` (минимум по одному кейсу).  
3. В `APPLY_PLAN.md` (или README) явно рекомендовать `--unresolved-out` и для dry-run.

**Для production gate (оператор; блокирует «полный» PASS gate из STAGE_6 doc, не блокирует merge кода):**

4. Выполнить dry-run на целевых URL, сохранить оба JSON-объекта (план + `dryRunTransaction`).  
5. После apply — выполнить post-check из `DIAGNOSTICS.sql` + выборочно UI; зафиксировать в логе/тикете.  
6. Зафиксировать идентификатор/время backup перед apply.

---

## MANDATORY FIX INSTRUCTIONS — Stage 6 FIX

Использовать как чеклист для PR/коммита «Stage 6 FIX» и для операционного закрытия этапа.

### A. Документация и CLI (репозиторий)

1. Отредактировать блок `Usage` / `--help` в `apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts`:  
   - Заменить формулировку «`--require-utc-match` Default» на явное «По умолчанию требуется совпадение с naive-as-UTC; отключить: `--no-require-utc-match`».  
2. В `docs/TIMEZONE_UTC_NORMALIZATION/stage6/APPLY_PLAN.md` в шаге dry-run добавить строку с `--unresolved-out=/tmp/stage6-unresolved-dry-run.jsonl` (тот же формат, что и при apply).  
3. Расширить `historicalTimeBackfillLogic.test.ts`:  
   - кейс `unresolved` (например, заведомо невалидная IANA в `branchTimezone` или сырой raw, не проходящий нормализацию — по возможности без хрупкой привязки к сообщению ошибки);  
   - кейс skip `stored_not_matching_naive_as_utc_pattern` при `requireUtcMisinterpretationMatch: true`.  
4. Прогнать `pnpm install --frozen-lockfile && pnpm run ci` и приложить вывод (или SHA + дату) в `AGENT_EXECUTION_LOG.md` при фиксации Stage 6 FIX.

### B. Оператор: evidence после прогона на реальной БД

1. **Миграция:** убедиться, что на integrator применена `20260405_0001_integration_data_quality_stage6_backfill.sql` до первого `--apply` с записью инцидентов.  
2. **Backup:** создать backup integrator и webapp (как в `APPLY_PLAN.md`); записать метку времени и способ восстановления в тикет.  
3. **Dry-run:**  
   ```bash
   pnpm --dir apps/integrator run timezone:stage6-backfill -- \
     --cutoff-iso=<CUTOFF> \
     --dry-run \
     --unresolved-out=/tmp/stage6-unresolved-dry-run.jsonl \
     > /tmp/stage6-dry-run.json
   ```  
   Сохранить файлы и прикрепить к тикету; сверить `counts`, `samples`, `skipHistogram`.  
4. **Apply:** по `APPLY_PLAN.md` с тем же `<CUTOFF>`.  
5. **Post-check:** выполнить релевантные запросы из `DIAGNOSTICS.sql` (в т.ч. контроль `diff_min_vs_branch` → 0 для исправленных классов); выборочно UI/бот; сверить `integration_data_quality_incidents` для `backfill_unresolvable`.  
6. **Лог:** добавить запись в `docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md` с датой, cutoff, краткой статистикой из сохранённых JSON и результатом post-check (без секретов и полных дампов).

### C. Критерий готовности Stage 6 FIX (репо)

- Выполнены пункты **A.1–A.3** (или зафиксировано осознанное отклонение в PR).  
- **A.4** — зелёный `pnpm run ci`.  
- Пункты **B** — по мере реального cutover; до их выполнения production gate из `STAGE_6_BACKFILL_HISTORICAL_TIMES.md` остаётся незакрытым, несмотря на **PASS** реализации в данном аудите.

---

## Ссылки на ключевой код

- Классификация строк: `apps/integrator/src/scripts/stage6/historicalTimeBackfillLogic.ts` (`classifyHistoricalRubitimeTiming`).  
- Оркестрация транзакций и UPDATE: `apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts`.  
- Расширение constraint инцидентов: `apps/integrator/src/infra/db/migrations/core/20260405_0001_integration_data_quality_stage6_backfill.sql`.  
- Типы: `apps/integrator/src/shared/integrationDataQuality/types.ts`.
