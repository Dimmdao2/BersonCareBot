# PROMPTS - PATIENT_HOME_CMS_WORKFLOW_INITIATIVE

Готовые copy-paste промпты для Composer.  
Маршрут: `START -> Phase 0 -> ... -> Phase 6`, в каждой фазе: `PLAN -> EXEC -> AUDIT -> FIX`.

## Global Rules (must follow)

- Идти строго по phase files `00..06` этой инициативы.
- Рабочая ветка: `patient-home-cms-workflow-initiative` (если нет — создать перед первым EXEC).
- После каждого EXEC запускать AUDIT.
- Следующую фазу не начинать, пока mandatory fixes текущей не закрыты.
- В каждом PLAN/EXEC/FIX/AUDIT обновлять `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`.
- Не исполнять промпты из `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE` в рамках этой инициативы.
- Не трогать patient visual shell/nav/card styling (`globals.css`, `AppShell`, `PatientHeader`, `PatientBottomNav`, `PatientTopNav`, `navigation.ts`, `button-variants.ts`, `patientHomeCardStyles.ts`), кроме user-approved conflict fix.
- Не хардкодить slug-и из `CONTENT_PLAN.md`.
- Не добавлять env vars.
- Все новые runtime DB-запросы - через Drizzle ORM.
- Не запускать full root CI после каждой фазы.
- Full CI запускать только:
  - перед push;
  - по прямому запросу пользователя;
  - в финальном release rehearsal (Phase 6).

---

## PROMPT 00 - START / SANITY CHECK

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.

Сделай sanity check перед началом:
1. Прочитай:
   - docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/README.md
   - docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/MASTER_PLAN.md
   - docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md
   - docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/00_AUDIT_UX_CONTRACT_PLAN.md
2. Подтверди, что phase files `00..06` существуют и будут источником работ.
3. Подтверди, что не будешь исполнять prompt-файлы других инициатив.
4. Проверь текущую ветку; если это не `patient-home-cms-workflow-initiative`, предложи создать/переключиться.
5. Назови следующую фазу (начинаем с Phase 0, если инициатива только стартует).

Ничего не редактируй.
```

---

# Phase 0 - `00_AUDIT_UX_CONTRACT_PLAN.md`

## PROMPT 01 - PLAN PHASE 0

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: PLAN.

Прочитай:
- docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/00_AUDIT_UX_CONTRACT_PLAN.md
- docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/MASTER_PLAN.md
- docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_9.md

Составь пошаговый план выполнения Phase 0, строго по чеклисту из phase file.
Верни:
1) какие документы создаешь,
2) что именно проверяешь в коде,
3) риски,
4) критерий готовности к EXEC.
```

## PROMPT 02 - EXEC PHASE 0

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: EXEC.

Реализуй только Phase 0 по `00_AUDIT_UX_CONTRACT_PLAN.md`.

Сделай:
- создай/обнови BLOCK_EDITOR_CONTRACT.md по required table;
- обнови LOG.md записью о Phase 0.

Запрещено:
- менять app-код;
- менять БД/миграции;
- расширять scope.

Проверки:
- self-review docs (без CI и без тестов).
```

## PROMPT 03 - AUDIT PHASE 0

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: AUDIT.

Проверь результат Phase 0 против чеклиста `00_AUDIT_UX_CONTRACT_PLAN.md`.

Создай:
- docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_0.md

Формат:
1. Verdict
2. Mandatory fixes
3. Minor notes
4. Checklist coverage
5. Readiness to Phase 1
```

## PROMPT 04 - FIX PHASE 0

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: FIX.

Исправь только mandatory fixes из AUDIT_PHASE_0.md.
Обнови LOG.md.
Не меняй app-код и БД.
```

---

# Phase 1 - `01_DIAGNOSTICS_LABELS_PLAN.md`

## PROMPT 05 - PLAN PHASE 1

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: PLAN.

Прочитай:
- docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/01_DIAGNOSTICS_LABELS_PLAN.md
- docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md
- docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_0.md
- docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md

Составь детальный план Phase 1:
- какие файлы меняешь;
- как закрываешь каждый пункт чеклиста;
- какие тесты обновляешь;
- как избежишь runtime изменений.
```

## PROMPT 06 - EXEC PHASE 1

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: EXEC.

Реализуй только Phase 1 по `01_DIAGNOSTICS_LABELS_PLAN.md`.
Обязательно закрыть phase checklist.

Проверки (phase-level):
- pnpm --dir apps/webapp exec vitest run <changed tests>
- pnpm --dir apps/webapp exec tsc --noEmit
- pnpm --dir apps/webapp lint

Не запускать full CI.
Обновить LOG.md.
```

## PROMPT 07 - AUDIT PHASE 1

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: AUDIT.

Проверь Phase 1 против `01_DIAGNOSTICS_LABELS_PLAN.md` checklist и acceptance.
Создай AUDIT_PHASE_1.md.
Отдельно проверь, что schema/runtime пациента не менялись.
```

## PROMPT 08 - FIX PHASE 1

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: FIX.

Исправь только mandatory fixes из AUDIT_PHASE_1.md.
Запусти только нужные targeted checks.
Обнови LOG.md.
```

---

# Phase 2 - `02_UNIFIED_BLOCK_EDITOR_PLAN.md`

## PROMPT 09 - PLAN PHASE 2

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: PLAN.

Прочитай phase file `02_UNIFIED_BLOCK_EDITOR_PLAN.md` и последние audit/log.
Сделай пошаговый implementation plan по каждому пункту чеклиста.
```

## PROMPT 10 - EXEC PHASE 2

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: EXEC.

Реализуй только Phase 2 по `02_UNIFIED_BLOCK_EDITOR_PLAN.md`.
Не выходи за scope.

Проверки:
- pnpm --dir apps/webapp exec vitest run <changed tests>
- pnpm --dir apps/webapp exec tsc --noEmit
- pnpm --dir apps/webapp lint

No full CI.
Обнови LOG.md.
```

## PROMPT 11 - AUDIT PHASE 2

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: AUDIT.

Проверь Phase 2 против phase checklist + acceptance.
Создай AUDIT_PHASE_2.md.
```

## PROMPT 12 - FIX PHASE 2

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: FIX.

Исправь mandatory fixes из AUDIT_PHASE_2.md.
Обнови LOG.md и запусти только необходимые targeted checks.
```

---

# Phase 3 - `03_INLINE_CREATE_SECTIONS_PLAN.md`

## PROMPT 13 - PLAN PHASE 3

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: PLAN.

Прочитай:
- 03_INLINE_CREATE_SECTIONS_PLAN.md
- актуальные actions/settings components
- media URL policy

Составь детальный план реализации action + inline form + tests по чеклисту.
```

## PROMPT 14 - EXEC PHASE 3

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: EXEC.

Реализуй только Phase 3 по phase file.
Соблюдай out-of-scope.

Проверки:
- pnpm --dir apps/webapp exec vitest run <changed tests>
- pnpm --dir apps/webapp exec tsc --noEmit
- pnpm --dir apps/webapp lint

No full CI.
Обнови LOG.md.
```

## PROMPT 15 - AUDIT PHASE 3

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: AUDIT.

Проверь Phase 3 против checklist/acceptance из 03 file.
Создай AUDIT_PHASE_3.md.
```

## PROMPT 16 - FIX PHASE 3

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: FIX.

Исправь только mandatory fixes из AUDIT_PHASE_3.md.
Обнови LOG.md.
```

---

# Phase 4 - `04_SAFE_SLUG_RENAME_PLAN.md`

## PROMPT 17 - PLAN PHASE 4

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: PLAN.

Прочитай:
- 04_SAFE_SLUG_RENAME_PLAN.md
- текущую schema/pgContentSections/SectionForm/actions

Составь подробный execution plan:
- migration;
- transactional rename;
- redirect;
- UI dialog;
- rollback docs;
- tests/checks.
```

## PROMPT 18 - EXEC PHASE 4

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: EXEC.

Реализуй только Phase 4 по phase file checklist.

Проверки:
- pnpm --dir apps/webapp exec vitest run <changed tests>
- pnpm --dir apps/webapp run db:verify-public-table-count
- pnpm --dir apps/webapp exec tsc --noEmit
- pnpm --dir apps/webapp lint

No full CI.
Обнови LOG.md и rollback docs.
```

## PROMPT 19 - AUDIT PHASE 4

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: AUDIT.

Проверь Phase 4 against checklist/acceptance.
Создай AUDIT_PHASE_4.md.
Отдельно проверь, что rename атомарно обновляет ссылки.
```

## PROMPT 20 - FIX PHASE 4

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: FIX.

Исправь только mandatory fixes из AUDIT_PHASE_4.md.
Обнови LOG.md.
```

---

# Phase 5 - `05_CREATE_RETURN_FLOWS_PLAN.md`

## PROMPT 21 - PLAN PHASE 5

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: PLAN.

Прочитай phase file 05 и актуальный block editor.
Предложи безопасный вариант реализации (inline draft vs returnTo) по каждому target type.
```

## PROMPT 22 - EXEC PHASE 5

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: EXEC.

Реализуй только Phase 5 по checklist.
Не менять course model и не добавлять gating/billing.

Проверки:
- pnpm --dir apps/webapp exec vitest run <changed tests>
- pnpm --dir apps/webapp exec tsc --noEmit
- pnpm --dir apps/webapp lint

No full CI.
Обнови LOG.md.
```

## PROMPT 23 - AUDIT PHASE 5

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: AUDIT.

Проверь Phase 5 по checklist/acceptance.
Создай AUDIT_PHASE_5.md.
```

## PROMPT 24 - FIX PHASE 5

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: FIX.

Исправь mandatory fixes из AUDIT_PHASE_5.md.
Обнови LOG.md.
```

---

# Phase 6 - `06_QA_RELEASE_PLAN.md`

## PROMPT 25 - PLAN PHASE 6

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: PLAN.

Прочитай:
- 06_QA_RELEASE_PLAN.md
- LOG.md
- AUDIT_PHASE_0..5

Составь финальный QA/release checklist run plan.
```

## PROMPT 26 - EXEC PHASE 6

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: EXEC.

Реализуй Phase 6:
- закрыть docs checklist;
- пройти final phase-level checks;
- full CI запускать только если:
  - пользователь попросил;
  - перед push;
  - финальный release rehearsal.

Если full CI нужен:
- pnpm install --frozen-lockfile
- pnpm run ci

Обнови LOG.md.
```

## PROMPT 27 - AUDIT PHASE 6

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: AUDIT.

Проверь финальную готовность по 06 checklist.
Создай AUDIT_PHASE_6.md.
```

## PROMPT 28 - FIX PHASE 6

```text
Работаем в инициативе PATIENT_HOME_CMS_WORKFLOW_INITIATIVE.
Режим: FIX.

Исправь mandatory fixes из AUDIT_PHASE_6.md.
Без новых фич.
Обнови LOG.md.
```

