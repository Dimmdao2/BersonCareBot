# Runtime write grants — clean bounded candidate (2026-08-23)

## Scope

Closed exactly two reproduced TEST/DEV `42501` failures on `app_staff`:

1. broadcast send under staff principal — missing column INSERT on `broadcast_audit`
   (`organization_id`, `executed_at`) and `broadcast_audit_recipients` (`organization_id`);
2. clinic public-address creation — missing column INSERT on `clinic_public_directory_entries`
   (`description`, `public_contact_phone`, `public_contact_email`, `public_website_url`,
   `locations_json`, `logo_media_id`, `photo_media_ids`, `card_is_published`).

Root cause in both cases (documented at `deploy/postgres/privileges/relation-access.ts:19-29`):
Drizzle's INSERT builder names every schema column, including server-DEFAULT ones, so Postgres
requires column-level INSERT privilege on every named column — not just the columns a callsite
actually sets.

## Source and selection

Read-only source: `wt/runtime-write-grants-20260823` (two commits, `bf3ff816a` salvage +
`567ae66ac` round 2). That branch's `declaration.ts` diff also carried a broad
`REV10_DRIZZLE_INSERT_COLUMN_ADDITIONS` overlay function touching ~80 unrelated tables, an
`operator_alert_*` function/evidence rewrite, `media_hls_proxy_error_events` /
`media_playback_client_events` staff-INSERT grants, an `outgoing_delivery_queue` staff-INSERT
grant + RLS predicate, and migration `20260823T050000_operator_alert_dedup_gets_named_doors.sql`.
None of that is required by the two named failures, so none of it was ported — the fix lands
directly on the existing per-table grant arrays in `relation-access.ts` (hand-authored source
data, not generated) instead of introducing the overlay mechanism.

## Files changed (this branch only)

- `deploy/postgres/privileges/relation-access.ts` — added the missing INSERT columns to the
  existing `app_staff` grants for the three named relations (`broadcast_audit`,
  `broadcast_audit_recipients`, `clinic_public_directory_entries`). No new relation, role, or
  operation; no new function/wrapper/gate.
- `deploy/postgres/privileges/relation-access.test.mjs` — updated the one hardcoded exact-column
  expectation for `clinic_public_directory_entries` INSERT that the fix changes (test 23,
  "clinic-owner mutation grants include every default column emitted by Drizzle inserts"). No
  other test in this file referenced the changed tables.
- `deploy/postgres/privileges/runtime-role-write-grants.devDbProof.test.mjs` (new) — narrow
  rollback-only DEV proof, ported from `567ae66ac`'s final (round-2) version verbatim: reads
  candidate GRANT/REVOKE statements straight out of the generated artifact for the three named
  tables, proves the full production Drizzle INSERT shape succeeds under `app_staff`, proves each
  individually-revoked column turns the same insert red (`REVOKE INSERT (<column>) ...` per
  column, not a table-wide `REVOKE`), and proves the RLS tenant wall still rejects a foreign
  organization on both paths.
- `deploy/postgres/generated/privileges.bcb_webapp_dev.sql`,
  `deploy/postgres/generated/privileges.bersoncarebot_test.sql` — regenerated via
  `node deploy/postgres/privileges/generate-cli.mjs --all`; `--check` confirms byte-match.

## Explicitly NOT ported (out of this bounded scope)

- `REV10_DRIZZLE_INSERT_COLUMN_ADDITIONS` overlay function and its ~80-table column-addition map
  in `declaration.ts` (touches many unrelated tables beyond the two named failures).
- `operator_alert_*` function evidence-string rewrite in `declaration.ts` and the operator-alert
  migration `20260823T050000_operator_alert_dedup_gets_named_doors.sql`.
- `media_hls_proxy_error_events` / `media_playback_client_events` new `app_staff`/`app_patient`
  INSERT grants and RLS policy changes.
- `outgoing_delivery_queue` new `app_staff` INSERT grant, RLS predicate, and
  `pgDoctorBroadcastDelivery.ts` code path reference for that table.
- `apps/webapp/scripts/runtimeWriteCensus.ts` TS-narrowing fix (pre-existing type issue, unrelated
  to these two grants).
- Everything else in `wt/runtime-write-grants-20260823` (that branch itself is untouched — nothing
  was pushed or merged into it).

## Proof

- `node deploy/postgres/privileges/generate-cli.mjs --all` then `--check`: all 4 generated
  artifacts (`bcb_webapp_dev` + `bersoncarebot_test` × privileges/allowlist) byte-match the
  declaration.
- `node deploy/postgres/privileges/generate-cli.mjs --gaps`: `unresolved=0 gaps=0` on both
  databases.
- `node deploy/postgres/privileges/generate-cli.mjs --census`: production source census
  unaffected — 217 ACTIVE relations across 3242 source files, both DBs `ok`.
- `RUN_RUNTIME_ROLE_WRITE_GRANTS_DB=1 node --test
  deploy/postgres/privileges/runtime-role-write-grants.devDbProof.test.mjs` on live
  `bcb_webapp_dev`: **7/7 pass** — full Drizzle insert succeeds for both paths; each of the 2 + 1 +
  8 = 11 newly-added columns individually turns the corresponding insert `42501` when revoked
  alone; both paths reject a foreign organization under RLS.
- `node --test deploy/postgres/privileges/relation-access.test.mjs`: **43/43 pass** (was 42/43
  before updating the one stale hardcoded expectation).
- `node --test deploy/postgres/privileges/function-census.test.mjs`: 14/14 pass, unaffected.
- `pnpm exec tsc --noEmit -p deploy/postgres/privileges/tsconfig.json`: 2 pre-existing errors in
  `declaration.ts` (`D20 enqueue root` / `migration 0050` evidence-string literal mismatches),
  confirmed present on the base branch before this change (same 2 errors with the change stashed)
  — unrelated to this scope, not touched, not introduced here.
- `node --check` on both edited/added files: clean.
- Webapp `eslint`/`typecheck` (`pnpm run lint` / `pnpm run typecheck`): **not run** — this
  worktree has no installed `node_modules` (checked: absent; a full `pnpm install` would exceed
  the 25-minute window). Not required for correctness here: no file under `apps/webapp/**` (or
  any other workspace package) was touched by this change — only
  `deploy/postgres/privileges/*.ts`/`*.test.mjs` and the two generated SQL artifacts. The
  privileges package's own `tsc --noEmit` (above) is the relevant scoped typecheck and is clean
  apart from the pre-existing unrelated errors noted above.
- Full CI: not run, per bounded-candidate authority (deferred to the multi-branch integration
  pass).

## Explicit non-actions

`--execute`, TEST, PROD, and `push` were not run. `wt/runtime-write-grants-20260823` was read
from, never modified. No Therapysto files were read or touched.
