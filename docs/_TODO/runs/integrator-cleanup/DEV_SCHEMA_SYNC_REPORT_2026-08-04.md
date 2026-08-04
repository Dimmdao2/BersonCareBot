# DEV schema sync — measured, standard path attempted, blocked with a named cause

Response to `DEV_SCHEMA_SYNC_BRIEF_2026-08-04.md`. Branch `wt/dev-schema-sync`, no merge into `feat`.

## 1. Divergence, measured with the migrator's own completeness check

Not a manual tag diff — reused the exact logic `pnpm run migrate` uses to decide "complete"
(`inspectMigrationLedgerCompleteness` / `readMigrationReconciliations` from
`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`, run standalone against each env's
`drizzle.__drizzle_migrations` hash set, read via `sudo -u postgres psql` — no app credentials touched):

```
[TEST] total=363 direct=350 reconciled=13 missing=0
[DEV]  total=363 direct=349 reconciled=10 missing=4
[DEV] missing tags: 0361_saas_organization_trials_apply_tariff_owner_select_local,
                     0362_oauth_vk_enabled_projection_repair_local,
                     0365_visibility_stage_a_patient_links_screens_toggle_local,
                     0366_saas_tariffs_capability_read_0360_slot_reconcile_local
```

TEST's `363/350/13/0` matches the number already recorded in the 04.08 deploy report verbatim — confirms this
method agrees with the tool used in production deploys, not an approximation.

Confirmed structurally for the most visible gap: `0365` creates `public.patient_specialist_links`.

```
DEV:  to_regclass('public.patient_specialist_links')  -> NULL   (table absent)
TEST: to_regclass('public.patient_specialist_links')  -> patient_specialist_links (present)
```

This is the exact table the 04.08 TEST deploy report named: *«сравнить с DEV буквально не вышло — там этой
таблицы нет вообще»*.

Raw ledger counts for context (not the actionable number — see §2 for why): DEV has 370 ledger rows / 362
distinct hashes against 363 journal entries, TEST has 360 / 360. The gap between raw hash-diff and the tool's
`missing=4` is the reconciliation mechanism (`RECONCILES-MIGRATION-HASH`) legitimately covering most of the
apparent gaps — only trust the tool's number, a manual hash diff overcounts by ~2.5×.

## 2. Standard path run — preflight PASS, execute FAILED, root cause found (not routed around)

```
bash deploy/host/migrate-dev.sh --preflight   # PASS
bash deploy/host/migrate-dev.sh --execute     # FAILED, exit 1
```

Failure:

```
[migrate] migration_ledger_incomplete tags=0361_...,0362_...,0365_...,0366_...
```

Root cause, read from the installed migrator, not guessed:

- Drizzle's built-in `migrate()` (`node_modules/drizzle-orm/pg-core/dialect.js:56-71`) does **not** check
  each migration's hash before running it. It reads the single highest `created_at` already in the ledger and
  runs every journal entry whose `folderMillis` (`when`) is greater than that one number. Hash is only ever
  *written*, never *read* for the skip decision — the same mechanic the 04.08 VK-projection audit already
  documented for TEST (`vkproj-audit-20260804`, PASS row in `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`).
- DEV's ledger carries a stray row not matching any current migration file:
  `id=377 hash=9dd7b31a…13137e created_at=1793539230110`.
- The four missing tags have `when` = `1793539230106..109` — all **below** DEV's stray `110`. Drizzle's
  "greatest timestamp so far" watermark therefore already looks past all four; their DDL bodies never ran, and
  they never will on a plain re-run — this is exactly the failure mode `AGENTS.md` §1 "Миграции: временный
  номер в клоне" warns about: a migration applied under a temporary number, then edited/renumbered before
  landing, leaves the old hash+timestamp stranded in the ledger, and re-running by content hash never touches
  it because the *timestamp* gate skips it first.
- `pnpm run migrate` ran clean (no SQL error) — it just did nothing, because the watermark said everything was
  already past. The `migration_ledger_incomplete` gate that turned this into a hard failure is the same new
  completeness check the 04.08 TEST ledger-contamination fixes (`06e01af66`, `#987` round two/three) added
  today; before it existed this would have been a **silent false success** — `pnpm run migrate` would have
  printed nothing wrong and left the four migrations un-applied forever.
- TEST's ledger has no such stray row above its own max — that's the entire reason TEST's redeploy today
  came back `missing=0` and DEV's does not.

Per brief §2, this failure **is the finding** — no manual ledger edit was made to force it through. DEV's
ledger is unchanged: 370 rows, max `created_at` still `1793539230110`, before and after this run.

## 3. DEV usability, current (unsynced) state — partial, since sync didn't complete

Full "after sync" verification from the brief isn't possible — sync didn't land. Checked DEV as-is instead,
since a broken worker is worth more than the sync itself (brief §3):

- **Webapp**: already running on `127.0.0.1:5200` (shared dev server, another session's process — not
  restarted). `GET /api/me` unauthenticated → `401`. Dev-bypass login (`token=dev:admin`) → `200`, session
  resolves `role=admin`. **Boots and email/dev-auth login path works** on the current schema.
- **Delivery worker** (`pnpm run worker:dev`, `apps/integrator`): **crashes immediately on startup** —
  `[db][query] error` (SQL/params redacted by the repo's diagnostic policy, `queryFingerprint=d4373283fb2acf60`)
  followed by `Runtime worker crashed`, after `saasIsolationTelemetry` reports ready. This happens on DEV's
  *current* schema, independent of whether the sync above would have fixed it — none of the four missing
  migrations touch worker-startup queries (0365's table isn't read by app code yet per its own migration
  comment; 0361/0362/0366 are grant/trigger/policy fixes unrelated to worker boot). **This is a separate,
  pre-existing DEV break, not caused by this measurement run** — flagging per §4 (not fixing): the worker does
  not currently start on DEV at all, sync or no sync.

## 4. Findings catalog (not fixed this turn, per brief §4)

1. **Blocking**: DEV ledger watermark contamination (`id=377`, `created_at=1793539230110`, no matching
   migration file) prevents `migrate-dev.sh --execute` from applying the four pending migrations
   (0361/0362/0365/0366) by any plain re-run. Needs an owner-gated ledger repair (reconcile or delete the
   stray row), not a code change — out of this turn's scope by brief §2/§4.
2. **Separate, pre-existing**: `pnpm run worker:dev` crashes on startup on DEV right now, unrelated to the four
   missing migrations. Not diagnosed further this turn (redacted diagnostics + out of scope) — worth its own
   brief.
3. `0366`'s migration comment (`RECONCILES-MIGRATION-HASH: 0360_...`) documents that the *same* stray-slot
   contamination class already happened on TEST today (`06e01af66`) and was fixed there by reconciliation.
   DEV's stray row is a different incident (different hash, `created_at=110` vs the TEST one's collision on
   slot `0360`) — same class, not the same event.

## 5. Why DEV fell behind, and what stops it recurring

`migrate-dev.sh` is opt-in and manual (`AGENTS.md` §1b/3: *"Pending migrations применяются... только через
migrate-dev.sh --preflight → --execute"*) — nothing runs it automatically, and nothing checks DEV's ledger
completeness as a side effect of any other workflow. All of today's migration churn (D27-C reconciliation
rounds, the 0360 ledger-contamination fix, VK projection repair, visibility stage A) landed and was verified
exclusively against **TEST**, via `deploy-test.sh`/`deploy-test-saas.sh`, which run their own `pnpm migrate`
as part of deploy. DEV has no equivalent trigger — it only advances when an agent explicitly runs
`migrate-dev.sh`, and today nobody did, because every "live" check funneled through TEST instead (the whole
premise of the sibling brief this responds to).

Structurally, this is worse than a manual step being skipped: even when someone *does* run
`migrate-dev.sh --execute`, the drizzle watermark-only skip logic (§2) means a ledger already poisoned by one
temporary-number-then-renumbered migration will make the run silently no-op **without any error**, unless the
completeness gate added today happens to catch it. Before today's gate, this class of drift was invisible.

What would stop recurrence (not implemented — owner-gated, per §4 "не чини"):

- Make `migrate-dev.sh --preflight` also run the completeness check (§1's standalone logic, now proven to work
  without a live migrate) so ledger drift is visible *before* anyone claims "verified on DEV," not just at
  `--execute` time.
- Treat "DEV ledger complete vs journal" as a cheap, no-write, always-safe check any agent can run before
  trusting a DEV-based live verification — it needs no elevation and no `--execute`.
- The underlying anti-pattern (temporary migration number applied to a live DB, then edited/renumbered before
  landing) is already named as forbidden-after-apply in `AGENTS.md` §1; the gap is that nothing currently
  verifies DEV *didn't* fall into it after the fact — the completeness check closes exactly that gap and should
  run routinely, not just when `--execute` happens to be invoked.
