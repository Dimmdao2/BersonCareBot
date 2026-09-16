# C3M worker — specialist shell and route projection

Read the `AGENTS.md` heading map before every action, then §4/§4a, §5, §9, §10/§10a/§10b, §12, §16, §17,
§18, §21 and §24 in full. Read `README.md`, `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`, the whole C3M
section of `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, and the accepted C3M-01/C3M-03
foundation before editing.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-06 — «Проецировать
resolver в sidebar/mobile nav, direct pages, card tab registry, header CTA, lazy bootstrap/fetches и cross-links;
OFF не оставляет скрытый poller, badge или preload».

Implement C3M-06 only. The lead closes the checklist after independent audit/live acceptance.

## Required behavior

1. Extend the existing request-local `loadDoctorWorkspaceShell` path to load the organization composition once,
   intersect it with existing availability through the accepted `resolveWorkspaceModuleEffective`, and pass one
   typed effective map through the existing `DoctorWorkspaceShell`/menu/card surfaces. Do not add a second settings
   fetch, resolver, endpoint, context tree or page-local formula. Before adding a helper, prove why the existing
   request-local shell/settings path cannot be parameterized.
2. Project that same map into desktop sidebar, mobile Sheet and bottom navigation:
   - `analytics` controls Analytics;
   - `rehabilitation` controls the entire `Каталог ЛФК` cluster;
   - `direct_chat`, `program_comments`, `mailings` control their corresponding Communications children, and the
     parent `Коммуникации` disappears only when none remains effective;
   - `program_media` is not a separate navigation item;
   - `Сегодня`, schedule/online booking, client list, basic Overview notes and tasks are never workspace switches.
   Existing entitlement/capability availability remains authoritative and may only be narrowed, never expanded.
3. The Communications shell must select the first effective tab, filter its tab registry and avoid loading a hidden
   tab. Thread the effective flags into the existing unread provider so disabled chat/comments leave no poller,
   badge request or preload. Do not implement channel default/per-client policy in this stage.
4. Make the existing patient-card tab registry organization-aware without creating another tab system. `Обзор`,
   `Файлы` and `Учётка` stay. `ЛФК` follows `rehabilitation`. The existing `Карта` container stays available when
   either `medical_record` or `encounters` is effective, because those independent contents are separated in
   C3M-07a/07b. Route-tab chrome and the interactive card must use the same filtered registry.
5. Add page-level guards and cross-link filtering for the shell-level module entry pages using the accepted
   `requireWorkspaceModuleForPage`; direct disabled pages return the frozen page `404` outcome. Do not duplicate
   the 404 adapter. API/action `403` enforcement inside each medical/encounter/rehabilitation/communications/portal
   feature remains the named C3M-07+ slices; do not pretend a page guard completes those stages.
6. Stop module-specific lazy bootstrap/preload work where the shell or card already owns the trigger. Do not rewrite
   the entire Overview data model in this stage: C3M-07a–10 own feature-internal fetches and mutations. Preserve all
   stored data and restore the same surfaces on OFF→ON without migration or destructive writes.
7. Leave `/app/doctor` Today presentation untouched. Existing links from Today may target guarded routes, but do not
   redesign, hide or reorder anything on Today.

## Explicit non-scope

No tariff tiers, add-ons, domain billing, profession roles, solo/clinic fork, presets/first-run, terminology sweep,
new favorite/group, client defaults/overrides, symptom tracking schema, support migration, database migration or
new UI dependency. Do not change booking, cancellation, prepayment or schedule policy.

## Validation and delivery

This product worker writes no tests (`AGENTS.md` §10b). In particular, no tests for labels, menu/tab counts, DOM
shape/order, CSS, formatting or source text. The independent auditor will derive the behavior kill-set and use live
inspection for mutable UI form. Run only existing targeted shell/navigation/route checks affected by the change,
webapp typecheck, scoped ESLint, architecture guards and `git diff --check`; no full CI and no shared dev server.

Inspect the final diff and commit explicit in-scope paths only with a message containing `#1098`, why, evidence,
`C3M-06`, and what remains for independent audit and C3M-07+. Never use `git add -A`; do not push. Work in one turn,
keep long commands in the foreground, and do not finish before the commit exists.
