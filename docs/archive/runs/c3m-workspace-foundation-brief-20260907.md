# C3M worker A — workspace preference foundation

Read `AGENTS.md` completely by route: mandatory §4a, §5, §10/§10a/§10b, §12 and §24. Read `README.md`, `docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md`, and the full C3M section in `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` before editing.

Taskdb workstream: `#1098`. Authority is the C3M checklist and `docs/OWNER_DECISIONS.md` section `Настраиваемость кабинета специалиста`.

## Exact checklist scope

- **C3M-01 — contract freeze.** `Зафиксировать typed module registry, dependency graph, defaults matrix и disabled-route response codes.`
- **C3M-03 — preference foundation.** `Добавить structured settings keys, parser/versioning, one resolver и server guards; backfill/absence должны сохранять текущее «всё доступное видно».`

This worker implements only the reusable typed foundation needed by those two items. It does not close either checkbox; lead closes it only after independent audit.

## Required behavior

1. Workspace preference only narrows already-computed availability. It must never enable a mechanic/capability the organization/actor does not already have.
2. Closed module registry is exactly: `medical_record`, `encounters`, `rehabilitation`, `direct_chat`, `program_comments`, `program_media`, `mailings`, `analytics`, `client_portal`.
3. Preserve the dependency graph already recorded in C3M.4. Parent OFF makes descendants effective-OFF but does not overwrite stored child preferences.
4. Missing setting / existing organization is compatibility mode: all already-available modules remain enabled. No migration/backfill is needed for this stage.
5. Use the existing typed `system_settings` single root and registry; do not add a table, migration, env flag, tariff key, add-on, plan name, domain pricing, profession or role.
6. Add one versioned structured per-organization workspace-composition contract and one parser/normalizer. Invalid/unknown persisted input must fail or safely normalize according to existing settings conventions without broadening access.
7. Provide one application-layer effective resolver/guard consumed later by shell/routes. The result must combine existing availability and stored preference once. Do not scatter boolean formulas or create module-specific accessors.
8. Freeze a typed disabled-route outcome for later consumers. Reuse existing error/guard conventions; do not wire every route in this stage.
9. Do not change UI, navigation, patient card, communications, symptoms, support profile, schema, migrations, tariffs, billing, onboarding or presets.

## Architecture gate

`AGENTS.md` §5 says: «Там, где к чувствительному ресурсу или проверке ведёт несколько путей, оставлять ОДИН общий проход» and «Варианты одного действия — параметры одной точки, а не отдельные функции». Before adding any function/wrapper/guard, inspect whether the existing `SYSTEM_SETTING_REGISTRY`, `loadDoctorWorkspaceShell`, runtime settings projection, or entitlement surface resolver can be parameterized. Extend an existing chokepoint where that preserves its boundary; do not create a sibling access system. Modules must use ports and DI, never infra imports.

## Test policy and validation

The product worker writes **no tests** (`AGENTS.md` §10b: the first independent auditor creates the blind kill-set and any missing behavioral tests). Do not add source-text, UI-layout, snapshot, function-format or implementation-detail tests. Run only existing targeted tests that already cover touched public contracts, then webapp typecheck and scoped lint. Do not run full CI.

Inspect the final diff, run `git diff --check`, and commit only explicit in-scope paths with a message containing `#1098`, why, evidence, `C3M-01/C3M-03`, and what is not done. Never `git add -A`; do not push. Work in one turn and do not finish before the commit exists.

