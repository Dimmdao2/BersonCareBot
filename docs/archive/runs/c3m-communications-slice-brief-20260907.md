# C3M worker — communications enforcement

Read the `AGENTS.md` heading map before every action, then the full migration/privilege rules in §1 if schema is
touched, plus §4/§4a, §5, §9, §10/§10a/§10b, §12, §16, §17, §21, §22 and §24. Read `README.md`, the whole
C3M section of `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, the communications module docs,
and accepted C3M-01/02/03/04/06/08 code before editing.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-09 — «Фильтровать
Communications tabs и default tab; gate chat ensure/read/write, unread-count, snapshots, payment-link-to-chat,
comments/media and mailing read/write paths; отключить соответствующие notifications/jobs, не только кнопки».

Implement C3M-09 only. The lead closes it after independent audit, privilege analysis/preflight if applicable, and
live acceptance.

## Required behavior

1. Reuse the accepted workspace resolver and one organization-scoped client-policy resolver. Do not scatter
   `off | all | on_support` checks across routes. Effective channel policy is exactly: explicit client
   `allow/deny` first, otherwise org default; `on_support` reads the one existing `onSupport` property. Workspace
   availability/dependencies are evaluated before client policy and never broadened by it.
2. Persist direct-chat override by extending the existing organization-scoped `doctor_patient_support` profile;
   reuse existing nullable comments/media overrides as `inherit | allow | deny`. Do not add a second client policy
   table/profile or a favorite/group. Preserve every current explicit comments/media value during migration.
3. Enforce `direct_chat` on ensure/list/read/write, doctor and patient conversation paths, snapshots, unread counts,
   badges/pollers, payment-link-to-chat and message notifications. A disabled/denied client has no usable direct API
   bypass; unrelated records and booking remain accessible under their own rules.
4. Enforce `program_comments` and `program_media` on both doctor and patient read/write paths, feeds, counts,
   attachment/upload paths and notifications. Their accepted parent dependencies (`rehabilitation`, `client_portal`,
   and comments as parent of media) remain authoritative; do not overwrite stored child or client choices.
5. Enforce `mailings` on compose/send/history/read paths, jobs/delivery triggers and navigation/tab data. Mailings do
   not depend on chat or `onSupport`; preserve existing entitlement availability as an earlier gate.
6. Communications chooses the first effective tab, rejects/normalizes a query for a disabled tab to that effective
   default, and never loads/badges/preloads a disabled tab. If no child is effective, the page is absent through the
   accepted page guard.
7. OFF/deny changes no stored conversations, messages, comments, media or mailing history. Re-enable/allow restores
   the same authorized data. Two organizations sharing a patient remain isolated.
8. Extend existing support-policy, communications registry/loaders and notification chokepoints. Do not create a
   second shell, inbox, route family, repository or feature-flag formula.

## Explicit non-scope

The per-client editing UI and source labels belong to C3M-11; this stage implements persistence/evaluation and may
only make minimal existing UI adaptations required to stop hidden work. No portal invite lifecycle beyond the
already accepted dependency guard, no symptom tracking, medical record, encounters, presets, terminology sweep,
tariff/add-on/domain changes, profession roles or solo/clinic fork. Today presentation stays unchanged.

This product worker writes no tests (`AGENTS.md` §10b). Do not add label/DOM/source-text/SQL-text/function-format
tests. The independent auditor owns the blind behavior oracle. Run affected existing service/route/notification
checks, webapp typecheck, scoped ESLint, architecture and migration/privilege checks if applicable, and
`git diff --check`; no full CI or shared dev server.

If a migration is necessary, use timestamp/owner markers, no GRANT/REVOKE/policy statements, update the privilege
declaration only for a demonstrated rights gap, and leave the owner-aware rollback-only candidate preflight to the
separate acceptance run. Commit explicit in-scope paths only with `#1098`, why, evidence, `C3M-09`, and remaining
audit/preflight. Never `git add -A`, never push, and do not finish before the commit exists.
