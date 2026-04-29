# LOG — Patient App Visual Redesign

## 2026-04-29 — Initiative planning

- Created initiative folder `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/`.
- Added `README.md`, `MASTER_PLAN.md`, phase plans `00`–`05`, and copy-paste prompts.
- Visual source of truth remains `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md`.

## 2026-04-29 — Plan hardening (post-audit fixes)

Audit выявил 16 узких мест; внесены исправления:

- **Branch policy** зафиксирована: `patient-app-visual-redesign-initiative`. Добавлено в README инициативы и в каждый EXEC промпт.
- **References folder** создана: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/` с README. Если папка пустая — Phase 3/4 идут только по `VISUAL_SYSTEM_SPEC.md` и фиксируют это в `LOG.md`.
- **Mobile max-width 430px** перенесена из Phase 1 в Phase 2 (вместе с PatientBottomNav контейнером, чтобы не было рассинхрона). Acceptance criteria обновлены.
- **CSS variable naming policy** переписана: запрещены суффиксы `*-new`/`*-v2`/`*-tmp`. Введены семантические имена (`--patient-card-radius-mobile`, `--patient-color-primary-soft`, и т.д.). Зафиксировано в README инициативы и MASTER_PLAN §6.
- **PatientGatedHeader** — добавлено описание роли в Phase 2 plan + явный scope правок (не рефакторить, только три действия: убрать gear, профиль справа, нет desktop Back).
- **Greeting time-of-day** сделан **обязательным** через `getAppDisplayTimeZone()` в server-component с передачей в `PatientHomeGreeting` как prop. Запрещён client-side `new Date()`.
- **AppShell default/doctor smoke** добавлен в Phase 1 acceptance.
- **Phase 5 scope** ограничен hard-limits: не редизайнить другие patient-страницы, не делать buttonVariants doctor refactor, не мигрировать legacy `--patient-radius*`, не более ~5 файлов вне scope.
- **Mutual-exclusivity nav test** добавлен в Phase 2 (matchMedia mock или responsive class assertion) и в acceptance criteria.
- **PROMPT 00 — START HERE** добавлен в начало `PROMPTS_PLAN_EXEC_AUDIT_FIX.md`: проверка ветки, чтение README/MASTER_PLAN/LOG, проверка references/, явный запрет исполнять архивные промпты.
- **Final audit model** — единый default Composer 2 на всех этапах включая финальный audit. GPT 5.5/Opus 4.7 — только по явной просьбе или unresolved contradictions.
- **SOS layout** — всегда red icon circle + текст + danger button. `imageUrl` (если есть) — только декоративный акцент.
- **Out of scope** в MASTER_PLAN §4: явный список patient-страниц, которые не трогаются (booking, reminders, diary, profile, content, courses, lfk, practice).
- **Screenshots в LOG.md** — рекомендованы для финального audit (mobile 390px + desktop 1280px по ключевым блокам).

## 2026-04-29 — Archive markings

Добавлены архивные пометки на:

- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md` (header с указанием статуса "ЗАВЕРШЕНА" и ссылкой на новую инициативу).
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/PROMPTS_PLAN_EXEC_AUDIT_FIX.md` (header "АРХИВ — НЕ ИСПОЛНЯТЬ").
- `.cursor/plans/phase_3_patient_home_1b1dc5a6.plan.md` (header "АРХИВ — НЕ ИСПОЛНЯТЬ").
- `.cursor/plans/phase_4.5_patient_home_a2e6bd38.plan.md` (header "АРХИВ — НЕ ИСПОЛНЯТЬ").

Не помечены как архив (они не относятся к этой инициативе и сохраняют свою валидность):

- `.cursor/plans/exercise_ui_+_references_03b21d8e.plan.md` — completed plan по другой задаче.
- `.cursor/plans/media_hardening_and_logging_1171a669.plan.md` — completed plan по другой задаче.
- `.cursor/plans/system_health_tab_b0e8ec64.plan.md` — активный план по другой задаче.
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_*.md`, `GLOBAL_AUDIT.md` — archived контекст, упомянуты в README завершённой инициативы как архив; отдельные шапки не требуются.

## 2026-04-29 — Session sanity check (branch + references)

- Рабочая git-ветка: **`patient-app-visual-redesign-initiative`** (создана от `origin/main`). Ветка **`patient-home-redesign-initiative`** не используется для EXEC этой инициативы (закрытая линия работ).
- Папка **`docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/`** существует; **файлов референс-скриншотов нет** (есть только `references/README.md`). До добавления экспортов макетов **Phase 3 и Phase 4 EXEC выполняются только по** `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md` (как единственному визуальному источнику).
- Доставляемый Phase 0 артефакт **`PLAN_INVENTORY.md`** в папке инициативы отсутствует; в LOG нет записи о завершённом EXEC Phase 0 — **следующая фаза: Phase 0 (Inventory)** по `00_INVENTORY_PLAN.md`.
- В этой инициативе **нет** `AUDIT_PHASE_*.md`; порядок фаз задаётся `LOG.md` и планами `00`–`05`.
- Архивные PROMPT'ы из `docs/PATIENT_HOME_REDESIGN_INITIATIVE/PROMPTS_PLAN_EXEC_AUDIT_FIX.md` и планы `.cursor/plans/phase_3_patient_home_*.plan.md` / `phase_4.5_patient_home_*.plan.md` **не исполняются**.

## Template for future entries

```md
## YYYY-MM-DD — Phase X / PLAN|EXEC|AUDIT|FIX

- Agent/model:
- Scope:
- Files changed:
- Summary:
- Tests/checks:
- Visual gaps:
- Deviations from spec:
- Next step:
```

