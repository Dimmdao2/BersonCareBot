# PATIENT_APP_STYLE_TRANSFER_INITIATIVE

Style-only перенос уже согласованного визуального языка главной пациента на остальные patient pages.

## Что это такое

Это не редизайн содержимого страниц. Инициатива переносит только визуальный chrome:

- patient card surface;
- radii, borders, shadows;
- patient text tones;
- patient buttons/links;
- pills/badges;
- spacing rhythm;
- tabs/list rows/forms visual wrappers;
- empty/error/loading chrome.

Содержание страниц, порядок блоков, тексты, сценарии, бизнес-логика и продуктовая структура **не придумываются агентом** и **не меняются** в рамках этой инициативы.

## Branch

Рабочая ветка:

```text
patient-app-style-transfer-initiative
```

Если ветки нет, EXEC-агент создаёт её от актуальной ветки разработки. Не работать в старых ветках `patient-home-redesign-initiative` и не смешивать с CMS workflow.

## Read First

Перед любым EXEC/AUDIT/FIX читать:

- `docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/MASTER_PLAN.md`
- `docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/CHECKLISTS.md`
- `docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/LOG.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md`
- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/000-critical-integration-config-in-db.mdc`
- `.cursor/rules/runtime-config-env-vs-db.mdc`

## Absolute Scope Limit

Allowed:

- extract/reuse patient style primitives;
- replace old visual classes with patient-scoped classes;
- wrap existing content in patient surface classes without changing meaning;
- update tests only where markup/classes changed;
- update docs/log/audits.

Forbidden:

- changing page content/copy except class-only wrapper text unaffected;
- moving/adding/removing business blocks;
- changing page IA, routes, tabs, ordering, product flow;
- adding new data fetches for visual reasons;
- changing services, repos, migrations, API routes;
- adding env vars or system settings keys;
- doctor/admin visual changes;
- changing course/treatment/LFK logic;
- importing home-specific fixed geometry into unrelated pages.

## Files

- `MASTER_PLAN.md` — overall style-transfer plan.
- `CHECKLISTS.md` — route/style/a11y/test gates.
- `LOG.md` — execution log.
- `00_INVENTORY_PLAN.md` — readonly inventory.
- `01_PRIMITIVES_PLAN.md` — shared style primitives.
- `02_STATIC_PAGES_STYLE_PLAN.md` — content/catalog/read-only pages.
- `03_INTERACTIVE_PAGES_STYLE_PLAN.md` — profile/reminders/diary forms/lists.
- `04_BOOKING_STYLE_PLAN.md` — booking/cabinet visual chrome.
- `05_QA_DOCS_PLAN.md` — final QA/docs.
- `AUDIT_TEMPLATE.md` — phase/global audit format.
- `GLOBAL_AUDIT.md` — global closeout audit.
- `PATIENT_SHARED_STYLE_ELEMENTS_AUDIT.md` — audit of shared/new patient style elements and reuse candidates.
- `PROMPTS_EXEC_AUDIT_FIX.md` — copy-paste prompts for Composer.

## Model Strategy

Default: **Composer 2** for all EXEC/AUDIT/FIX.

Escalate only if explicitly justified:

- Codex 5.3: repeated React refactor failures in a style-only phase.
- GPT 5.5: independent audit requested or Composer audits conflict.
- Opus 4.7: only by explicit user request.

## Completion

Complete means:

- style primitives are shared and patient-scoped;
- selected patient pages visually use the same patient chrome;
- no content/UX/business changes were introduced;
- all phase audits have no mandatory fixes;
- global audit passes or global fix closes mandatory findings.
