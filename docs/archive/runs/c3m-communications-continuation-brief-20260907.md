# C3M continuation worker — finish communications enforcement

Read the `AGENTS.md` heading map before every action, then §1 migration/privilege rules if schema is touched,
§4/§4a, §5, §9, §10/§10a/§10b, §12, §16, §17, §21, §22 and §24 in full. Read `README.md`, the whole C3M section
of `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, communications/chat/comments/media/mailings
docs, the accepted prerequisite slices, the current branch diff, and the original
`runs/c3m-communications-slice-brief-20260907.md`.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-09 — «Фильтровать
Communications tabs и default tab; gate chat ensure/read/write, unread-count, snapshots, payment-link-to-chat,
comments/media and mailing read/write paths; отключить соответствующие notifications/jobs, не только кнопки».

The branch already contains partial commit `fcb8d41b6`: nullable direct-chat persistence and the beginning of the
shared client-policy resolver. It is explicitly `WORKER INCOMPLETE, NOT FOR LAND`. Finish the whole C3M-09 stage in
this one pass; do not stop after another partial subset.

Required closure:

1. Complete one organization-scoped policy resolver: explicit client allow/deny first, otherwise the org default;
   `on_support` reads only the existing `onSupport`. Workspace availability/dependencies remain upstream and cannot
   be broadened. Extend existing profile/chokepoints; no second table, favorite, group, shell or formula.
2. Enforce direct chat for doctor and patient ensure/list/read/write, snapshots, unread counts/badges/pollers,
   payment-link-to-chat and message notification paths.
3. Enforce program comments/media for doctor and patient read/write/feed/count/upload/notification paths, preserving
   rehabilitation/client_portal/comments parent dependencies and stored child/client choices.
4. Enforce mailings for compose/send/history/read and delivery/job triggers. It stays independent of chat/support
   and preserves its earlier entitlement gate.
5. Filter Communications tabs, choose the first effective default, normalize a disabled requested tab, load/badge
   only effective tabs, and make the page absent when no child is effective.
6. OFF/deny never deletes history; OFF→ON restores it; the same patient in two organizations remains isolated.
7. Preserve C3M non-scope exactly: no per-client editing UI (C3M-11), portal/symptoms, presets, tariffs/add-ons,
   profession/solo/clinic logic, booking policy, terminology sweep or Today redesign.

This product worker writes no tests. Do not add UI/label/DOM/source/SQL/function-format/count tests. If an in-scope
existing test encountered during the work tests wording, structure or counts rather than durable behavior, delete it
instead of adapting it. Run affected existing behavior checks, webapp typecheck, scoped ESLint, architecture checks,
migration/privilege static checks if applicable, and `git diff --check`; no full CI and no shared dev server.

If the partial migration needs correction, keep timestamp/owner markers, no GRANT/REVOKE/policy statements, and
update privilege declarations only for a demonstrated rights gap. Independent audit owns blind tests, fault
injection, live acceptance and owner-aware candidate preflight. Commit explicit in-scope paths only with `#1098`,
why, evidence, C3M-09, and what remains only for audit/preflight. Never `git add -A`, never push, and do not finish
without a commit that closes every item above or a concrete external blocker.
