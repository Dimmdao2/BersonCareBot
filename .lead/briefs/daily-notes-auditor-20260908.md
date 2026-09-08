# Тест или взгляд

Повторяемая дневная семантика, optimistic autosave и UI-состояние проверяются поведенчески; одноразовый backfill,
schema/ACL, визуальная компоновка и отсутствие лишних сущностей — inspection/rollback-only proof. Не создавать
тесты строк исходника, CSS, количества элементов или точного текста интерфейса.

# Independent auditor-live — #1100 daily notes

## Authority and exact candidate

You are the independent auditor of exact committed candidate `f08e36b07` on branch
`wt/daily-notes-20260908`, based on `3249e88b5`. First read the `AGENTS.md` heading map and fully read §1
migration/rights, §5, §10a, §10b, §11, §§16–17, §21 and §24. Authority is
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, NOTE-01..09 and Wave 1 stream B.

Do not change product code. You may commit only genuinely missing behavioral acceptance tests and a concise audit
artifact. Revert every fault injection. Do not push, land, deploy, execute migrations, start shared servers or run
full CI. Named DEV is allowed only via the canonical rollback-only candidate preflight/proof; never create a DB.
If the canonical DEV migration lock is occupied, retry at most three times with a bounded 60-second interval; do
not bypass the lock or classify concurrent orchestration as a product failure.

## Blind kill-set — prepare before reading tests

Before opening tests, write the user-visible failure and impact for each independent class:

1. Reopen/retry/call lifecycle creates a second note for the same organization+client+author+local date, including a
   concurrent race or nullable legacy organization edge (NOTE-01).
2. The edit date uses server UTC/Moscow instead of the stored specialist IANA zone with settings fallback, changes
   while an editor remains open across midnight, or fails to change on the next open (NOTE-02).
3. Legacy same-Moscow-day rows lose or reorder text, keep duplicates, or lose earliest-created/latest-updated
   provenance (NOTE-09).
4. History is not newest-date-first/date-separated, today is not initially editable, or a manual add/save lifecycle
   remains necessary (NOTE-03/04).
5. A past note cannot expand/edit, editing changes its note date, or a collapsed entry exposes more than three
   visual lines without ellipsis (NOTE-05/06; layout part is inspection/live, not a source/UI-shape test).
6. A delayed old response overwrites newer text/revision, parallel dates block each other, or retry produces a lost
   update (NOTE-07).
7. Network failure discards the local draft or requires parent refresh/reload before retry (NOTE-07).
8. Autosave, adjacent expand/collapse or tab switching remounts note/video parent identity or steals textarea focus
   (NOTE-08).
9. Route/service permits cross-tenant/wrong-author update, or staff runtime cannot UPDATE the exact new columns and
   fails `42501` (NOTE-01/06 and mandatory §1 rights contract).

Choose the cheapest public boundary. Preserve existing tests if they protect behavior; do not rewrite them around
implementation. A route claim uses the real handler. DB uniqueness/backfill/ACL requires an opt-in rollback-only
named-DEV proof, not a fake. Each green independent class receives one temporary fault injection and a recorded red
assertion; an untouched-candidate failure remains as a committed acceptance oracle for handoff.

## Required checks and result

Inspect the full diff from `3249e88b5`, existing doctor-notes extension, timezone reuse, migration/backfill,
declaration/generated artifacts, stable React keys/state and autosave queue. Run:

`bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`

Then focused behavior/route/UI/DB proofs you select, generated privilege parity, migration gates, webapp typecheck,
scoped ESLint and `git diff --check`. Provide the §1 four-point rights analysis, explicitly covering staff UPDATE of
`text`, `updated_at`, `note_date` and revision plus every backfill read/write.

Return binary PASS or FAIL with exact plan IDs, reachable impact and evidence. Report exact candidate/auditor SHAs,
commands/counts, kill-set, fault-injection mapping and caught/uncaught totals. Commit only allowed tests/artifact with
explicit staging; otherwise leave the tree clean. No style findings and no product fixes. Do not end while a
foreground command is still running.
