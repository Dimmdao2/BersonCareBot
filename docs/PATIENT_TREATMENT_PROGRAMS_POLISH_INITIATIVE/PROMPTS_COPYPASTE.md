# PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE — Composer prompts (copy-paste)

Контекст инициативы:

- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md`
- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_PLAN.md`
- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_A.md`
- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_B.md`
- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_C.md`
- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/LOG.md`
- `docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`

Файлы аудитов (создаются по мере прохождения):

- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_STAGE_A.md`
- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_STAGE_B.md`
- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_STAGE_C.md`
- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_GLOBAL.md`
- `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_PREPUSH_POSTFIX.md`

---

## Общие правила для всех запусков

1. Порядок этапов строго линейный: `A -> B -> C`.
2. Цикл каждого этапа: `EXEC -> AUDIT -> FIX`. Следующий этап только после закрытого `FIX`.
3. Перед любым EXEC/AUDIT/FIX сначала читать rules из `STAGE_PLAN.md` и писать в `LOG.md` секции: `read-rules`, `scope`, `checks`.
4. Не выходить за scope текущего этапа (границы в `STAGE_A.md`, `STAGE_B.md`, `STAGE_C.md`).
5. Для `audit-global` (и варианта написания `adit-global`) запрещено начинать с тестов/CI: сначала анализ диффа, scope и уже выполненных проверок.
6. Между этапами использовать целевые проверки по `.cursor/rules/test-execution-policy.md`; не запускать полный `pnpm run ci` после каждого микрошага.
7. Перед финальным pre-push применять барьер из `.cursor/rules/pre-push-ci.mdc`:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

8. Каждый аудит должен содержать `MANDATORY FIX INSTRUCTIONS` с severity: `critical` / `major` / `minor`.
9. После каждого EXEC/FIX обновлять `LOG.md`.
10. На этой итерации конвейер заканчивается на `PREPUSH POSTFIX AUDIT` (без `push` шага).

---

## A — EXEC

```text
Выполни stage A инициативы PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE.

Вход:
- docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_A.md
- docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_PLAN.md
- docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md (пункты 1.0/1.1a/1.1)

Сделай:
1) Пройди gate из STAGE_A.md (read-rules + запись в LOG).
2) Реализуй только этап A: started_at data-enabler (schema/migration/backfill/types/repos/progress-service/tests).
3) Выполни целевые проверки этапа A (из STAGE_A.md).
4) Обнови LOG.md: что сделано, проверки, ограничения, out-of-scope.
```

## A — AUDIT

```text
Проведи аудит stage A.

Проверь:
1) started_at добавлен корректно и additive.
2) Миграция и backfill-эвристика описаны и воспроизводимы.
3) started_at проходит через type/repo/read-model.
4) available->in_progress выставляет started_at только при NULL.
5) Целевые проверки этапа A реально прогнаны.

Сохрани: docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_STAGE_A.md
Добавь MANDATORY FIX INSTRUCTIONS (critical/major/minor).
```

## A — FIX

```text
Выполни FIX по docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_STAGE_A.md.

1) Закрой critical и major.
2) Minor: исправь или оформи обоснованный defer в AUDIT_STAGE_A.md.
3) Повтори целевые проверки этапа A.
4) Обнови LOG.md.
```

---

## B — EXEC

```text
Выполни stage B инициативы PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE.

Вход:
- docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_B.md
- docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_PLAN.md
- docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md (п. 1.1a)

Сделай:
1) Пройди gate из STAGE_B.md (read-rules + запись в LOG; подтвердить закрытие A).
2) Реализуй только этап B: detail [instanceId], этап 0 отдельно, архив в details, "План обновлён", контрольная дата от started_at, без процентов.
3) Выполни целевые проверки этапа B.
4) Обнови LOG.md.
```

## B — AUDIT

```text
Проведи аудит stage B.

Проверь:
1) Detail соответствует STAGE_B.md и ROADMAP_2 §1.1a.
2) Этап 0 отделен от текущего этапа.
3) Архив этапов под details и закрыт по умолчанию.
4) "Чек-лист на сегодня" отсутствует на detail.
5) Нет процентной аналитики; дата контроля считается от started_at.

Сохрани: docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_STAGE_B.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## B — FIX

```text
Выполни FIX по docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_STAGE_B.md.

1) Закрой critical и major.
2) Minor: исправь или defer с обоснованием.
3) Повтори целевые проверки этапа B.
4) Обнови LOG.md.
```

---

## C — EXEC

```text
Выполни stage C инициативы PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE.

Вход:
- docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_C.md
- docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_PLAN.md
- docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md (п. 1.1)

Сделай:
1) Пройди gate из STAGE_C.md (read-rules + запись в LOG; подтвердить закрытие B).
2) Реализуй только этап C: hero активной программы + архив + empty state, без процентов.
3) Выполни целевые проверки этапа C.
4) Обнови LOG.md.
```

## C — AUDIT

```text
Проведи аудит stage C.

Проверь:
1) Список соответствует STAGE_C.md и ROADMAP_2 §1.1.
2) Hero активной программы корректен (stage title + CTA + plan updated).
3) Архив завершенных программ под details.
4) Empty state корректен при отсутствии активной программы.
5) Нет процентной аналитики.

Сохрани: docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_STAGE_C.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## C — FIX

```text
Выполни FIX по docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_STAGE_C.md.

1) Закрой critical и major.
2) Minor: исправь или defer с обоснованием.
3) Повтори целевые проверки этапа C.
4) Обнови LOG.md.
```

---

## GLOBAL AUDIT (alias: adit-global)

```text
Проведи global audit всей мини-инициативы после закрытия A/B/C.

Жестко:
1) Не начинай с тестов/CI.
2) Сначала анализ диффа, scope, уже выполненных проверок и stage-audits.

Проверь:
1) Все этапы прошли полный цикл EXEC->AUDIT->FIX.
2) Порядок A->B->C соблюден.
3) Решения MVP-инвариантов сохранены (этап 0 отдельно, без процентов, контроль от started_at, план обновлен).
4) Scope не вышел за пределы инициативы.
5) LOG и docs синхронизированы.
6) Выданы MANDATORY FIX INSTRUCTIONS по severity.

Сохрани: docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_GLOBAL.md
```

## GLOBAL FIX

```text
Выполни global fix по docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_GLOBAL.md.

1) Закрой critical и major.
2) Minor: исправь или оформи defer с обоснованием.
3) Повтори целевые проверки только по затронутым зонам.
4) Обнови LOG.md итоговой записью по global fix.
```

---

## PREPUSH POSTFIX AUDIT

```text
Выполни финальный prepush postfix audit (без push).

Сделай:
1) Проверь, что закрыты stage fixes и global fix (нет открытых critical/major).
2) Проверь git status и отсутствие несвязанных изменений для этой инициативы.
3) Запусти pre-push барьер:
   - pnpm install --frozen-lockfile
   - pnpm run ci
4) Если CI упал: исправь причины и повтори барьер до зеленого статуса.
5) Подготовь краткий итог: что проверено, какие риски/defer остались.

Сохрани: docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_PREPUSH_POSTFIX.md
```
