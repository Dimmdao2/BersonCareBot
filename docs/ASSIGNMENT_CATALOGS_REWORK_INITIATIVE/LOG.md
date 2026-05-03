# LOG — ASSIGNMENT_CATALOGS_REWORK_INITIATIVE

Формат: дата, этап (B1…B7), что сделано, проверки, решения, вне scope.

Используйте [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md) для новых записей.

---

## 2026-05-03 — Bootstrap

Создан execution-контур: [`README.md`](README.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`STAGE_B1_PLAN.md`](STAGE_B1_PLAN.md) … [`STAGE_B7_PLAN.md`](STAGE_B7_PLAN.md), шаблоны лога и аудита. Код не менялся.

Синхронизация ссылок: [`../APP_RESTRUCTURE_INITIATIVE/README.md`](../APP_RESTRUCTURE_INITIATIVE/README.md), [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §6, [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md), [`../PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md`](../PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md), [`../README.md`](../README.md), [`../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md`](../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md) §«Этап 9»; запись в [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md).

---

## 2026-05-03 — Планы + промпты (Git/CI дисциплина)

- Во все `STAGE_B1`…`B7` добавлен единый блок дисциплины (коммит после EXEC/FIX; пуш пачками после **B3, B6, B7**; CI — см. `MASTER_PLAN` §9).
- `MASTER_PLAN.md` §9: коммиты, ритм пуша, step/phase CI, **запрет** `pnpm run ci` на каждый коммит; перед пушем полный CI; при падении — `ci:resume:*` (ссылки на `.cursor/rules/test-execution-policy.md`, `pre-push-ci.mdc`).
- Этапные планы уточнены под `PRE_IMPLEMENTATION_DECISIONS` (B1 `status`/test_sets, B2 Q*, B3 Q5+dnd-kit, B4 Q3/Q4, B5 «глаз», B7 `lfk_complex_exercises.local_comment`).
- Новый [`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md); обновлён [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) (ссылка на промпты и §9).
- `LOG_TEMPLATE.md`: контекст Git/CI, чекбокс коммита, правка формулировки B6.

---

## 2026-05-03 — Корректировка решений (B1/test_sets, B6 vs A, Q5)

- По решению пользователя обновлено: **B1** сразу включает публикационный статус для `test_sets` + два соседних фильтра в UI (`active/archived` и `all/draft/published`).
- **Q5** закрыт в сторону удаления UUID-textarea без fallback.
- **B6**: добавлен обязательный pre-check текущего состояния конструктора после завершения фазы A перед EXEC B6.
- Документы синхронизированы: `PRE_IMPLEMENTATION_DECISIONS.md`, `MASTER_PLAN.md`, `STAGE_B1_PLAN.md`, `STAGE_B3_PLAN.md`, `STAGE_B6_PLAN.md`, `PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`, и продуктовое ТЗ `../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`.
