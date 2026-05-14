# PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE — prompts copy-paste

Контекст инициативы:

- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_PLAN.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_A.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_B.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_C.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_D.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/LOG.md`
- `docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`

Файлы аудитов (создаются по ходу):

- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_A.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_B.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_C.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_D.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_GLOBAL.md`
- `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_PREPUSH.md` (опционально)

---

## Общие правила для всех запусков

1. Порядок этапов строго линейный: `A -> B -> C -> D`.
2. Для каждого этапа обязательный цикл: `EXEC -> AUDIT -> FIX -> COMMIT`.
3. Перед любым запуском читать `STAGE_PLAN.md` и файл этапа; писать в `LOG.md`: `read-rules`, `scope`, `checks`.
4. Не выходить за scope текущего этапа.
5. Аудиты обязательно включают `MANDATORY FIX INSTRUCTIONS` с severity: `critical` / `major` / `minor`.
6. После каждого этапа делать только commit. Полный `pnpm run ci` после этапов **не запускать**.
7. Полный CI запускать один раз в конце: в блоке `PREPUSH`.
8. Для `GLOBAL AUDIT` сначала анализ диффа и stage-аудитов; не начинать с CI.

---

## A — EXEC (модель: gpt-5.3-codex)

```text
Выполни stage A инициативы PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE.

ВАЖНО: started_at уже реализован в кодовой базе. Этап A — это верификация, не написание с нуля.
Pre-flight таблица в STAGE_A.md. Смотри раздел «Pre-flight: что уже сделано».

Вход:
- docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_A.md
- docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_PLAN.md
- docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md (п. 1.0)

Сделай:
1) Пройди gate из STAGE_A.md (read-rules + запись в LOG).
2) Выполни A1..A5 из STAGE_A.md: проверь существующую реализацию, закрой пробелы если есть.
3) Выполни целевые проверки этапа A (в т.ч. contract test).
4) Обнови LOG.md: pre-flight результат, пробелы (если были), статус.
```

## A — AUDIT

```text
Проведи аудит stage A.

Проверь:
1) started_at additive и корректно в schema (treatmentProgramInstances.ts, l.81) и migration 0043.
2) started_at проходит через types/repos/read-model консистентно.
3) Patch в pgTreatmentProgramInstance — idempotent (не затирает уже установленное значение).
4) inMemoryTreatmentProgramInstance имеет аналогичную логику.
5) Contract test pgTreatmentProgramInstance.startedAt.contract.test.ts зелёный и покрывает map + patch семантику.
6) progress-service.ts не затронут (логика живёт в репо).

Сохрани: docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_A.md
Добавь MANDATORY FIX INSTRUCTIONS (critical/major/minor).
```

## A — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_A.md.

1) Закрой critical и major.
2) Minor: исправь или оформи defer с обоснованием.
3) Повтори целевые проверки этапа A.
4) Обнови LOG.md.
```

## A — COMMIT

```text
Выполни commit только изменений этапа A после закрытого FIX.

Ограничения:
- Не запускать полный pnpm run ci.
- Только commit этапа A.
- Обнови LOG.md записью "Stage A closed + commit".
```

---

## B — EXEC (модель: claude-4.6-sonnet-medium-thinking; допустим composer-2)

```text
Выполни stage B инициативы PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE.

Вход:
- docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_B.md
- docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_PLAN.md
- docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md (п. 1.1a)

Сделай:
1) Пройди gate из STAGE_B.md (read-rules + запись в LOG; подтвердить закрытие A).
2) Реализуй только B1..B8 из STAGE_B.md.
3) Выполни целевые проверки этапа B.
4) Обнови LOG.md.
```

## B — AUDIT

```text
Проведи аудит stage B.

Проверь:
1) Detail соответствует STAGE_B.md и ROADMAP_2 §1.1a.
2) Этап 0 отделён от текущего этапа.
3) Архив этапов под <details> и скрыт по умолчанию.
4) Нет "чек-листа на сегодня" и процентной аналитики.
5) Дата контроля считается от started_at + expected_duration_days.
6) PatientTreatmentProgramDetailClient.test.tsx зелёный.
7) [instanceId]/page.nudgeResilience.test.tsx и page.templateDescription.test.tsx зелёные.

Сохрани: docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_B.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## B — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_B.md.

1) Закрой critical и major.
2) Minor: исправь или defer с обоснованием.
3) Повтори целевые проверки этапа B.
4) Обнови LOG.md.
```

## B — COMMIT

```text
Выполни commit только изменений этапа B после закрытого FIX.

Ограничения:
- Не запускать полный pnpm run ci.
- Только commit этапа B.
- Обнови LOG.md записью "Stage B closed + commit".
```

---

## C — EXEC (модель: claude-4.6-sonnet-medium-thinking)

```text
Выполни stage C инициативы PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE.

Вход:
- docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_C.md
- docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_PLAN.md
- docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md (п. 1.1b)

Сделай:
1) Пройди gate из STAGE_C.md (read-rules + запись в LOG; подтвердить закрытие B).
2) Реализуй только C1..C10 из STAGE_C.md.
3) Выполни целевые проверки этапа C.
4) Обнови LOG.md.
```

## C — AUDIT

```text
Проведи аудит stage C.

Проверь:
1) Hero/карточки/Collapsible соответствуют STAGE_C.md и ROADMAP_2 §1.1b.
2) Цвета секций — через существующие patientSurface*Class токены, нет inline hex.
3) На detail — точка входа "История тестирования" вместо длинного списка результатов.
4) Новый маршрут stages/[stageId] создан и рендерит PatientInstanceStageBody; back-link рабочий.
5) patientTreatmentProgramStage(instanceId, stageId) добавлен в paths.ts; все новые ссылки используют его.
6) PatientTreatmentProgramDetailClient.test.tsx зелёный (обновлён под новую структуру если нужно).
7) [instanceId]/page.nudgeResilience.test.tsx и page.templateDescription.test.tsx зелёные.
8) Нет DB/port изменений.

Сохрани: docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_C.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## C — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_C.md.

1) Закрой critical и major.
2) Minor: исправь или defer с обоснованием.
3) Повтори целевые проверки этапа C.
4) Обнови LOG.md.
```

## C — COMMIT

```text
Выполни commit только изменений этапа C после закрытого FIX.

Ограничения:
- Не запускать полный pnpm run ci.
- Только commit этапа C.
- Обнови LOG.md записью "Stage C closed + commit".
```

---

## D — EXEC (модель: claude-4.6-sonnet-medium-thinking; допустим composer-2)

```text
Выполни stage D инициативы PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE.

Вход:
- docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_D.md
- docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/STAGE_PLAN.md
- docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md (п. 1.1)

Сделай:
1) Пройди gate из STAGE_D.md (read-rules + запись в LOG; подтвердить закрытие C).
2) Реализуй только D1..D6 из STAGE_D.md.
3) Выполни целевые проверки этапа D.
4) Обнови LOG.md.
```

## D — AUDIT

```text
Проведи аудит stage D.

Проверь:
1) Список соответствует STAGE_D.md и ROADMAP_2 §1.1.
2) Список: при активной программе — серверный `redirect` на detail; иначе empty state + архив завершённых; hero в клиенте передаётся как `null` в этой ветке.
3) Архив завершённых программ под <details> и свёрнут по умолчанию.
4) Empty state корректен, ссылка на /messages есть, нет несогласованных CTA.
5) Нет процентной аналитики.
6) PatientTreatmentProgramsListClient.test.tsx зелёный.
7) page.nudgeResilience.test.tsx зелёный (список: без активной программы — empty state; с активной — redirect).

Сохрани: docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_D.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## D — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_STAGE_D.md.

1) Закрой critical и major.
2) Minor: исправь или defer с обоснованием.
3) Повтори целевые проверки этапа D.
4) Обнови LOG.md.
```

## D — COMMIT

```text
Выполни commit только изменений этапа D после закрытого FIX.

Ограничения:
- Не запускать полный pnpm run ci.
- Только commit этапа D.
- Обнови LOG.md записью "Stage D closed + commit".
```

---

## GLOBAL AUDIT

```text
Проведи global audit после закрытия A/B/C/D.

Жестко:
1) Не начинай с тестов/CI.
2) Сначала анализ диффа, stage-аудитов и LOG.

Проверь:
1) Каждый этап прошел полный цикл EXEC->AUDIT->FIX->COMMIT.
2) Порядок A->B->C->D соблюден.
3) MVP-инварианты сохранены (этап 0 отдельно, без процентов, контроль от started_at).
4) Scope не вышел за пределы инициативы.
5) Документация и LOG синхронизированы.

Сохрани: docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_GLOBAL.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## GLOBAL FIX

```text
Выполни global fix по docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/AUDIT_GLOBAL.md.

1) Закрой critical и major.
2) Minor: исправь или defer с обоснованием.
3) Повтори только целевые проверки по затронутым зонам.
4) Обнови LOG.md.
```

## PREPUSH

```text
Выполни prepush-проход после закрытого global fix.

Сделай:
1) Проверь, что нет открытых critical/major.
2) Запусти pre-push барьер:
   - pnpm install --frozen-lockfile
   - pnpm run ci
3) Если CI упал: исправь и повтори барьер до зеленого статуса.
4) Зафиксируй результат в LOG.md (или AUDIT_PREPUSH.md).
```

## PUSH

```text
Выполни push после успешного PREPUSH.

Сделай:
1) Убедись, что рабочее дерево чистое после финального commit.
2) Выполни git push в текущую ветку.
3) Добавь в LOG.md короткую запись о факте push.
```
