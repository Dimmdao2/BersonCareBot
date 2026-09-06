# CMS Content: restore the existing material surface

## Authority

- Owner instruction, 2026-09-06: opening doctor `Content` currently shows effectively nothing. Before redesigning the page, show the content/materials that already exist so the owner can inspect the actual screen.
- `AGENTS.md` is canonical. Read its heading map, §16, §17, §20, §21, §22, §10a, §10b and §24 before acting.
- Read the active owner review referenced by `docs/DOCTOR_UI_REBUILD_REVIEW/CONTENT_REWORK_PLAN.md`; that older plan is explicitly superseded and must not be executed as authority.

## Exact bounded outcome

1. Reproduce or evidence why `/app/doctor/content` renders no useful material/section surface for the current doctor clinic on the named DEV/TEST environments.
2. Trace the complete existing path: workspace/entitlement visibility, organization scoping, section/page repositories, server load error handling, active pane selection and responsive catalog rendering.
3. If the blank state is a code regression, make the minimum correction so existing permitted sections and materials render and the already-supported existing create/manage actions are reachable.
4. If the current organization legitimately has no CMS capability or no scoped data, do not bypass tenant isolation and do not seed or copy content silently. Report the exact gating fact and the minimal owner-visible consequence instead.
5. Preserve the current split-layout direction and existing shared CMS/catalog primitives. Parameterize or repair the existing path; do not add a second CMS page, local catalog shell, local modal geometry or duplicate data access.

## Explicit non-scope

- No visual redesign beyond what is required to expose the existing surface.
- Do not invent header icons or new creation actions; the owner wants to see the existing content first.
- Do not implement the new doctor analytics brief in this workstream.
- Do not add aspirational views-count metrics or new schema merely because the superseded rework plan mentions them.
- Do not alter patient content behavior except where a shared regression fix is strictly required and proven.
- Do not touch PROD, seed disposable databases, or modify live organization entitlements/data as a workaround.
- Do not run full CI, push, land, or deploy. The orchestrator owns those steps.

## Required evidence

- Exact commands/queries used to establish whether scoped sections/pages exist and whether entitlement gates hide them. Use only documented named DEV/TEST access paths and do not print secrets.
- Targeted behavior tests for any changed repeatable behavior. Do not write source-text tests.
- Typecheck/lint or the smallest applicable project gate through the host test lock.
- Commit all task files on `wt/cms-content-existing-materials-visibility-20260906` with explicit path staging and report the SHA, changed files, checks and any unresolved environment/data blocker.
- Do not finish while a foreground check is still running.
