# D31 + landed D15 — combined rollback-only named-DEV preflight result (2026-08-21)

Role: `auditor-live`. Mandatory owner-aware rollback-only pre-landing gate required by `AGENTS.md` §1
(«До аудита и landing кандидат миграции обязан пройти owner-aware rollback-only preflight против именованной
DEV из точного candidate checkout»). Classified under §24.4 as a one-time runtime **look**, not a test: no new
test, kill-set, fault injection, product correction or documentation rewrite was produced.

Owner authority: **Р-D31** (`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:319`, владелец 31.07) —
«делать API для VK, инсту удалять». Searched `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`,
Track D `WORK_ORDER.md`, `TRACK_D_ORCHESTRATION_HANDOFF_2026-08-20/21.md`, `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`
and the dated D31/D15 result chain: **no later ruling** permits fixture data, a disposable database, or landing
before this candidate preflight.

## VERDICT: PASS

## Candidate identity

| Fact | Value |
| --- | --- |
| Launch HEAD | `6c69bfb9f669dba0532666fcc9a0c5af6596476b` |
| Branch | `wt/d31-vk-channel-20260821` |
| Worktree | `/home/dev/dev-projects/bcb-wt-d31-vk-channel-20260821` |
| Target | named DEV `bcb_webapp_dev` on DEV/TEST host `151.241.228.122` |

- `git merge-base --is-ancestor 9f3953ecd9a2bd187bc628d87e1adee129a2c100 HEAD` → **ancestor**
  (`fix(d31-vk-migration): separate LANGUAGE plpgsql on its own line in three functions`, 2026-08-21 11:58:13 +0300).
- `git merge-base --is-ancestor da204db05 HEAD` → **ancestor**
  (`da204db05ebd6eff9a8338d5349b1fda32943e24 docs(track-d): accept D31 static correction`, 12:15:04 +0300).
- Only the accepted D31 factual-report/brief docs and merge commits follow the accepted product correction on the
  candidate first-parent line: `96c952a76` (merge) → `7ebf9fffa` (docs, corrected factual record) → `db0d7442f`
  (merge) → `9708718a2` (docs, this brief) → `874cbcdfa` (merge) → `6c69bfb9f` (merge HEAD); plus `da204db05`
  and `2d773c161`, both `docs`. No product/source commit follows `9f3953ecd` on the candidate line — the other
  non-merge commits reachable from HEAD arrive through merges of `feat/doctor-ui-rebuild` (landed D15 and the
  fixture-retirement track), and their effect on the two gated files is pinned by the exact blobs below.
- `git status --porcelain` empty **before** the temporary env copies and **after** cleanup.

### Exact migration blobs (git object identity, both confirmed)

| Migration | Path | Expected | Observed |
| --- | --- | --- | --- |
| D15 (landed, pending on DEV) | `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql` | `eef3e05c62b29aba3d3919efeda599e0e3c5ef12` | `eef3e05c62b29aba3d3919efeda599e0e3c5ef12` ✔ |
| D31 | `apps/webapp/db/drizzle-migrations/20260821T050000_add_vk_messenger_settings.sql` | `d46fdec559c10078028c60783f54a4b742ddcc3e` | `d46fdec559c10078028c60783f54a4b742ddcc3e` ✔ |

Confirmed twice: `git rev-parse HEAD:<path>` (committed tree) and `git hash-object <path>` (working tree) agree.

## Pre-run host state

No TEST deploy, full CI, other migration process or migration lock was active, so the bounded 15-minute wait was
not entered:

- `ps -eo pid,args | grep -E 'migrate-dev|migrate-local|migrate-integrator|deploy-test|reconcile-access|pnpm run ci|run-tests.sh|vitest|next build'` → none.
- `/tmp/bcb-dev-migrate.1001.lock` → acquirable with `flock -n` (**free**); `fuser` → no holder.
- `/tmp/bcb-test-deploy.lock` → acquirable with `flock -n` (**free**); `fuser` → no holder.
- Candidate `.env` and `apps/webapp/.env.dev` absent before the run.

## Command

Run exactly once, from the candidate worktree, inside a `setsid` detached child:

```
bash deploy/host/migrate-dev.sh --preflight
```

- Exit code: **0** (wrapper), **0** (runner terminal).
- Log: `/tmp/d31-combined-candidate-preflight-20260821.log` (541 lines).
- PID file: `/tmp/d31-combined-candidate-preflight-20260821.pid` (child pid `2747812`, own session `2747812`).
- No `--execute`, no `--reapply`, no direct `psql`, no manual SQL, no fixture/seed/account/clinic/data creation,
  no disposable database, no historical replay, no TEST/PROD, no landing, deploy, push or full CI.

## Pending-set evidence — combined ordered set proven

Wrapper summary line: `pending=2 total=21 reapplied=0 foreign-ledger-rows=0 relabeled=0 dropped-foreign=0
dropped-foreign-by-hash=0 unapplied=0`. `total=21` matches the 21 files in
`apps/webapp/db/drizzle-migrations/`, and `pending=2` is exactly the two gated migrations.

The two pending migrations are separated in the log by their per-migration ledger-row stage (`INSERT 0 1`,
lines 424 and 475 — both inside the rolled-back transaction). Each block matches its exact blob's owner contract:

- **First block (D15 `20260821T040000`, ends at ledger stage line 424):** 41 owner-marked statements + 8
  `BCB-MIGRATION-BACKFILL` steps in the file; the log shows 34 `CREATE FUNCTION`, 3 `ALTER TABLE`, 2
  `CREATE INDEX`, 1 `DROP INDEX`, 4 `DO`, and the canonical-contacts backfill work `INSERT 0 202`,
  `INSERT 0 126`, `UPDATE 36`, `UPDATE 328`.
- **Second block (D31 `20260821T050000`, lines 425–474, ends at ledger stage line 475):** exactly 6 statements
  in exactly the file's owner order (6 `BCB-MIGRATION-OWNER` markers, 5 `--> statement-breakpoint`):

  | # | `SET LOCAL ROLE` observed | Command tag | File statement |
  | --- | --- | --- | --- |
  | 1 | `app_seam_settings_integrator_owner` | `CREATE FUNCTION` | `app.read_integrator_provider_runtime_setting` |
  | 2 | `app_seam_settings_integrator_owner` | `CREATE FUNCTION` | `app.read_integrator_clinic_delivery_credential` |
  | 3 | `app_seam_reminder_materialization_owner` | `CREATE FUNCTION` | `app.read_patient_reminder_delivery_target_snapshot` |
  | 4 | `app_object_owner` | `ALTER TABLE` | `user_notification_topic_channels_channel_check` (+`vk`) |
  | 5 | `app_seam_patient_self_actions_owner` | `CREATE FUNCTION` | `app.set_current_patient_notification_topic_channel` |
  | 6 | `app_seam_reminder_materialization_owner` | `DO` | `$bcb_vk_reminder_commit$` VK channel splice |

Every statement ran under the declared owner via `SET LOCAL SESSION AUTHORIZATION`/`SET LOCAL ROLE`, never as
`postgres`: the log's `session_user | current_user | can_create_public` probe shows `bcb_dev_migrator` as
`session_user` throughout, with the declared seam owner as `current_user` and `can_create_public = f` for every
seam-owned statement. Temporary owner memberships were revoked (`REVOKE ROLE` ×18) and the post-state assertion
`DO` block passed before the rollback.

## Rollback and ledger evidence

- The transaction opened with `BEGIN` (log line 4) and the **last SQL command tag in the stream is `ROLLBACK`**
  (log line 536). There is **no `COMMIT`** anywhere in the log (`grep -nE '^(ROLLBACK|COMMIT)$'` → one hit,
  `536:ROLLBACK`).
- Both `INSERT 0 1` ledger stages (lines 424, 475) are inside that same rolled-back transaction, so
  `drizzle.__drizzle_migrations` gained **no row**; nothing was applied.
- Wrapper's own terminal statement: `Drizzle owner-ordered migration validated and rolled back for
  "bcb_webapp_dev"`, then `migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation
  complete)`.
- The relation-wall registry seed (`DELETE 219` / `INSERT 0 219`, log lines 1–2) is the wrapper's own
  declaration-derived pre-step, executed before `BEGIN` by design, and carries no migration DDL or data.

### Safe last lines of the log

```
REVOKE ROLE
DO
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=2 total=21 reapplied=0 foreign-ledger-rows=0 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
[runner] ==== END migrate-dev.sh --preflight exit=0 ====
[runner] cleanup api_copy_present=no webapp_copy_present=no pidfile_present=no
[runner] terminal exit_code=0
```

## Detached mechanics and cleanup

The candidate stores no env. A `setsid` detached runner created regular, non-symlink, mode-0600 copies of the
canonical `/home/dev/dev-projects/BersonCareBot/.env` and
`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` at the corresponding candidate paths, refusing to
start if either path already existed, and removed **only** those two copies plus the PID file in an `EXIT` trap.
Copy shape was logged, never contents.

Verified after the terminal result:

| Check | Result |
| --- | --- |
| Child pid `2747812` stopped | ✔ not in `ps` |
| Any `migrate-dev` / `migrate-local` / preflight process | ✔ none |
| `<candidate>/.env` | ✔ absent |
| `<candidate>/apps/webapp/.env.dev` | ✔ absent |
| `/tmp/d31-combined-candidate-preflight-20260821.pid` | ✔ absent |
| `/tmp/bcb-dev-migrate.1001.lock` | ✔ free (`flock -n` acquired) |
| `git status --porcelain` | ✔ clean (before this result file) |

No env value, URL, password, contact or PII was read or printed. The only matches for a secret-name scan of the
log (`password|token|secret=|postgres://|@yandex|phone`) are 9 occurrences of the **role name**
`app_seam_password_auth_owner` in the `current_user` probe — no values. The D31 verify probe naming
`vk_callback_secret` is never executed as free-form SQL: `renderObjectPresenceSql` compiles `BCB-MIGRATION-VERIFY`
into `pg_catalog` `EXISTS(...)` presence checks returning booleans, and only for *applied* migrations.

## Findings

None. No `auditor-live` product fix was made or needed; nothing was fixed in this pass by design.

NOT DONE: landing / execute migrations / live VK delivery gate / TEST / deploy / push / full CI
