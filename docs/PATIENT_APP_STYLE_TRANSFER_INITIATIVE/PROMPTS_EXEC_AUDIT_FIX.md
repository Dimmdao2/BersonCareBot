# PROMPTS — Patient App Style Transfer

Copy-paste prompts for Composer.

## Global Rules

- Work only in `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`.
- Default model: Composer 2.
- This is **style transfer only**, not content redesign.
- Do not change copy, content, page structure, ordering, tabs, routes, business logic, API, DB, env, integrations, doctor/admin UI.
- After every EXEC run AUDIT.
- Do not start next phase until audit says `No mandatory fixes` or FIX closes them.
- Every EXEC/FIX updates `LOG.md`.
- Every AUDIT creates `AUDIT_PHASE_N.md`.
- No root `pnpm run ci` unless user asks or before push.

---

## PROMPT 00 — START / SANITY CHECK

```text
Работаем в инициативе PATIENT_APP_STYLE_TRANSFER_INITIATIVE.

Режим: START / sanity check. Ничего не редактируй.

Прочитай:
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/README.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/MASTER_PLAN.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/CHECKLISTS.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/LOG.md

Сделай:
1. Проверь текущую git-ветку. Для EXEC/FIX нужна `patient-app-style-transfer-initiative`.
2. Определи следующую фазу по LOG.md и audit-файлам.
3. Подтверди ключевое ограничение: это style-only перенос, без изменения содержания страниц.
4. Назови, какие phase files надо читать дальше.

Верни:
- ветку;
- следующую фазу;
- открытые mandatory fixes, если есть;
- риски scope creep.

Не запускай full CI.
```

---

# Phase 0 — `00_INVENTORY_PLAN.md`

## PROMPT 01 — EXEC PHASE 0 INVENTORY

```text
Работаем в инициативе PATIENT_APP_STYLE_TRANSFER_INITIATIVE.
Режим: EXEC Phase 0.

Это readonly inventory. App-код не менять.

Прочитай:
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/README.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/MASTER_PLAN.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/CHECKLISTS.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/00_INVENTORY_PLAN.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/LOG.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md

Выполни Phase 0:
- составь карту patient route groups;
- найди старые visual patterns (`bg-card`, `rounded-xl/2xl`, `shadow-sm`, `Card`, `Button`, `buttonVariants`, `Badge`, `text-muted-foreground`);
- отдели style debt от product/content debt;
- определи, какие home styles можно извлечь как primitives, а какие нельзя трогать;
- составь file/test scope для фаз 1-5.

Создай:
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/PLAN_INVENTORY.md

Обнови:
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/LOG.md

Запрещено:
- менять app-код;
- менять контент/копирайт/структуру страниц;
- запускать full CI.

Верни GO/NO-GO для Phase 1.
```

## PROMPT 02 — AUDIT PHASE 0

```text
Работаем в инициативе PATIENT_APP_STYLE_TRANSFER_INITIATIVE.
Режим: AUDIT Phase 0. Ничего не редактируй, кроме создания audit-документа.

Прочитай:
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/AUDIT_TEMPLATE.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/00_INVENTORY_PLAN.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/PLAN_INVENTORY.md
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/LOG.md

Проверь:
- inventory grounded in real files;
- style debt отделён от product/content debt;
- Phase 1 scope точный;
- нет плана менять содержание страниц;
- проверки не избыточны.

Создай:
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/AUDIT_PHASE_0.md

Используй структуру AUDIT_TEMPLATE.md.
Не запускай full CI.
```

## PROMPT 03 — FIX PHASE 0

```text
Работаем в инициативе PATIENT_APP_STYLE_TRANSFER_INITIATIVE.
Режим: FIX Phase 0.

Исправь только mandatory fixes из:
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/AUDIT_PHASE_0.md

Обычно это docs-only.

Обнови:
- PLAN_INVENTORY.md, если нужно;
- LOG.md.

Не меняй app-код.
Не запускай full CI.
```

---

# Phase 1 — `01_PRIMITIVES_PLAN.md`

## PROMPT 04 — EXEC PHASE 1 PRIMITIVES

```text
Работаем в инициативе PATIENT_APP_STYLE_TRANSFER_INITIATIVE.
Режим: EXEC Phase 1.

Подтверди ветку `patient-app-style-transfer-initiative`.

Прочитай:
- README.md
- MASTER_PLAN.md
- CHECKLISTS.md
- 01_PRIMITIVES_PLAN.md
- PLAN_INVENTORY.md
- LOG.md

Реализуй только shared patient style primitives:
- patient-scoped class exports/components;
- no page restyling except compile-compatible aliasing;
- no global Button/Card redesign;
- no content/copy/flow changes.

Обнови LOG.md.

Проверки:
- targeted eslint on changed files;
- typecheck if TS exports changed;
- targeted tests if components/tests added.

Не запускай full CI.
```

## PROMPT 05 — AUDIT PHASE 1

```text
Режим: AUDIT Phase 1 для PATIENT_APP_STYLE_TRANSFER_INITIATIVE.

Прочитай:
- AUDIT_TEMPLATE.md
- 01_PRIMITIVES_PLAN.md
- PLAN_INVENTORY.md
- LOG.md

Проверь:
- primitives patient-scoped;
- home-specific geometry not generalized;
- existing exports compatible;
- no page/content/business changes;
- no doctor/admin leak;
- checks appropriate.

Создай AUDIT_PHASE_1.md по AUDIT_TEMPLATE.md.
Не запускай full CI.
```

## PROMPT 06 — FIX PHASE 1

```text
Режим: FIX Phase 1.

Исправь только mandatory fixes из AUDIT_PHASE_1.md.
Не расширяй scope и не начинай page style pass.
Обнови LOG.md.
Запусти только targeted checks для изменённых файлов.
```

---

# Phase 2 — `02_STATIC_PAGES_STYLE_PLAN.md`

## PROMPT 07 — EXEC PHASE 2 STATIC STYLE PASS

```text
Режим: EXEC Phase 2 для PATIENT_APP_STYLE_TRANSFER_INITIATIVE.

Прочитай:
- 02_STATIC_PAGES_STYLE_PLAN.md
- CHECKLISTS.md
- AUDIT_PHASE_1.md
- PLAN_INVENTORY.md
- LOG.md

Сделай style-only pass для static/read-only patient pages.

Можно:
- заменить визуальные классы карточек/CTA/text на patient primitives;
- сохранить текущий DOM смысл и ссылки.

Нельзя:
- менять тексты;
- менять порядок/структуру страниц;
- менять data fetching;
- менять course/treatment/CMS логику.

Обнови LOG.md.
Запусти targeted checks по изменённым файлам.
```

## PROMPT 08 — AUDIT PHASE 2

```text
Режим: AUDIT Phase 2.

Проверь результат Phase 2 против:
- AUDIT_TEMPLATE.md
- 02_STATIC_PAGES_STYLE_PLAN.md
- CHECKLISTS.md
- LOG.md

Особо проверь:
- no content/copy changes;
- no route/link/data changes;
- patient primitives reused;
- product gaps logged, not solved.

Создай AUDIT_PHASE_2.md.
```

## PROMPT 09 — FIX PHASE 2

```text
Режим: FIX Phase 2.

Исправь только mandatory fixes из AUDIT_PHASE_2.md.
Не делай additional polish.
Обнови LOG.md.
Запусти targeted checks.
```

---

# Phase 3 — `03_INTERACTIVE_PAGES_STYLE_PLAN.md`

## PROMPT 10 — EXEC PHASE 3 INTERACTIVE STYLE PASS

```text
Режим: EXEC Phase 3 для PATIENT_APP_STYLE_TRANSFER_INITIATIVE.

Прочитай:
- 03_INTERACTIVE_PAGES_STYLE_PLAN.md
- CHECKLISTS.md
- AUDIT_PHASE_2.md
- PLAN_INVENTORY.md
- LOG.md

Сделай style-only pass для interactive patient pages: profile, notifications, reminders, diary, utility pages.

Сохрани:
- copy;
- form fields;
- handlers;
- server actions;
- tab keys/routes;
- validation behavior.

Обнови LOG.md.
Запусти targeted checks.
```

## PROMPT 11 — AUDIT PHASE 3

```text
Режим: AUDIT Phase 3.

Проверь Phase 3 по AUDIT_TEMPLATE.md и 03_INTERACTIVE_PAGES_STYLE_PLAN.md.

Особо проверь:
- forms/actions unchanged;
- reminders/diary behavior unchanged;
- tab semantics preserved;
- no product decisions invented.

Создай AUDIT_PHASE_3.md.
```

## PROMPT 12 — FIX PHASE 3

```text
Режим: FIX Phase 3.

Исправь только mandatory fixes из AUDIT_PHASE_3.md.
Обнови LOG.md.
Запусти targeted checks.
```

---

# Phase 4 — `04_BOOKING_STYLE_PLAN.md`

## PROMPT 13 — EXEC PHASE 4 BOOKING STYLE PASS

```text
Режим: EXEC Phase 4 для PATIENT_APP_STYLE_TRANSFER_INITIATIVE.

Прочитай:
- 04_BOOKING_STYLE_PLAN.md
- CHECKLISTS.md
- AUDIT_PHASE_3.md
- PLAN_INVENTORY.md
- LOG.md

Сделай style-only pass для booking wizard/cabinet.

Сохрани:
- booking steps;
- route query params;
- handlers;
- booking/Rubitime API behavior;
- visible labels.

Обнови LOG.md.
Запусти targeted booking/cabinet checks.
```

## PROMPT 14 — AUDIT PHASE 4

```text
Режим: AUDIT Phase 4.

Проверь Phase 4 по AUDIT_TEMPLATE.md и 04_BOOKING_STYLE_PLAN.md.

Особо проверь:
- no booking flow change;
- no query param/link change;
- no Rubitime/API behavior change;
- patient style primitives used.

Создай AUDIT_PHASE_4.md.
```

## PROMPT 15 — FIX PHASE 4

```text
Режим: FIX Phase 4.

Исправь только mandatory fixes из AUDIT_PHASE_4.md.
Обнови LOG.md.
Запусти targeted checks.
```

---

# Phase 5 — `05_QA_DOCS_PLAN.md`

## PROMPT 16 — EXEC PHASE 5 QA/DOCS

```text
Режим: EXEC Phase 5 для PATIENT_APP_STYLE_TRANSFER_INITIATIVE.

Прочитай:
- 05_QA_DOCS_PLAN.md
- CHECKLISTS.md
- LOG.md
- all AUDIT_PHASE_*.md

Сделай docs/QA prep:
- убедись, что mandatory fixes закрыты;
- обнови LOG.md;
- обнови docs/README.md active initiative link;
- зафиксируй deferred product/content gaps;
- подготовь состояние к global audit.

Не начинай новый page style pass.
Не запускай full CI без запроса.
```

## PROMPT 17 — AUDIT PHASE 5

```text
Режим: AUDIT Phase 5.

Проверь Phase 5 по AUDIT_TEMPLATE.md и 05_QA_DOCS_PLAN.md.
Создай AUDIT_PHASE_5.md.

Особо проверь:
- docs consistent;
- no broad redesign language remains;
- route matrix/deferred gaps documented;
- ready for GLOBAL AUDIT.
```

## PROMPT 18 — FIX PHASE 5

```text
Режим: FIX Phase 5.

Исправь только mandatory fixes из AUDIT_PHASE_5.md.
Обнови LOG.md.
Запусти только docs/targeted checks if needed.
```

---

# Global

## PROMPT 19 — GLOBAL AUDIT

```text
Работаем в инициативе PATIENT_APP_STYLE_TRANSFER_INITIATIVE.
Режим: GLOBAL AUDIT. Ничего не исправляй.

Прочитай:
- README.md
- MASTER_PLAN.md
- CHECKLISTS.md
- LOG.md
- AUDIT_TEMPLATE.md
- PLAN_INVENTORY.md
- all phase plans 00..05
- all AUDIT_PHASE_*.md

Проверь весь итог инициативы, а не только последний diff:
- style-only boundary kept;
- content/copy/page structure unchanged;
- no business/API/DB/env changes;
- no doctor/admin regression;
- patient primitives reused consistently;
- home-specific geometry not spread;
- tests/checks adequate;
- deferred product/content gaps documented.

Создай:
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/GLOBAL_AUDIT.md

Используй AUDIT_TEMPLATE.md, но verdict должен быть global.
Не запускай full CI, если пользователь прямо не попросил.
```

## PROMPT 20 — GLOBAL FIX

```text
Работаем в инициативе PATIENT_APP_STYLE_TRANSFER_INITIATIVE.
Режим: GLOBAL FIX.

Исправь только mandatory fixes из:
- docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/GLOBAL_AUDIT.md

Правила:
- no polish beyond mandatory;
- no content/copy/product changes;
- no business/API/DB/env changes;
- update LOG.md;
- run only targeted checks for changed files.

В конце перечисли каждый mandatory item и как он закрыт.
```
