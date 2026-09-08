# Same-branch correction brief — #1100 daily notes

Work in the supplied clean clone and existing `wt/daily-notes-20260908` branch. Product candidate is
`f08e36b07ca70aa9451228340e35ea51f9626186`; retained independent audit/tests are commit
`9108097d096e3846fb609279bba35b2d6c523023`. Read the `AGENTS.md` heading map and the full relevant rules: §1
migration/privileges, §5 architecture, §§7/9/10a/10b/11, §§16/17/21 and §24. Authority is
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, NOTE-01..09 and Wave 1 stream B. Read
`docs/audit/daily-notes-1100-independent-audit-2026-09-08.md` in full.

Источник оракула: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` §2 — «Всё введённое автоматически и надёжно
сохраняется» и owner clarification in the task: «что напечатал то и сохранилось», including closing and reopening
the note/call surface on the same calendar day.

Workers do not write, edit, rename or delete tests. Preserve all auditor acceptance files exactly; make the existing
red collapse oracle green. Do not create another kill-set/audit. Do not push, land, deploy, start a shared server,
execute a migration, create a database or mutate TEST/PROD. The canonical named-DEV preflight is rollback-only and
is required after fixing the migration. Do not change owner checkboxes.

## Required correction, one coherent pass

1. Replace the invalid `min(uuid)` keeper selection with deterministic PostgreSQL-valid logic. Same-author/client/
   organization/Moscow-date legacy rows must merge in chronological `(created_at, id)` order, keep the earliest row
   identity/created timestamp, latest updated timestamp and all text before duplicate deletion. Preserve nullable
   organization semantics and create one `NULLS NOT DISTINCT` daily unique constraint/index.
2. Make a past date's header a real toggle: collapsed by default, click expands it, a later click collapses it again,
   and re-expansion returns the same editable borderless textarea/date. Today remains open and must not become
   collapsible by accident. The existing `line-clamp-3` collapsed preview remains the visual contract.
3. Close the explicit data-loss path omitted by the first audit: text entered immediately before the notes panel/
   modal/tab unmounts must still start a serialized save, so reopen on the same date does not silently discard the
   last keystrokes. Preserve per-date ordering, optimistic revision retry, local draft on network error and stable
   textarea/video identity/focus. Do not solve it by remounting the parent, manual save/add UI, source-string tests or
   storing clinical note text in a URL/log. Prefer extending the existing autosave state rather than a second editor.
4. Remove the accidental whole-file formatter churn in `deploy/postgres/privileges/declaration.ts`: the final diff
   must contain only the exact semantic `doctor_notes` access addition needed for `note_date`/`revision` and no
   unrelated 65k-line reformat. Preserve concurrent/base declarations. Regenerate both canonical privilege artifacts
   from the minimized declaration.
5. Keep Drizzle schema and the actual migration uniqueness semantics aligned, including nullable
   `organization_id`. Preserve the one existing doctor-notes module/service/repository and existing calendar-timezone
   resolver; no parallel table, API or timezone chain.

## Validation and handoff

Run the retained route/UI/timezone acceptance files (the audit reported 4/5 UI before correction), relevant existing
doctor-notes tests, `pnpm --dir apps/webapp typecheck`, scoped ESLint, privilege generated parity, migration privilege/
order gates, `git diff --check`, and
`bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` in the foreground.
The preflight must finish and roll back; do not execute it. Commit all product corrections with explicit path staging,
never `git add -A`. The message must contain `#1100`, why, evidence, Wave 1 stream B and remaining live/TEST work.
End with exact SHA, changed paths, every command/result, whether the retained red oracle is now green, and the four
§1 rights points. Do not finish while a foreground command is running.
