# Independent auditor-live — #1100 daily notes

Candidate: `f08e36b07ca70aa9451228340e35ea51f9626186` (base `3249e88b5d012d66f5817d8aafbecfc93e284250`).

Authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, Wave 1 stream B, NOTE-01 through NOTE-09.

## Blind kill-set (written before reading tests)

| Class | User-visible failure and impact | Evidence kind |
| --- | --- | --- |
| K1 / NOTE-01 | Reopen, retry, call lifecycle, a race, or legacy `NULL organization_id` creates a second daily note for one organization/client/author/date; history splits and edits diverge. | DB uniqueness/upsert proof; route behavior |
| K2 / NOTE-02 | The date follows UTC/Moscow rather than the stored specialist IANA zone/fallback, changes during an open editor at midnight, or remains stale on next open; text lands under the wrong day. | Unit/UI behavior |
| K3 / NOTE-09 | Legacy same-Moscow-day rows lose/reorder text, retain duplicates, or lose earliest-created/latest-updated provenance; clinical history is corrupted. | Rollback-only migration/backfill proof |
| K4 / NOTE-03/04 | History is not newest-date-first/date-separated, today is not initially editable, or manual add/save is still required; daily note workflow fails. | Service/UI behavior; layout by inspection |
| K5 / NOTE-05/06 | A past note cannot expand/edit, editing changes its date, or collapsed content visibly exceeds three lines without ellipsis; historic correction is blocked or disclosure is excessive. | UI behavior; visual layout by inspection |
| K6 / NOTE-07 | A delayed old response overwrites newer text/revision, different dates block each other, or retry loses an update; autosave silently corrupts notes. | UI behavior |
| K7 / NOTE-07 | Network failure discards local draft or requires parent refresh/reload before retry; clinician loses work. | UI behavior |
| K8 / NOTE-08 | Autosave, neighboring expand/collapse, or tab switch remounts note/video parent identity or steals textarea focus; call/editor is disrupted. | UI behavior; identity/layout inspection |
| K9 / NOTE-01/06 and §1 rights | Route/service accepts cross-tenant or wrong-author update, or staff runtime lacks UPDATE for `text`, `updated_at`, `note_date`, or revision and returns `42501`; another tenant can alter data or valid edits fail. | Real route and named-DEV rollback-only privilege proof |

No tests were opened before this table.

## Result: FAIL

Two reachable candidate failures stop acceptance:

1. K1/K3/NOTE-09: the required named-DEV rollback-only preflight stops in the migration backfill at `min(id)` because PostgreSQL has no `min(uuid)`. The migration therefore cannot merge legacy rows or create the daily unique index; a release leaves the old multi-row history contract in place.
2. K5/NOTE-05/08: after a past note is expanded, its date button only adds the date to `expanded`; it never removes it. The specialist cannot collapse that note again. `DoctorNotesPanel.ui.test.tsx` is intentionally committed as the failing handoff oracle.

### Focused evidence

- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — FAIL: `ERROR: function min(uuid) does not exist` in `20260908T120000_daily_doctor_notes.sql`; the wrapper transaction is rollback-only.
- `pnpm run check:db-privileges-generated` — PASS: both DEV/TEST privilege and port-context artifacts match the declaration byte-for-byte.
- `node scripts/check-migration-privileges.mjs && node scripts/check-migration-privileges.mjs --self-test && bash apps/webapp/scripts/check-legacy-migrations-frozen.sh && bash apps/webapp/scripts/check-drizzle-migration-order.sh` — PASS (`144` migration files; self-test `7` red fixtures and `1` green fixture).
- `pnpm --dir apps/webapp typecheck` — PASS.
- Scoped `pnpm --dir apps/webapp exec eslint …` over the notes/timezone routes, panel, and acceptance files — PASS.
- `git diff --check` — PASS.

### Behavior and injection ledger

| Class | Candidate result | Fault injection → red assertion |
| --- | --- | --- |
| K1 | FAIL as a direct consequence of the rollback-only migration stop: no daily uniqueness/backfill can be installed. | Not separately injected; K3 prevents the DB contract from existing. |
| K2 | PASS. | Force `UTC` in `getDoctorCalendarDate` → expected Los Angeles `2026-09-07`, received `2026-09-08`. |
| K3 | FAIL on untouched candidate. | `min(uuid)` preflight error above. |
| K4 | PASS. | Change debounce from `500` to `5000` ms → autosave assertion observed zero POSTs. |
| K5 | FAIL on untouched candidate. | Past textarea remains present after second date-button click. |
| K6 | PASS. | Let an old response replace local text → queued POST body became `Старый текст` instead of `Новый текст`. |
| K7 | PASS. | Delay retry from `1500` to `5000` ms → retry assertion observed one POST instead of two. |
| K8 | PASS. | Key by date+revision → focused textarea was remounted and `document.activeElement` became `body`. |
| K9 | Route boundary PASS; live staff-column runtime proof BLOCKED by K3. | Bypass the POST organization identity return → handler dereferenced the absent client instead of returning its 404. |

Directly caught: 8 classes (six temporary fault injections plus two untouched-candidate failures). Blocked before direct runtime exercise: 1 class (K1, because K3 prevents its index/backfill from existing). Uncaught: 0. The K9 sub-proof for live `app_staff` UPDATE/RLS execution of `text`, `updated_at`, `note_date`, and `revision` is likewise blocked rather than passed until the candidate migration preflight passes.

### §1 rights analysis

1. The migration changes `public.doctor_notes`: adds `note_date` and `revision`, backfills and merges rows, makes `note_date` NOT NULL, then creates `uq_doctor_notes_daily_author`. It contains no GRANT/REVOKE/policy statement.
2. DDL runs as `app_object_owner`; data-only backfill blocks use `BCB-MIGRATION-BACKFILL`. The staff runtime uses the ordinary `app_staff` declaration/RLS path.
3. The declaration and generated DEV SQL grant `app_staff` UPDATE exactly on `note_date`, `revision`, `text`, and `updated_at`; insert includes both new columns. The generated staff policy remains organization-scoped. The actual route first resolves the client in `gate.ctx.organizationId` and derives `authorId` only from the session, so the caller cannot submit another author.
4. The backfill reads/writes `doctor_notes` (`organization_id`, `user_id`, `author_id`, `note_date`, `id`, `created_at`, `updated_at`, `text`) and deletes duplicates. It has no missing declaration-owned runtime grant because it is a migration-admin data step. The required live `42501` absence proof is blocked solely by the preflight failure, not replaced by a fake test.
