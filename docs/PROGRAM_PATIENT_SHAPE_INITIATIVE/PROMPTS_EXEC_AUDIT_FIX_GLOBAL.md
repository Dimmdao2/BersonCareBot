# PROGRAM_PATIENT_SHAPE_INITIATIVE — Composer prompts (copy-paste)

Контекст инициативы:

- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A1_PLAN.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A2_PLAN.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A3_PLAN.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A4_PLAN.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A5_PLAN.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/LOG.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/LOG_TEMPLATE.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/EXECUTION_AUDIT_TEMPLATE.md`
- `docs/APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`

Общие правила для всех запусков:

1. Фазы строго последовательно: `A1 -> A2 -> A3 -> A4 -> A5`.
2. Цикл каждой фазы: `EXEC -> AUDIT -> FIX`. Следующая фаза только после закрытого `FIX`.
3. Работать только в `treatment-program`-контуре:
   - `apps/webapp/src/modules/treatment-program/**`
   - `apps/webapp/src/app/api/*/treatment-program-*/**`
   - `apps/webapp/src/app/app/patient/treatment-programs/**`
   - `apps/webapp/db/schema/treatmentProgram*.ts`
4. Не выходить в media/HLS-контур:
   - `apps/media-worker/**`
   - `apps/webapp/src/modules/media/**`
   - `apps/webapp/src/app/api/media/**`
   - `apps/webapp/src/app/app/patient/content/**`
   - `docs/VIDEO_HLS_DELIVERY/**`
5. Архитектурные правила обязательны: modules через ports/DI, route handlers тонкие, новые таблицы/запросы через Drizzle.
6. O1/O2/O3/O4 уже зафиксированы и не пересматриваются в рамках A1-A5:
   - O1: `objectives` = `TEXT` markdown;
   - O4: `is_actionable` только на `instance_stage_item`;
   - O2: LFK log в MVP на уровне комплекса;
   - O3: post-session note в `program_action_log.note`.
7. Не злоупотреблять full CI: на EXEC/FIX запускать только целевые проверки по затронутой области.
8. Полный pre-push барьер запускать только перед push:
   - `pnpm install --frozen-lockfile`
   - `pnpm run ci`
9. После каждого EXEC/FIX обновлять `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/LOG.md` по `LOG_TEMPLATE.md`.
10. Каждый AUDIT должен содержать `MANDATORY FIX INSTRUCTIONS` с severity: `critical/major/minor`.
11. При закрытии этапа создать stage audit по `EXECUTION_AUDIT_TEMPLATE.md`.
12. Не менять `.github/workflows/ci.yml` без явного отдельного решения команды.

Файлы аудитов:

- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A1.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A2.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A3.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A4.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A5.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_GLOBAL.md`
- `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_PREPUSH_POSTFIX.md`

---

## A1 — EXEC

```text
Выполни stage A1 инициативы PROGRAM_PATIENT_SHAPE_INITIATIVE.

Вход:
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A1_PLAN.md
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md
- docs/APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md

Сделай:
1) Добавь поля этапа (`goals`, `objectives`, `expected_duration_days`, `expected_duration_text`) в template+instance через Drizzle.
2) Проведи поля через treatment-program ports/service/repos/API/UI.
3) Сохрани решение O1: `objectives` только TEXT markdown.
4) Выполни целевые проверки A1 (lint/typecheck/tests по измененной области).
5) Обнови LOG.md.
```

## A1 — AUDIT

```text
Проведи аудит stage A1.

Проверь:
1) Миграции additive и backward-compatible.
2) Поля есть на template и instance stage.
3) Template->instance copy корректно переносит значения.
4) UI врача редактирует, UI пациента показывает только непустые значения.
5) Изменения не вышли за treatment-program контур.

Сохрани: docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A1.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## A1 — FIX

```text
Выполни FIX по docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A1.md.

Сделай:
1) Закрой все critical и major.
2) Для minor: исправь или зафиксируй обоснованный defer в AUDIT_STAGE_A1.md.
3) Повтори целевые проверки A1.
4) Подтверди отсутствие изменений в media/HLS контуре.
5) Обнови LOG.md.
```

---

## A2 — EXEC

```text
Выполни stage A2 инициативы PROGRAM_PATIENT_SHAPE_INITIATIVE.

Вход:
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A2_PLAN.md
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md

Сделай:
1) Добавь `is_actionable` и `status=active|disabled` на instance stage items через Drizzle.
2) Реализуй Stage 0 semantics (`sort_order=0`, always visible, вне FSM).
3) Реализуй disable/enable вместо hard delete в instance.
4) Зафиксируй O4: `is_actionable` только instance-level.
5) Выполни целевые проверки A2 и обнови LOG.md.
```

## A2 — AUDIT

```text
Проведи аудит stage A2.

Проверь:
1) `is_actionable` и `status` работают end-to-end.
2) Disabled items исключены из patient completion/read model.
3) Stage 0 всегда видим и не влияет на FSM.
4) Events `item_disabled/item_enabled` пишутся корректно.
5) Нет hard delete instance items.

Сохрани: docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A2.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## A2 — FIX

```text
Выполни FIX по docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A2.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки A2.
4) Подтверди, что scope не вышел в catalog/media/courses контур.
5) Обнови LOG.md.
```

---

## A3 — EXEC

```text
Выполни stage A3 инициативы PROGRAM_PATIENT_SHAPE_INITIATIVE.

Вход:
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A3_PLAN.md
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md

Сделай:
1) Добавь таблицы `tplStageGroups` и `instStageGroups` через Drizzle.
2) Добавь `group_id NULL` на stage items (template+instance).
3) Реализуй copy map template group -> instance group.
4) Реализуй doctor CRUD/reorder/move групп без drag-and-drop библиотек.
5) Реализуй patient grouped render в treatment-programs.
6) Выполни целевые проверки A3 и обнови LOG.md.
```

## A3 — AUDIT

```text
Проведи аудит stage A3.

Проверь:
1) Таблицы групп и `group_id` добавлены корректно.
2) Copy service сохраняет структуру групп и NULL-группы.
3) Удаление группы не удаляет items (перенос в `group_id=NULL`).
4) Patient render корректно обрабатывает grouped/ungrouped кейсы.
5) Нет новых DnD-зависимостей.

Сохрани: docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A3.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## A3 — FIX

```text
Выполни FIX по docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A3.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки A3.
4) Подтверди сохранение scope внутри treatment-program контура.
5) Обнови LOG.md.
```

---

## A4 — EXEC

```text
Выполни stage A4 инициативы PROGRAM_PATIENT_SHAPE_INITIATIVE.

Вход:
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A4_PLAN.md
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md

Сделай:
1) Добавь `program_action_log` через Drizzle и сервис записи/чтения действий.
2) Реализуй patient checklist и post-session form.
3) Зафиксируй O2/O3: LFK log complex-level; note в `program_action_log.note`.
4) Добавь doctor inbox «К проверке» в карточке пациента.
5) Не трогай media playback/`app/patient/content/**`.
6) Выполни целевые проверки A4 и обнови LOG.md.
```

## A4 — AUDIT

```text
Проведи аудит stage A4.

Проверь:
1) `program_action_log` записывает `done/viewed/note` по ожидаемой модели.
2) Checklist исключает disabled и persistent items.
3) Post-session сохраняет difficulty + optional note (в action_log).
4) Doctor inbox показывает pending tests (`decided_by IS NULL`) и скрывает решенные.
5) Нет выхода в media/HLS контур.

Сохрани: docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A4.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## A4 — FIX

```text
Выполни FIX по docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A4.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки A4.
4) Подтверди, что run-screen/чеклист остались в treatment-programs контуре.
5) Обнови LOG.md.
```

---

## A5 — EXEC

```text
Выполни stage A5 инициативы PROGRAM_PATIENT_SHAPE_INITIATIVE.

Вход:
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A5_PLAN.md
- docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md

Сделай:
1) Добавь `last_viewed_at` через Drizzle.
2) Выполни backfill `last_viewed_at = created_at` для старых items до включения UI-бейджа.
3) Реализуй mark-viewed idempotent mutation.
4) Реализуй бейджи «План обновлён» и «Новое» по правилам этапа.
5) Добавь нужный `revalidatePath/revalidateTag`.
6) Выполни целевые проверки A5 и обнови LOG.md.
```

## A5 — AUDIT

```text
Проведи аудит stage A5.

Проверь:
1) Backfill выполнен и старые items не помечаются как «Новое».
2) Mark-viewed идемпотентен и не нарушает доступ.
3) «План обновлён» корректно показывается/сбрасывается.
4) Бейджи не показываются для disabled items.
5) Нет регрессии patient today/program pages.

Сохрани: docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A5.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## A5 — FIX

```text
Выполни FIX по docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_STAGE_A5.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки A5.
4) Подтверди корректную cache revalidation.
5) Обнови LOG.md.
```

---

## GLOBAL AUDIT

```text
Проведи глобальный аудит всей инициативы PROGRAM_PATIENT_SHAPE после A1..A5.

Проверь:
1) Все этапы прошли цикл EXEC->AUDIT->FIX.
2) Реализация соответствует `PROGRAM_PATIENT_SHAPE_PLAN.md` и stage-планам.
3) O1/O2/O3/O4 реализованы строго в зафиксированном виде.
4) Scope удержан в treatment-program контуре; media/HLS не затронуты.
5) Stage 0, groups, action log, badges работают согласованно.
6) Документация и LOG синхронизированы.
7) Выданы MANDATORY FIX INSTRUCTIONS с severity.

Сохрани: docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_GLOBAL.md
```

## GLOBAL FIX

```text
Выполни global fix по docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_GLOBAL.md.

Сделай:
1) Закрой все critical и major.
2) Для minor: исправь или явно оформи defer с обоснованием.
3) Повтори целевые проверки по затронутым зонам.
4) Обнови LOG.md итоговой записью по global fix.
```

---

## PREPUSH POSTFIX AUDIT

```text
Выполни финальный prepush postfix audit перед push.

Сделай:
1) Проверь, что закрыты stage fixes и global fix (нет открытых critical/major).
2) Проверь `git status`; не включай несвязанные файлы в commit.
3) Запусти pre-push барьер на актуальном дереве:
   - pnpm install --frozen-lockfile
   - pnpm run ci
4) Если CI не прошел: исправь причины и повтори барьер.
5) Подготовь краткий отчет о рисках и deferred пунктах.

Сохрани: docs/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_PREPUSH_POSTFIX.md
```

