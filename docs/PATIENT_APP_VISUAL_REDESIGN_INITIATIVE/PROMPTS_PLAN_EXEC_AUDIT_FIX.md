# PROMPTS — Patient App Visual Redesign

Готовые copy-paste промпты для последовательного запуска агентов по инициативе `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE`.

## Правила использования

- Промпты идут строго сверху вниз.
- После каждого EXEC запускать AUDIT.
- Следующую фазу не начинать, пока AUDIT текущей фазы не сказал `NO MANDATORY FIXES` или FIX не закрыл обязательные замечания.
- **Все EXEC/FIX выполняются только в ветке `patient-app-visual-redesign-initiative`.** Не работать в `patient-home-redesign-initiative` — там завершённая инициатива.
- **Не исполнять PROMPT'ы из `docs/PATIENT_HOME_REDESIGN_INITIATIVE/PROMPTS_PLAN_EXEC_AUDIT_FIX.md` — закрытая инициатива (архив).**
- Коммитить только если пользователь явно попросил commit.
- Проверки запускать по `.cursor/rules/test-execution-policy.md`.
- Не запускать full root `pnpm run ci` после каждой фазы.
- Full CI нужен только перед push, при явной просьбе пользователя или при repo-level scope.
- Все EXEC/FIX обновляют `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`.
- Все AUDIT сначала анализируют diff/scope, потом решают, какие проверки нужны. Не начинать audit с CI.

## Модельная стратегия

По умолчанию — **Composer 2** на всех этапах, включая финальный audit.

Эскалация только при чётко обоснованной причине:

- **Codex 5.3** — только если Composer 2 на двух подряд попытках сломал nav/shell refactor (Phase 2) или сложный TS/React cleanup в Phase 5.
- **GPT 5.5** — только если два Composer 2 audit противоречат друг другу, или пользователь явно попросил независимую проверку.
- **Sonnet 4.6** — не используется по умолчанию.
- **Opus 4.7** — только по явной просьбе пользователя при unresolved high-risk contradictions.

Не тратить дорогие модели без явной причины.

---

## PROMPT 00 — START HERE (sanity check для любого следующего шага)

Этот промпт стоит выполнить один раз перед началом любой фазы, особенно если новая сессия / новая чат-вкладка. Он не редактирует код.

```text
Сессионный sanity check для инициативы PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Сделай:
1. Подтверди текущую git-ветку. Если это не `patient-app-visual-redesign-initiative` — переключись на неё (создай от актуальной ветки разработки, если её нет).
2. Не работай в ветке `patient-home-redesign-initiative` — там завершённая инициатива.
3. Прочитай:
   - docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md
   - docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md
   - docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md
4. Пройдись по списку plan-файлов (00–05) и определи, какая фаза следующая по статусу `LOG.md` / AUDIT_PHASE_*.md.
5. Подтверди, что docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/ существует. Если папка пуста — зафиксируй в LOG.md, что Phase 3/4 идут только по VISUAL_SYSTEM_SPEC.md.
6. Запрещено исполнять PROMPT'ы из docs/PATIENT_HOME_REDESIGN_INITIATIVE/PROMPTS_PLAN_EXEC_AUDIT_FIX.md и .cursor/plans/phase_3_patient_home_*.plan.md / phase_4.5_patient_home_*.plan.md — это архив.

Верни:
- текущую ветку;
- следующую фазу;
- список заметок из LOG.md, требующих внимания.

Не запускай full CI.
```

---

**Рекомендуемый агент:** Composer 2. Это readonly inventory и планирование, дорогая модель не нужна.

## PROMPT 01 — PLAN/INVENTORY PHASE 0

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: PLAN/INVENTORY. Ничего не редактируй в app-коде и не запускай миграции.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/00_INVENTORY_PLAN.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md полностью
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md
- .cursor/rules/clean-architecture-module-isolation.mdc
- .cursor/rules/000-critical-integration-config-in-db.mdc
- .cursor/rules/runtime-config-env-vs-db.mdc

Выполни Phase 0 из 00_INVENTORY_PLAN.md:
- проверь текущие файлы shell/navigation/home;
- подтверди текущие CSS variables и usages;
- подтверди bottom nav items и header behavior;
- подтверди список существующих тестов;
- определи high-risk файлы;
- уточни file/test scope для фаз 1–5.

Создай/обнови:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/PLAN_INVENTORY.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Верни:
1. GO/NO-GO для Phase 1.
2. Список файлов для Phase 1.
3. Список тестов для Phase 1.
4. Риски и где может понадобиться Codex 5.3/GPT 5.5.

Не запускай full CI.
```

---

**Рекомендуемый агент:** Composer 2. Audit readonly, дорогая модель не нужна. GPT 5.5 только если inventory противоречит реальному коду.

## PROMPT 02 — AUDIT PHASE 0

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: AUDIT. Ничего не редактируй.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/00_INVENTORY_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/PLAN_INVENTORY.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md

Проверь:
- inventory grounded in real files;
- no app code changed;
- Phase 1 scope is precise enough for Composer 2;
- tests/checks are not overbroad;
- no suggestion to run full CI after every step;
- no slug hardcode plan;
- no doctor/admin redesign scope leak.

Создай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_0.md

Структура:
1. Verdict: PASS / PASS WITH MINOR NOTES / FAIL
2. Mandatory fixes
3. Minor notes
4. Readiness for Phase 1
5. Model recommendation for Phase 1

Не запускай full CI.
```

---

**Рекомендуемый агент:** Composer 2. FIX docs-only или narrow plan cleanup.

## PROMPT 03 — FIX PHASE 0

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только Mandatory fixes из docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_0.md.

Ограничения:
- не редактировать app-код;
- не расширять scope;
- не запускать full CI.

Обнови:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/PLAN_INVENTORY.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

В финале перечисли исправленные mandatory items.
```

---

**Рекомендуемый агент:** Composer 2. Foundation узкий. Codex 5.3 только если Tailwind/shadcn/refactor scope оказался сложным.

## PROMPT 04 — EXEC PHASE 1 FOUNDATION

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй только Phase 1 из docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/01_FOUNDATION_PLAN.md.

Подтверди ветку: должна быть `patient-app-visual-redesign-initiative`. Если нет — переключись/создай.

Перед началом прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/01_FOUNDATION_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/PLAN_INVENTORY.md если существует
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md sections 1, 4, 6, 7, 8, 9, 12
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Сделай только foundation:
- patient-scoped tokens in globals.css с семантическими именами (никаких *-new/*-v2/*-tmp; см. MASTER_PLAN §6);
- preserve existing patient CSS variables (--patient-radius, --patient-radius-lg, --patient-bg, --patient-surface, --patient-touch, --patient-gap) — не удалять, значения не менять;
- shell page background `#F7F8FB` only — НЕ менять max-width в этой фазе (max-width 430px переносится в Phase 2);
- shared patient visual helpers for card/button/badge/icon;
- keep existing exports compatible.

Запрещено:
- не редизайнить individual PatientHome* blocks;
- не менять PatientHeader/PatientBottomNav/navigation behavior;
- не менять AppShell max-width (это Phase 2);
- не трогать DB/routes/services;
- не менять doctor/admin UI intentionally;
- не использовать имена *-new/*-v2/*-tmp;
- не запускать full CI.

Обнови LOG.md.

Проверки:
- targeted tests for changed files;
- pnpm --dir apps/webapp typecheck if TS/React changed;
- pnpm --dir apps/webapp lint only if style/import scope warrants.

В финале укажи:
1. Что сделано.
2. Какие файлы изменены.
3. Какие проверки запускались.
4. Что отложено и почему.
```

---

**Рекомендуемый агент:** Composer 2. GPT 5.5 только если audit finds architecture risk.

## PROMPT 05 — AUDIT PHASE 1 FOUNDATION

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит результата Phase 1.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/01_FOUNDATION_PLAN.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md sections 7, 9, 12, 14
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Проверь diff:
- tokens patient-scoped;
- existing patient CSS variables not broken/deleted;
- doctor/admin not intentionally affected;
- helpers reusable and not one-off;
- AppShell modes preserved;
- no nav/home block redesign leaked into phase;
- tests appropriate to scope.

Создай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_1.md

Структура:
1. Verdict
2. Mandatory fixes
3. Minor notes
4. Tests reviewed/run
5. Explicit scope-leak check
6. Readiness for Phase 2

Не запускай full CI.
```

---

**Рекомендуемый агент:** Composer 2. Codex 5.3 только если mandatory fixes require broad React refactor.

## PROMPT 06 — FIX PHASE 1 FOUNDATION

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только Mandatory fixes из AUDIT_PHASE_1.md.

Ограничения:
- только Phase 1 files/scope;
- не начинать навигацию или home blocks;
- не запускать full CI.

Обнови LOG.md.
Запусти только проверки, относящиеся к fixes.
В финале перечисли mandatory fixes и проверки.
```

---

**Рекомендуемый агент:** Composer 2. Codex 5.3 допустим, если Phase 0/1 показали высокий риск из-за `PatientGatedHeader`/shell coupling.

## PROMPT 07 — EXEC PHASE 2 NAVIGATION

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй только Phase 2 из docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/02_NAVIGATION_PLAN.md.

Подтверди ветку: `patient-app-visual-redesign-initiative`.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/02_NAVIGATION_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_1.md если существует
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md sections 2, 4, 5, 6, 9.4, 10.1, 12, 14
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Сделай:
- mobile patient max-width 430px (одновременно в AppShell контентном контейнере и в PatientBottomNav контейнере);
- bottom nav visible < lg, hidden lg+;
- desktop top nav visible lg+, hidden < lg;
- mutual-exclusivity test для nav в AppShell.test.tsx (matchMedia mock или responsive class assertion);
- top nav brand icon/logo + BersonCare;
- nav items Сегодня/Запись/Разминки/План/Дневник;
- Профиль справа, не в bottom nav;
- no patient settings gear ни в PatientHeader, ни в PatientGatedHeader;
- no top Home;
- no desktop patient Back (даже если backHref существует);
- mobile inner Back может оставаться когда useful;
- PatientGatedHeader получает те же правила (профиль справа, нет gear, нет desktop Back) — без рефакторинга его внутренней логики;
- tests for nav/header/shell.

Запрещено:
- не редизайнить home cards;
- не менять routePaths semantics;
- не трогать doctor/admin nav;
- не делать broad PatientGatedHeader refactor (только три пункта выше);
- не запускать full CI.

Обнови LOG.md.
Запусти targeted tests from 02_NAVIGATION_PLAN.md.
```

---

**Рекомендуемый агент:** Composer 2 for normal audit. GPT 5.5 if nav behavior is controversial or diff is broad.

## PROMPT 08 — AUDIT PHASE 2 NAVIGATION

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит результата Phase 2.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/02_NAVIGATION_PLAN.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md sections 5, 12, 14
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Проверь:
- bottom nav < lg only;
- desktop top nav lg+ only;
- no simultaneous navs;
- brand BersonCare exists on desktop;
- no desktop Back;
- no top Home;
- no settings gear;
- bottom nav contains Дневник, not Профиль;
- profile is top/right;
- accessibility roles/aria preserved;
- tests appropriate.

Создай AUDIT_PHASE_2.md with Verdict, Mandatory fixes, Minor notes, Tests, Readiness for Phase 3.
Не запускай full CI.
```

---

**Рекомендуемый агент:** Composer 2. Codex 5.3 only for broad shell/header fixes.

## PROMPT 09 — FIX PHASE 2 NAVIGATION

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только Mandatory fixes из AUDIT_PHASE_2.md.

Ограничения:
- только Phase 2 scope;
- не начинать home primary blocks;
- не запускать full CI.

Обнови LOG.md.
Запусти targeted checks for changed nav/header/shell files.
```

---

**Рекомендуемый агент:** Composer 2. Задача UI-focused и ограничена несколькими home components.

## PROMPT 10 — EXEC PHASE 3 HOME PRIMARY

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй только Phase 3 из docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/03_HOME_PRIMARY_PLAN.md.

Подтверди ветку: `patient-app-visual-redesign-initiative`.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/03_HOME_PRIMARY_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_2.md если существует
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md sections 4, 6, 8, 9, 10.1-10.4, 11, 12, 14
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md только как editorial reference
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Сделай:
- layout updates (mobile single column, desktop dashboard grid);
- greeting с обязательным time-of-day prefix (Доброе утро / Добрый день / Добрый вечер / Доброй ночи) через getAppDisplayTimeZone() в server-component PatientHomeToday → prop в PatientHomeGreeting; БЕЗ client-side new Date() для часа;
- hero daily_warmup as gradient card with image right/bottom and fallback;
- booking as success card with booking + appointments CTAs;
- situations as icon tiles without slug/title color mapping;
- update related tests, включая 4 ветки time-of-day для greeting.

Запрещено:
- не менять CMS/runtime data model;
- не хардкодить CONTENT_PLAN slugs;
- не менять secondary blocks beyond wrapper compatibility;
- не менять AppShell/PatientHeader/PatientBottomNav/PatientTopNav;
- не запускать full CI.

Обнови LOG.md.
Запусти targeted tests from 03_HOME_PRIMARY_PLAN.md.
```

---

**Рекомендуемый агент:** Composer 2. GPT 5.5 only if audit must judge product/design tradeoffs.

## PROMPT 11 — AUDIT PHASE 3 HOME PRIMARY

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит результата Phase 3.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/03_HOME_PRIMARY_PLAN.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md sections 10.1-10.4, 11, 12, 14
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Проверь:
- hero no longer image-on-top generic card;
- hero has safe image/fallback behavior;
- booking success card keeps correct href/auth behavior;
- situations are CMS-driven and no slug color mapping added;
- layout handles missing blocks;
- tests updated appropriately;
- no data/service changes leaked.

Создай AUDIT_PHASE_3.md.
Не запускай full CI.
```

---

**Рекомендуемый агент:** Composer 2.

## PROMPT 12 — FIX PHASE 3 HOME PRIMARY

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только Mandatory fixes из AUDIT_PHASE_3.md.

Ограничения:
- только Phase 3 scope;
- не начинать secondary blocks;
- не запускать full CI.

Обнови LOG.md.
Запусти targeted checks for changed files.
```

---

**Рекомендуемый агент:** Composer 2. Codex 5.3 не нужен при стабильных helpers.

## PROMPT 13 — EXEC PHASE 4 HOME SECONDARY

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй только Phase 4 из docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/04_HOME_SECONDARY_PLAN.md.

Подтверди ветку: `patient-app-visual-redesign-initiative`.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/04_HOME_SECONDARY_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_3.md если существует
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md sections 9, 10.5-10.10, 11, 12, 14
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Сделай:
- progress + streak two-region card;
- warning reminder card;
- mood gradient card with 5 equal slots;
- danger SOS card: ВСЕГДА layout с red icon circle слева + текст справа + danger button. Image (если есть) — только декоративный акцент, не led layout;
- plan card visual update without new data queries;
- subscription carousel and courses on patient primitives;
- update related tests.

Запрещено:
- не менять services/repos/API;
- не добавлять subscription gating;
- не менять course/treatment program model;
- не запускать full CI.

Обнови LOG.md.
Запусти targeted tests from 04_HOME_SECONDARY_PLAN.md.
```

---

**Рекомендуемый агент:** Composer 2. GPT 5.5 if behavior preservation is unclear.

## PROMPT 14 — AUDIT PHASE 4 HOME SECONDARY

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит результата Phase 4.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/04_HOME_SECONDARY_PLAN.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md sections 10.5-10.10, 11, 12, 14
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Проверь:
- secondary blocks use shared patient primitives;
- no business behavior changed;
- no new data queries solely for visuals;
- mood save behavior preserved;
- subscription badge remains visual only;
- SOS bot scenarios untouched;
- tests updated appropriately.

Создай AUDIT_PHASE_4.md.
Не запускай full CI.
```

---

**Рекомендуемый агент:** Composer 2.

## PROMPT 15 — FIX PHASE 4 HOME SECONDARY

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только Mandatory fixes из AUDIT_PHASE_4.md.

Ограничения:
- только Phase 4 scope;
- не начинать final cleanup beyond required fixes;
- не запускать full CI.

Обнови LOG.md.
Запусти targeted checks for changed files.
```

---

**Рекомендуемый агент:** Composer 2. Эскалация на Codex 5.3 только если cleanup потребовал сложного TS/React refactor. GPT 5.5/Opus 4.7 не нужны для EXEC этой фазы.

## PROMPT 16 — EXEC PHASE 5 TESTS QA CLEANUP

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 5 из docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/05_TESTS_QA_CLEANUP_PLAN.md.

Подтверди ветку: `patient-app-visual-redesign-initiative`.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/05_TESTS_QA_CLEANUP_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_1.md если есть
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_2.md если есть
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_3.md если есть
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_4.md если есть
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md sections 11, 12, 14, 15
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md

Сделай:
- обнови/добери тесты;
- удали очевидные мертвые imports/helpers (только в файлах, которые меняли в этой инициативе);
- проверь responsive/accessibility checklist на уровне кода;
- создай/обнови AUDIT_VISUAL_FINAL.md если это предусмотрено текущей задачей;
- (рекомендуется) приложи ссылки на before/after скриншоты для mobile 390px и desktop 1280px по hero/booking/situations/progress/reminder/mood/SOS/plan в LOG.md;
- обнови LOG.md.

Запрещено:
- не начинать редизайн других patient pages (booking, reminders, diary, profile, content, courses, lfk, practice);
- не делать buttonVariants doctor/admin refactor;
- не мигрировать legacy --patient-radius* usages — это backlog;
- не менять более ~5 файлов вне явного scope этой инициативы;
- не запускать full CI без явной причины;
- не делать unrelated refactor.

Проверки:
- targeted tests listed in 05_TESTS_QA_CLEANUP_PLAN.md;
- pnpm --dir apps/webapp typecheck;
- pnpm --dir apps/webapp lint.

Root pnpm run ci НЕ запускать, если пользователь явно не попросил push/CI или scope не стал repo-level.
```

---

**Рекомендуемый агент:** Composer 2 по умолчанию. Эскалация на GPT 5.5 только если предыдущие Composer 2 audits дали противоречивые findings или пользователь явно попросил независимую проверку. Opus 4.7 — только по явной просьбе пользователя при unresolved high-risk contradictions.

## PROMPT 17 — FINAL AUDIT

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи финальный аудит visual redesign.

Прочитай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/05_TESTS_QA_CLEANUP_PLAN.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md полностью
- все AUDIT_PHASE_*.md этой инициативы, если есть

Проверь весь diff инициативы:
- соответствует ли navigation decision;
- используются ли shared patient primitives;
- не создана ли параллельная UI-система;
- нет ли doctor/admin scope leak;
- нет ли runtime slug hardcode из CONTENT_PLAN;
- не изменена ли бизнес-логика;
- доступны ли UI controls;
- tests/checks appropriate;
- full CI не гонялся без причины.

Создай:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_VISUAL_FINAL.md

Структура:
1. Verdict: PASS / PASS WITH MINOR NOTES / FAIL
2. Mandatory fixes
3. Minor notes
4. Visual QA residual risks
5. Tests reviewed/run
6. Explicit confirmations:
   - no CONTENT_PLAN slug hardcode found
   - no doctor/admin intentional redesign
   - no subscription gating added
   - no env vars added
   - no unnecessary full CI required

Не запускай full CI в начале аудита. Сначала анализ diff/scope, потом только необходимые checks.
```

---

**Рекомендуемый агент:** Composer 2 для обычных fixes. Codex 5.3 только если fixes требуют сложного React refactor. GPT 5.5 не нужен для реализации fixes, если audit дал точные instructions.

## PROMPT 18 — FINAL FIX

```text
Работаем в инициативе PATIENT_APP_VISUAL_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только Mandatory fixes из AUDIT_VISUAL_FINAL.md.

Ограничения:
- не добавлять новые features;
- не выходить за visual redesign scope;
- не запускать full CI без явной причины.

Обнови:
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md
- docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_VISUAL_FINAL.md только если нужно отметить статус fixes или ссылку на follow-up

Запусти checks, относящиеся к исправлениям.
В финале перечисли mandatory fixes и проверки.
```

