# STAGE_PLAN — PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE

Индекс этапов и обязательного конвейера исполнения для страницы программы лечения.

## Порядок этапов

| Код | ROADMAP | Детальный файл |
|-----|---------|----------------|
| **A** | §1.0 | [`STAGE_A.md`](STAGE_A.md) |
| **B** | §1.1a | [`STAGE_B.md`](STAGE_B.md) |
| **C** | §1.1b | [`STAGE_C.md`](STAGE_C.md) |
| **D** | §1.1 | [`STAGE_D.md`](STAGE_D.md) |

## Обязательный pipeline

Для каждого этапа строго:

1. `EXEC`
2. `AUDIT`
3. `FIX`
4. `COMMIT`

Следующий этап разрешен только после пункта 4 предыдущего этапа.

## Правило по CI и пушу

- Между этапами: только целевые проверки из файла этапа (узкие lint/typecheck/tests).
- После каждого этапа: **только commit**, без полного `pnpm run ci`.
- Полный CI выполнять один раз в конце всей инициативы (pre-push барьер).
- Push выполнять только после успешного финального pre-push барьера.

## Перед стартом любого EXEC/AUDIT/FIX

1. Прочитать соответствующий подпункт в [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md).
2. Прочитать rules, релевантные этапу (`patient-ui-shared-primitives`, `clean-architecture-module-isolation`, при необходимости `test-execution-policy`/`pre-push-ci`).
3. Зафиксировать в [`LOG.md`](LOG.md): `read-rules + scope`.

## Финал всей инициативы

После закрытия A/B/C/D:

1. `GLOBAL AUDIT`
2. `GLOBAL FIX`
3. `PREPUSH` (`pnpm install --frozen-lockfile && pnpm run ci`)
4. `PUSH`

Промпты для этого цикла: [`PROMPTS_COPYPASTE.md`](PROMPTS_COPYPASTE.md).
