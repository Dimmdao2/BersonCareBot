# Fixture retirement — remove the remaining active authenticated dev-bypass tail

Роль: same-branch worker/fixer в `wt/live-fixtures-retirement-20260821`. Это один остаточный mechanical pass
после уже принятого первичного аудита и live-gate environment failure; новый blind audit не запускать.

Authority: `docs/OWNER_DECISIONS.md` решение 21.08, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §10–§11 и
`AGENTS.md` §1a/§1b: persistent live DEV/TEST fixture actors и token/preset authenticated login запрещены;
ролевые проверки используют обычный вход уже зарегистрированных owner-учёток. `/api/auth/dev-public` остаётся
только clear-session helper.

Источник оракула: `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §10 — «на именованных DEV и TEST не создают,
не сидируют, не reconcile-ят и не требуют persistent fixture-клиники, учётки и наборы данных; удалённый
fixture-механизм не восстанавливают».

Перед действием прочитать карту `AGENTS.md`, §0, §1/§1a/§1b, §7, §10a и §24; повторить поиск более поздних
owner-решений в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном `WORK_ORDER.md`.
Сначала code-search, затем точный active-path census. Исторические reports/evidence/logs не переписывать.

## Уже доказанные активные хвосты

1. `docs/ORCHESTRATION_BINDINGS.md` содержит исполняемую curl-инструкцию
   `/api/auth/dev-bypass?token=dev:*`. Удалить её; оставить только ссылку на канонический ordinary owner login в
   `AGENTS.md` §1a и `LOCAL_DEV_AND_AGENT_TESTING.md`, не копировать второй login runbook.
2. `scripts/take-baseline-screenshots.sh` — tracked temp QA artifact без callsites; он аутентифицирует Chromium
   через `dev:*`. Подтвердить отсутствие callsites и удалить весь obsolete script, не строить replacement login.
3. Executable scripts under `docs/_TODO/SAAS_FOUNDATION/scripts/` still using `/api/auth/dev-bypass` must not
   remain runnable authenticated preset paths. Find their active callers first: if no active caller/owner checkbox
   requires the exact script, delete the obsolete script and remove only active executable references; if a live
   owner requirement still depends on it, stop with exact OWNER QUESTION instead of inventing cookie/password/env
   machinery.
4. Active unchecked acceptance instructions/plans that tell the next agent to use `dev:doctor`, `dev:admin`,
   `dev:clinic-admin` or `dev:client` must be normalized in place to ordinary login of the corresponding existing
   owner account. Do not rewrite completed historical evidence that merely records how an old check was performed.

Initial exact census also found active instructions in `.cursor/plans/doctor_communications_client_shell.plan.md`,
`docs/DOCTOR_UI_REBUILD_REVIEW/PATIENT_PAGE_BUILD_PLAN.md`, `docs/SUBSCRIPTION_INITIATIVE/ROADMAP.md`,
`docs/_TODO/CLINIC_SCHEDULE_ROLE_SCOPE_1028.md` and unchecked acceptance rows of
`docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`. Inspect checkbox/status/context before changing; update only
future instructions, not factual history.

## Acceptance

- Exact census over active rules/runbooks/plans/executable scripts has no instruction or runnable path for
  authenticated `/api/auth/dev-bypass` or `dev:*` token/preset login.
- Historical reports/evidence/logs stay unchanged; tests that assert the removed route remains absent stay intact.
- No replacement helper, fixture, account, seed, env password, cookie package, DB write or authentication path is
  created.
- `bash -n` only for retained changed shell; `node --check` only for retained changed JS/MJS; `git diff --check`.
- No DEV/TEST/PROD access, live login, migration, deploy, push or full CI.

Update `LIVE_DEV_TEST_FIXTURES_RETIREMENT_2026-08-21.md` with the exact active-path census and changed-path evidence.
Commit explicit related paths only, without `git add -A`. Commit message must contain `#987`, why, evidence, plan
and `NOT DONE: candidate owner-login live gate / landing / TEST deploy / push / full CI`. Report SHA, file census,
commands/exit codes and any remaining historical-only matches.
