# WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE — PROMPTS_COPYPASTE

Контекст:

- `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/README.md`
- `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_PLAN.md`
- `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_A.md`
- `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_B.md`
- `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_C.md`
- `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_D.md`
- `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/LOG.md`

---

## A — EXEC

**AGENT: Composer (`composer-2`)**

```text
Выполни STAGE_A инициативы WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE.

Обязательные входы:
- docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_PLAN.md
- docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_A.md
- docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/LOG.md

Сделай:
1) Полную инвентаризацию apps/webapp/migrations/*.sql и apps/webapp/db/drizzle-migrations/*.sql.
2) Таблицу соответствия: legacy -> drizzle equivalent / missing / risk.
3) Отдельный список runtime-critical объектов (DDL, журналы миграций, ops/backfill — см. STAGE_A.md и таблицу в LOG).
4) Запиши результат в LOG.md.

Классификация:
- runtime-critical: DDL используется текущим runtime-кодом webapp, production scripts/backfill/reconcile flow, media-worker public schema access или deploy/ops checks.
- coverage: exact / logical / partial / missing / unknown.
- все partial/missing/unknown вынеси в risk list для Codex.
- ledger-риск (webapp_schema_migrations vs Drizzle metadata) только зафиксируй, не решай.

Ограничение:
- Ничего не менять в коде/скриптах, только анализ и документация этапа.
```

## A — AUDIT

**AGENT: Codex (`gpt-5.3-codex`)**

```text
Проведи аудит результатов STAGE_A.

Проверь:
1) Полнота инвентаризации legacy/drizzle.
2) Корректность списка runtime-critical объектов (DDL, журналы миграций, ops/backfill — см. LOG).
3) Наличие actionable рисков для Stage B.

Запиши вывод в LOG.md блоком "Stage A audit" с severity: critical / major / minor / unknown.
```

---

## B — EXEC

**AGENT: Codex (`gpt-5.3-codex`)**

```text
Выполни STAGE_B инициативы WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE.

Входы:
- docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_PLAN.md
- docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_B.md
- результаты Stage A в LOG.md

Сделай:
1) Закрой runtime-critical пробелы в Drizzle migration path.
2) Сохрани безопасную совместимость для уже мигрированных БД.
3) Прогони целевые миграционные проверки.
4) Обнови LOG.md.

Ограничение:
- Не выходить за scope инициативы.
```

## B — AUDIT

**AGENT: Composer (`composer-2`)**

```text
Проведи аудит STAGE_B.

Проверь:
1) Фактическое закрытие Stage B согласовано с LOG (узкий приём: приоритетные пробелы канонического пути, не «весь runtime-critical слой перенесён в Drizzle» без оговорок).
2) Нет рискованного повторного применения DDL для добавленных шагов.
3) LOG.md содержит прозрачные проверки и результаты.

Запиши findings в LOG.md блоком "Stage B audit" с severity: critical / major / minor / unknown.
Не правь code/deploy scripts; docs-правки допустимы только в scope.
```

---

## C — EXEC

**AGENT: Codex (`gpt-5.3-codex`)**

```text
Выполни STAGE_C инициативы WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE.

Входы:
- docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/STAGE_C.md
- deploy/host/deploy-prod.sh
- deploy/host/deploy-webapp-prod.sh
- deploy/HOST_DEPLOY_README.md

Сделай:
1) Усиль post-migrate schema checks для runtime-critical колонок.
2) Убедись, что guardrail останавливает deploy до рестарта сервиса.
3) Синхронизируй runbook.
4) Обнови LOG.md.
```

## C — AUDIT

**AGENT: Composer (`composer-2`)**

```text
Проведи аудит STAGE_C.

Проверь:
1) Guardrails покрывают критичные колонки.
2) Документация совпадает с фактическим deploy flow.
3) Нет регрессии операционных шагов.

Запиши findings в LOG.md блоком "Stage C audit" с severity: critical / major / minor / unknown.
Не правь deploy/code scripts; docs-правки допустимы только в scope.
```

---

## D — EXEC

**AGENT: Composer (`composer-2`)**

```text
Выполни STAGE_D инициативы WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE.

Сделай:
1) Найди и обнови упоминания migrate:legacy как регулярного deploy-шага.
2) Подготовь финальный global audit черновик в LOG.md.
3) Зафиксируй residual risks и что сознательно не делали.

Правила:
- discovery делай по всему репозиторию.
- правки делай только в docs/scope инициативы и явно разрешенных docs.
- не удаляй migrate:legacy из тестов, CI, deploy scripts или package scripts.
- все code/script refs вне scope запиши в LOG.md как residual refs for Codex.
- если runner еще существует, формулировка должна быть emergency/historical only, не regular production deploy step.
```

## D — FINAL AUDIT / CLOSE

**AGENT: Codex (`gpt-5.3-codex`)**

```text
Закрой инициативу WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE.

Сделай:
1) Проведи финальный global audit после Stage D.
2) Подтверди Definition of Done из STAGE_PLAN.md.
3) Обнови LOG.md финальной записью "Initiative closed" или списком оставшихся блокеров.
```
