# AUDIT — Phase 6 (QA / release readiness)

Аудит финальной готовности по `06_QA_RELEASE_PLAN.md` (goal, scope, final manual QA, documentation checklist, gate strategy, completion criteria, out of scope). Дата аудита: 2026-04-29.

Источник фактов: `06_QA_RELEASE_PLAN.md`, `LOG.md` (в т.ч. **Phase 6 — EXEC**), дерево `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_*.md`, `apps/webapp/src/modules/patient-home/patient-home.md`.

---

## 1. Verdict

**Pass with notes.**

Документарный чеклист Phase 6 закрыт и подтверждён по факту репозитория. Phase-level проверки из журнала EXEC зелёные; **корневой full CI** в Phase 6 EXEC не выполнялся (согласовано с §Gate Strategy в `06`). **Final Manual QA** в `06` остаётся **неотмеченным** — чекбоксы `[ ]` до операторского smoke / release rehearsal. Зазор **Phase 5 §5.1** закрыт **Phase 6 — FIX**; §5.2–5.3 по-прежнему вне этого FIX.

---

## 2. Documentation checklist (`06` §Documentation Checklist)

| Пункт | Статус | Проверка |
| --- | --- | --- |
| `LOG.md` has entries for each phase. | **Да** | Initialization, Phase 0–6 (EXEC/FIX/AUDIT по фактам работ). Добавлена ретро-запись **Phase 5 — AUDIT** в **Phase 6 — FIX** (`LOG.md`). |
| Audit docs for executed phases. | **Да** | `AUDIT_PHASE_0.md` … `AUDIT_PHASE_5.md` присутствуют; настоящий файл закрывает пункт про `AUDIT_PHASE_6.md`. |
| Rollback docs if migrations exist. | **Да** | `ROLLBACK_SQL.md` в каталоге инициативы (миграция rename / `0008` по журналу Phase 4). |
| `docs/README.md` initiative link. | **Да** | Строка **Patient Home CMS Workflow** со ссылками на README / MASTER_PLAN / PROMPTS / LOG инициативы (`docs/README.md`). |
| `BLOCK_EDITOR_CONTRACT.md` (scope `06` §1). | **Да** | Файл актуален; в нём зафиксированы фазы 1–5 заметками. |
| Модульная заметка workflow (`MASTER_PLAN` §Phase 6). | **Да** | `apps/webapp/src/modules/patient-home/patient-home.md`; перекрёстная ссылка в `modules/patient-home/README.md`. |

---

## 3. Final manual QA checklist (`06` §Final Manual QA Checklist)

План явно относит эти пункты к **операторскому** gate (см. примечание в `06` после Phase 6 EXEC). Статус: **не выполнялись в рамках данного AUDIT** (без headless/E2E прогона).

| Пункт | Автопокрытие (индикативно) | Ручной статус |
| --- | --- | --- |
| Empty `situations` → inline section → in block. | `settings/patient-home/actions.test.ts`, `patientHomeBlockEditor.test.tsx` | **Не подтверждён E2E** |
| Visible empty block warning in settings. | `patientHomeBlockEditor.test.tsx`, `blockEditorMetadata.test.ts` | **Не подтверждён E2E** |
| Missing target repair works. | UI/заглушки Phase 2; персистентный repair — вне текущего закрытия | **Не подтверждён** |
| Section slug rename updates home links. | `pgContentSections.test.ts`, `doctor/content/sections/actions.test.ts` | **Не подтверждён E2E** |
| Old patient section URL redirects. | `page.slugRedirect.test.tsx`, `resolvePatientContentSectionSlug.test.ts` | **Не подтверждён E2E** |
| Mixed block grouping clear. | `patientHomeBlockEditor.test.tsx` | **Не подтверждён E2E** |
| Course/material return flow. | `patientHomeCmsReturnUrls.test.ts`, `ContentForm.test.tsx`; раздел — `sections/new` + `SectionForm` после Phase 6 FIX | **Частично** — E2E не гонялся; §5.2 `AUDIT_PHASE_5` (return только doctor из пикера). |

---

## 4. Gate strategy and checks (`06` §Gate Strategy)

| Требование | Статус |
| --- | --- |
| Phase-level: vitest + tsc + lint | **Подтверждено по `LOG.md` Phase 6 EXEC** (набор из 13 тестовых файлов, 71 тест; `tsc --noEmit`; `lint`). Дополнительно в EXEC: `db:verify-public-table-count` — сверх минимума в `06`, согласуется с `MASTER_PLAN` §5 при наличии DB schema. |
| Full CI только по триггерам | **Соблюдено** в Phase 6 EXEC: `pnpm run ci` не вызывался. |
| Перед push / release | **Ожидание:** `pnpm install --frozen-lockfile && pnpm run ci` (команды в `06`). |

---

## 5. Completion criteria (`06` §Completion Criteria)

| Критерий | Статус |
| --- | --- |
| All mandatory fixes closed. | **Да** | Phase 6 FIX закрыл оговорку `AUDIT_PHASE_6` §2 (запись Phase 5 — AUDIT в `LOG.md`) и зазор `AUDIT_PHASE_5` §5.1 в коде. §5.2–5.3 без изменений (не mandatory). |
| Checks green at required level. | **Да** | По журналу EXEC — phase-level зелёные; full CI — вне scope EXEC. |
| Final summary for user decision. | **Да** | Настоящий документ + `LOG.md` после добавления записи Phase 6 — AUDIT. |

---

## 6. Out of scope (`06` §Out Of Scope)

| Запрет | Статус |
| --- | --- |
| No deploy. | **Ок** |
| No push without explicit user request. | **Ок** (аудит не инициирует push). |
| No new feature scope after final audit. | **Ок** | AUDIT только фиксирует состояние. |

---

## 7. Риски и перенос на push / release

1. **Full root CI** не был зелёным на момент Phase 6 EXEC — перед merge/push обязателен прогон из `06`.
2. **Ручной QA** — закрыть чекбоксы в `06` или отдельном чек-листе релиза после smoke.
3. **Phase 5** — пункт §5.1 (`sections/new` + return-context) **закрыт в Phase 6 FIX**; §5.2–5.3 без изменений (не входили в mandatory Phase 6).

---

## 8. Рекомендуемый next step

- Перед push: `pnpm install --frozen-lockfile && pnpm run ci` + ручной проход §3 в `06`.
- Опционально: доработка §5.2–5.3 `AUDIT_PHASE_5` (настройки vs doctor `returnTo`, CTA «раздел» при непустом `situations`).
