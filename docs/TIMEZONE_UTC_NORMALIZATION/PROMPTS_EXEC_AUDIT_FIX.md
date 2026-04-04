# Промпты для авто-агентов (copy-paste)

Контекст инициативы:

- Master plan: `docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md`
- Stage plans: `docs/TIMEZONE_UTC_NORMALIZATION/STAGE_*.md`
- Журнал: `docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md`

Общие правила для всех запусков:

1. Работать строго в scope указанного stage.
2. После изменений обновлять `AGENT_EXECUTION_LOG.md`.
3. Перед завершением этапа прогонять релевантные тесты и `pnpm run ci`.
4. В отчете всегда давать: `changed files`, `tests`, `gate evidence`, `verdict`.
5. Каждый запуск `AUDIT` обязан сохранять полный отчет в отдельный файл:
   - `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_<N>.md` для stage-аудитов,
   - `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_GLOBAL.md` для глобального аудита.
6. Каждый audit-файл обязан содержать раздел `MANDATORY FIX INSTRUCTIONS`:
   - нумерованный список обязательных исправлений,
   - для каждого пункта: severity, файлы, конкретные шаги фикса, критерий "done".
7. Каждый запуск `FIX` обязан брать входом соответствующий audit-файл и закрывать все `critical` и `major` из `MANDATORY FIX INSTRUCTIONS`.

---

## Stage 1 - EXEC

```text
Выполни Stage 1 по документу:
docs/TIMEZONE_UTC_NORMALIZATION/STAGE_1_BRANCH_TIMEZONE_DB.md

И основной контекст:
docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md

Требования:
1) Реализуй S1.T01-S1.T06 полностью.
2) Не выходи за scope Stage 1.
3) После каждой подзадачи обновляй:
   docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
4) В конце:
   - прогони релевантные тесты,
   - прогони pnpm run ci,
   - зафиксируй gate evidence.

Формат итога:
- S1.Txx -> done/blocked
- changed files
- checks run
- gate verdict: PASS | REWORK_REQUIRED
```

## Stage 1 - AUDIT

```text
Проведи аудит Stage 1.

Документы:
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_1_BRANCH_TIMEZONE_DB.md
- docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md

Проверь:
1) Миграции timezone добавлены для branches и booking_branches.
2) Колонки NOT NULL и имеют дефолт Europe/Moscow.
3) getBranchTimezone работает с TTL и fallback.
4) UI/валидация timezone не ломают сохранение.
5) Есть подтверждение tests + pnpm run ci.

Вывод:
- verdict: PASS | REWORK_REQUIRED
- findings: critical/major/minor
- для каждого finding: проблема, файл, как исправить
- сохрани полный отчет в `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_1.md`
- добавь раздел `MANDATORY FIX INSTRUCTIONS` для Stage 1 FIX
```

## Stage 1 - FIX

```text
Исправь замечания аудита Stage 1.

Вход:
- `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_1.md`

Правила:
1) Закрыть все critical и major.
2) Не расширять scope Stage 1.
3) Обновить AGENT_EXECUTION_LOG.md.
4) Повторить тесты и pnpm run ci.

Итог:
- fixed findings list
- changed files
- re-check results
- updated verdict
```

---

## Stage 2 - EXEC

```text
Выполни Stage 2 по документу:
docs/TIMEZONE_UTC_NORMALIZATION/STAGE_2_NORMALIZE_TO_UTC_INSTANT.md

Сделай:
1) Реализуй S2.T01-S2.T04.
2) Покрой функцию полным набором кейсов.
3) Убедись, что наивные даты интерпретируются только через IANA timezone.
4) Обнови AGENT_EXECUTION_LOG.md.
5) Прогони tests + pnpm run ci.

Формат итога:
- S2.Txx -> done/blocked
- changed files
- test matrix
- gate verdict
```

## Stage 2 - AUDIT

```text
Проведи аудит Stage 2.

Проверь:
1) normalizeToUtcInstant корректно работает для naive/Z/offset строк.
2) Плохой input не приводит к неконтролируемому падению runtime.
3) Нет хардкодов +03:00 в новой функции.
4) Экспорт/доступность функции соответствует плану.
5) Добавлен и покрыт тестами диагностический companion-контракт причин (`invalid_datetime|invalid_timezone|unsupported_format`).
6) CI evidence присутствует.

Формат:
- verdict: PASS | REWORK_REQUIRED
- findings by severity
- actionable fix path
- сохрани полный отчет в `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_2.md`
- добавь раздел `MANDATORY FIX INSTRUCTIONS` для Stage 2 FIX
```

## Stage 2 - FIX

```text
Исправь замечания Stage 2 AUDIT.
Scope Stage 2 + явно помеченный carry-over из `MANDATORY FIX INSTRUCTIONS` в `AUDIT_STAGE_2.md` (если затрагивает соседние stage-доки, но не product runtime код вне timezone-инициативы).
Вход: `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_2.md`
Обнови AGENT_EXECUTION_LOG.md и повтори tests + pnpm run ci.
```

---

## Stage 3 - EXEC

```text
Выполни Stage 3 по документу:
docs/TIMEZONE_UTC_NORMALIZATION/STAGE_3_INGEST_NORMALIZATION.md

Сделай:
1) Реализуй S3.T01-S3.T08.
2) Нормализуй recordAt/dateTimeEnd на входе connector.
3) Усиль SQL через ::timestamptz.
4) Добавь тесты ingest и writePort.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 3 - AUDIT

```text
Проведи аудит Stage 3.

Проверь:
1) Наивная дата не проходит в БД как raw string.
2) recordAt в projection всегда ISO-Z.
3) SQL-cast защита ::timestamptz применена.
4) Для невалидного datetime работает Variant A: запись не теряется, создаются инцидент и Telegram-алерт.
5) Для fallback/невалидной timezone есть операционный сигнал (инцидент + Telegram-алерт), нет "тихого" fallback.
6) Тесты покрывают MSK и Samara сценарии.
7) CI evidence есть.

Формат:
- verdict: PASS | REWORK_REQUIRED
- findings with severity and fix path
- сохрани полный отчет в `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_3.md`
- добавь раздел `MANDATORY FIX INSTRUCTIONS` для Stage 3 FIX
```

## Stage 3 - FIX

```text
Исправь замечания Stage 3 AUDIT.
Без расширения scope.
Вход: `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_3.md`
Обнови AGENT_EXECUTION_LOG.md, повтори tests + pnpm run ci.
```

---

## Stage 4 - EXEC

```text
Выполни Stage 4 по документу:
docs/TIMEZONE_UTC_NORMALIZATION/STAGE_4_INTEGRATOR_DISPLAY_TIMEZONE_FROM_DB.md

Сделай:
1) Реализуй S4.T01-S4.T05.
2) Переведи integrator на DB-source display timezone.
3) Обнови callsites на async accessor.
4) Убери timezone env vars из основной runtime-схемы.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 4 - AUDIT

```text
Проведи аудит Stage 4.

Проверь:
1) Integrator читает app_display_timezone из system_settings (scope admin).
2) Нет расхождения источников timezone между webapp и integrator.
3) Env timezone vars удалены или корректно депрекейтнуты.
4) TTL cache/fallback работают корректно.
5) Fallback по display-timezone не "тихий": создаются инцидент и Telegram-алерт.
6) Есть evidence tests + ci.

Формат:
- verdict: PASS | REWORK_REQUIRED
- findings by severity + fix actions
- сохрани полный отчет в `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_4.md`
- добавь раздел `MANDATORY FIX INSTRUCTIONS` для Stage 4 FIX
```

## Stage 4 - FIX

```text
Исправь замечания Stage 4 AUDIT.
Только Stage 4 scope.
Вход: `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_4.md`
Обнови AGENT_EXECUTION_LOG.md и повтори проверки.
```

---

## Stage 5 - EXEC

```text
Выполни Stage 5 по документу:
docs/TIMEZONE_UTC_NORMALIZATION/STAGE_5_REMOVE_HARDCODED_OFFSETS.md

Сделай:
1) Реализуй S5.T01-S5.T04.
2) Убери +03:00/+03 из продуктового кода slot-потоков.
3) Протяни branch timezone в normalizer и M2M routes.
4) Добавь тесты Samara/Moscow.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 5 - AUDIT

```text
Проведи аудит Stage 5.

Проверь:
1) Нет активных хардкодов +03:00/+03 в slot runtime code.
2) Везде используется timezone филиала.
3) Fallback-поведение безопасно.
4) Тесты покрывают разные timezone.
5) CI evidence подтвержден.

Формат:
- verdict: PASS | REWORK_REQUIRED
- findings with severity and exact file references
- сохрани полный отчет в `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_5.md`
- добавь раздел `MANDATORY FIX INSTRUCTIONS` для Stage 5 FIX
```

## Stage 5 - FIX

```text
Исправь замечания Stage 5 AUDIT.
Только Stage 5 scope.
Вход: `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_5.md`
Обнови AGENT_EXECUTION_LOG.md и повтори checks.
```

---

## Stage 6 - EXEC

```text
Выполни Stage 6 по документу:
docs/TIMEZONE_UTC_NORMALIZATION/STAGE_6_BACKFILL_HISTORICAL_TIMES.md

Сделай:
1) Реализуй S6.T01-S6.T07.
2) Подготовь диагностику и критерии точечного backfill.
3) Проведи dry-run (BEGIN/ROLLBACK) с отчетом по строкам.
4) Подготовь безопасный apply-plan для maintenance window.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 6 - AUDIT

```text
Проведи аудит Stage 6.

Проверь:
1) Backfill не является слепым массовым сдвигом.
2) Критерии выборки целевых строк обоснованы.
3) Есть отдельный разбор кейсов `record_at IS NULL` (restored/unresolved).
4) Dry-run и post-check evidence задокументированы.
5) Backup перед apply учитывается.
6) CI evidence присутствует.

Формат:
- verdict: PASS | REWORK_REQUIRED
- findings by severity
- mandatory fixes
- сохрани полный отчет в `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_6.md`
- добавь раздел `MANDATORY FIX INSTRUCTIONS` для Stage 6 FIX
```

## Stage 6 - FIX

```text
Исправь замечания Stage 6 AUDIT.
Только Stage 6 scope.
Вход: `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_6.md`
Обнови AGENT_EXECUTION_LOG.md и повтори проверки.
```

---

## Stage 7 - EXEC

```text
Выполни Stage 7 по документу:
docs/TIMEZONE_UTC_NORMALIZATION/STAGE_7_DOWNSTREAM_CLEANUP.md

Сделай:
1) Реализуй S7.T01-S7.T06.
2) Переведи legacy parsing paths на normalizeToUtcInstant.
3) Удали deprecated timezone env usage.
4) Обнови архитектурную документацию.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 7 - AUDIT

```text
Проведи аудит Stage 7.

Проверь:
1) Legacy timezone helper'ы удалены/заменены по плану.
2) Deprecated env-переменные не участвуют в runtime.
3) grep-проверки по +03:00 и старым ключам подтверждены.
4) Документация обновлена.
5) CI evidence подтвержден.

Формат:
- verdict: PASS | REWORK_REQUIRED
- findings + fix path
- сохрани полный отчет в `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_7.md`
- добавь раздел `MANDATORY FIX INSTRUCTIONS` для Stage 7 FIX
```

## Stage 7 - FIX

```text
Исправь замечания Stage 7 AUDIT.
Только Stage 7 scope.
Вход: `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_7.md`
Обнови AGENT_EXECUTION_LOG.md, повтори tests + pnpm run ci.
```

---

## Stage 8 - EXEC

```text
Выполни Stage 8 по документу:
docs/TIMEZONE_UTC_NORMALIZATION/STAGE_8_CONTRACT_TESTS.md

Сделай:
1) Реализуй S8.T01-S8.T05.
2) Добавь e2e/contract тесты для Moscow и Samara.
3) Зафиксируй БД + projection + UI assertions, включая негативные сценарии.
4) Обнови AGENT_EXECUTION_LOG.md.
5) Прогони tests + pnpm run ci.
```

## Stage 8 - AUDIT

```text
Проведи аудит Stage 8.

Проверь:
1) Сквозные тесты покрывают все заявленные слои.
2) Ожидаемые значения UTC/local совпадают с планом.
3) Негативные кейсы (`invalid datetime`, `invalid timezone`) покрыты и подтверждают Variant A + алерты.
4) Нет flaky-поведения в тестах.
5) CI evidence подтвержден.

Формат:
- verdict: PASS | REWORK_REQUIRED
- findings by severity
- сохрани полный отчет в `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_8.md`
- добавь раздел `MANDATORY FIX INSTRUCTIONS` для Stage 8 FIX
```

## Stage 8 - FIX

```text
Исправь замечания Stage 8 AUDIT.
Только Stage 8 scope.
Вход: `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_8.md`
Обнови AGENT_EXECUTION_LOG.md и повтори проверки.
```

---

## GLOBAL AUDIT (после Stage 1-8)

```text
Проведи глобальный аудит инициативы TIMEZONE_UTC_NORMALIZATION.

Источники:
- docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_1_BRANCH_TIMEZONE_DB.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_2_NORMALIZE_TO_UTC_INSTANT.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_3_INGEST_NORMALIZATION.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_4_INTEGRATOR_DISPLAY_TIMEZONE_FROM_DB.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_5_REMOVE_HARDCODED_OFFSETS.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_6_BACKFILL_HISTORICAL_TIMES.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_7_DOWNSTREAM_CLEANUP.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_8_CONTRACT_TESTS.md
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md

Проверь:
1) Все stage-gates закрыты.
2) Нет наивных дат в критичных runtime paths.
3) Нет timezone-конфигурации интеграций в env (кроме допустимых bootstrap env).
4) Нет hardcoded +03:00 в продуктовой логике.
5) Контрактные тесты стабильны.
6) pnpm run ci green.

Формат:
- global_verdict: APPROVE | REWORK_REQUIRED
- findings: critical/major/minor
- remediation plan по каждому finding
- сохрани полный отчет в `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_GLOBAL.md`
- добавь раздел `MANDATORY FIX INSTRUCTIONS` для Global FIX
```

## GLOBAL FIX (если global audit = REWORK_REQUIRED)

```text
Исправь замечания GLOBAL AUDIT по TIMEZONE_UTC_NORMALIZATION.

Правила:
1) Исправляй только findings из `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_GLOBAL.md`.
2) Не добавляй новый функционал вне findings.
3) Обнови AGENT_EXECUTION_LOG.md.
4) Повтори tests + pnpm run ci.
5) Подготовь таблицу:
   finding -> fix -> evidence -> status

Формат итога:
- fixed findings
- changed files
- checks
- final_verdict: READY | STILL_REWORK_REQUIRED
```
