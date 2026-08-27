# Independent audit — systemic background-job manifest (B1–B3, E3)

- Candidate head: `182e4d811780bd0a087ac7fa190fda0f575e155e`.
- Product commit under audit: `71324bafe` (background-job manifest) + merge of
  `feat/doctor-ui-rebuild` carrying only orchestration-journal wiring (`941d5e159`, out of scope,
  touches only `tools/orch-launch.sh`).
- Base: `3e40130e5d6523f81cd69afc03afa2ffa8fe3a86`.
- Authority: `AGENTS.md` §10a, §10b, §24 (read in full before kill-set); `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, B1–B3, E3, Stage 2.
- Auditor role: `auditor-live` per §10b (fault injection performed).

## Blind kill-set (written before reading candidate tests)

Per named behavior in authority (B1–B3, E3, Stage 2 acceptance), test-or-look decided first:

| # | Behavior | Costly+silent? | Decision |
|---|---|---|---|
| 1 | `cronJobRegistry`/`reconcileJobKeys` are projections of one manifest, not a second hand copy | yes (drift is silent) | test (data-equality) |
| 2 | Cron line never carries `Host`/`Origin`/secret/`curl`/`>/dev/null` | yes (B1: silent 404) | test (string/behavior, not text-pin) |
| 3 | Unknown `Host` really gets rejected before the route (`proxy.ts`) and the real transport surfaces that as a loud failure | yes | look (pre-existing, unmodified `proxy.ts`) + live HTTP test |
| 4 | Non-2xx / timeout / network failure from the internal route is loud, not swallowed | yes | test (real curl against real HTTP server) |
| 5 | Every previously-missing B2 job (`hls_proxy_retention`, `product_analytics_retention`, `playback_retention`, `media_purge`, `media_multipart`, `media_transcode_reconcile`) has PROD+TEST artifacts | yes | test + look at generated files |
| 6 | `--check` catches: deleted artifact, hand-edited artifact, orphan artifact | yes | test (already in candidate) + own fault injection |
| 7 | `--verify-installed` catches: missing required schedule, drifted installed line, orphan installed line, missing transport | yes | test + own fault injection against a realistic **old** installed-cron fixture |
| 8 | Deploy gate runs **before** service restart on all three deploy paths (prod, webapp-prod, test) | yes (silent = stale code + broken cron coexist) | look (`grep -n` ordering in each script) |
| 9 | `classifyOperatorCronJobHealth` distinguishes `never_run`/`stale`/`last_run_failed`/`success` | yes | test (already in candidate) + own fault injection |
| 10 | A never-run **required** job still degrades the aggregate status (not silently "ok") | yes | look at `aggregateCronJobsStatus` (pre-existing, unchanged) |
| 11 | `media_transcode_reconcile`'s `acceptStatuses: [200, 503]` doesn't mask a real failure | yes | look at route contract (`route.ts`, untouched by candidate) |
| 12 | Batch job with partial errors doesn't record `success` | yes | look at route contract (pre-existing, Stage 4 scope) |
| 13 | E3 isolation-telemetry map can't silently miss a new `internal_http` family (TS-level) | yes | look at type derivation + test |
| 14 | Manifest/artifact check reachable from a targeted CI path, not only full CI | no (loud failure either way; question is *where* it fires) | look at `package.json`/`ci.yml`/deploy scripts |
| 15 | PROD/TEST stay disjoint (env file, project root, cron prefix, artifact name) | yes | look at manifest + generated templates |

## Candidate files inspected

- `apps/webapp/src/modules/operator-health/backgroundJobManifest.ts` (+test)
- `apps/webapp/src/modules/operator-health/cronJobRegistry.ts`, `reconcileJobKeys.ts`, `cronIsolationOperations.ts`
- `apps/webapp/src/modules/operator-health/classifyOperatorCronJobHealthStatus.ts` (+test)
- `apps/webapp/src/app-layer/health/collectCronJobsHealth.ts`
- `apps/webapp/src/app-layer/operator-health/recordOperatorCronJobTick.ts`
- `apps/webapp/src/modules/operator-health/saasIsolationDiagnostics.ts`
- `deploy/host/background-jobs-cli.mjs` (+test), `run-internal-job.sh` (+test), `webapp-health-host.mjs`
- `deploy/host/deploy-prod.sh`, `deploy-webapp-prod.sh`, `deploy-test.sh`
- `deploy/host/cron.d/*.cron.template` (all 20 generated files)
- `deploy/postgres/saas-isolation-telemetry.sql`
- `deploy/HOST_DEPLOY_README.md`, `docs/README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
- `apps/webapp/src/app/api/internal/media-transcode/reconcile/route.ts` (read-only — **not modified by candidate**, pre-existing, Stage 4 scope)
- `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` diff (status annotations only)

## Checks run and results

1. `node deploy/host/background-jobs-cli.mjs --self-test` → OK.
2. `node deploy/host/background-jobs-cli.mjs --check` → OK, 20 artifacts.
3. `node --test deploy/host/background-jobs-cli.test.mjs deploy/host/run-internal-job.test.mjs` → 21/21 pass (real HTTP server + real `curl`/bash transport, no mocks of the transport itself).
4. `pnpm install --frozen-lockfile` (11.2s, store-linked) then `vitest run` on `backgroundJobManifest.unit.test.ts` + `classifyOperatorCronJobHealthStatus.unit.test.ts` → 14/14 pass.
5. `grep -L run-internal-job.sh deploy/host/cron.d/*.cron.template` → empty (all 20 templates use only the shared transport).
6. `grep -l 'curl\|Host:\|/dev/null' deploy/host/cron.d/*.cron.template` → empty (comments and cron lines alike are clean).
7. `grep -n background-jobs-cli deploy/host/deploy-{prod,webapp-prod,test}.sh` → the `--check`/`--verify-installed` calls sit strictly before every `systemctl restart` in all three scripts (line numbers verified individually).
8. Read-only: `sudo -n -u postgres psql -d bersoncarebot_test -Atc 'SELECT job_family, job_key, last_status, last_success_at FROM operator_job_status ...'` — no writes; used only to sanity-check that `operator_job_status` rows exist and are structurally consistent with the manifest's job keys. This DB is reachable locally from the dev box; it is **not** proof the remote TEST app host (`test.bersoncare.ru`, 151.x) has the new cron installed — no such claim is made here, and the plan's own "остался оператору" list already says the host was not touched.

## Fault injections (all reverted; `git status --short` clean after each)

| # | Injection | File | Kill-set item | Result |
|---|---|---|---|---|
| A | Reintroduced `>/dev/null` around the internal curl call (the literal B1 regression) | `deploy/host/run-internal-job.sh` | #4 | `node --test run-internal-job.test.mjs` → 3/7 red (transport-failure test, unknown-Host test, feature-flag test all caught it) |
| B | `failedLast` forced to `false` (swallow the failed-tick branch) | `classifyOperatorCronJobHealthStatus.ts` | #9 | `vitest` → 1/5 red (`последний запуск упал — отказ...`) |
| C | Deleted the `media_purge` entry from `BACKGROUND_JOB_MANIFEST_SOURCE`, artifact files left in place (simulates B3: manifest drops an entry, stale artifact remains) | `backgroundJobManifest.ts` | #5, #6 | `--check` → 2 problems (`не имеет записи в manifest` ×2, prod+test); `vitest` → 1/9 red (`реализованные retention-задания получили расписание`) |
| D | Simulated the **actual pre-candidate PROD state**: extracted the 5 cron templates that existed at `3e40130e5` (old Host-carrying, `curl`-based lines) into a fixture dir and ran `--verify-installed --env prod --cron-dir <fixture>` | n/a (external fixture, no product file touched) | #7, Q3 | Exit 1, 9 problems (5 missing required jobs, 4 drifted lines) — **empirically proves** the first deploy after this lands will hit the gate against real host state, see verdict on Q3 below |

All four injections were caught by an existing or candidate-added assertion; none required a new acceptance test from me. Reverted files: `run-internal-job.sh`, `classifyOperatorCronJobHealthStatus.ts`, `backgroundJobManifest.ts` (byte-identical to HEAD, confirmed via `git diff --stat` empty after each revert). No new test or artifact was added by this audit — existing candidate coverage was sufficient to kill every named behavior in the kill-set.

## Answers to the required questions

**Q1 — single executable source?** Yes. `cronJobRegistry.ts` maps `BACKGROUND_JOB_MANIFEST` 1:1 (verified by a data-equality test, and independently by fault injection C: deleting a manifest entry immediately breaks the registry-projection invariant). `reconcileJobKeys.ts` and `cronIsolationOperations.ts` are re-exports/derivations typed off the manifest's own union (`InternalHttpJobFamily`), not copies — a new `internal_http` family literally cannot compile without an isolation-telemetry entry. No second hand-maintained list found.

**Q2 — do all previously-missing jobs now have correct schedule/identity/transport?** Yes. `hls_proxy_retention`, `product_analytics_retention`, `playback_retention`, `media_purge`, `media_multipart`, `media_transcode_reconcile` all have PROD+TEST artifacts (20 files total, confirmed count). Every one of the 20 generated cron lines invokes only `run-internal-job.sh <env> <job-id>` — no template carries `Host:`, `Origin:`, `curl`, or `>/dev/null` (grep-verified across all 20). Transport failure (fault injection A) is loud.

**Q3 — can deploy converge a host from the old cron state, or is the first deployment blocked?** The named suspicion is **confirmed true, but it is the intended design, not a defect.** `--verify-installed` only *verifies* `/etc/cron.d` (or `--cron-dir`); no deploy script installs/copies templates there — installation is an explicit, disclosed operator step (plan: "Что осталось оператору" #1, and the CLI itself prints the exact `install` commands on failure). Fault injection D empirically reproduced this against the real pre-candidate template set: a host still running the old (Host-less/curl-based) cron entries fails `--verify-installed` with 9 problems, and `fail()` in all three deploy scripts (`set -euo pipefail` + explicit `exit 1`) aborts before any `systemctl restart`. This matches Stage 2's acceptance criterion verbatim ("намеренно удалённая... schedule job красит deploy... до запуска продукта") and is not silent — the plan discloses it, and the gate prints the fix. Net: the very next PROD/TEST deploy **will** fail until an operator runs the printed `install` commands once; this is correct fail-closed behavior, not an unrecoverable deadlock (the install step is independent of running deploy).

**Q4 — does every job record failure when the business operation failed, and is 503 for transcode reconcile real or swallowed?** Mixed, but the substance predates this candidate. `media-transcode/reconcile/route.ts` is **not touched by this diff** — it is pre-existing code explicitly named as Stage 4 scope ("Один контракт результата фоновой операции... errors > 0 не превращается в success: true"), not yet done. Two residual observations for the record, neither a regression introduced by this candidate:
  - The route's 503 covers three distinct cases (`not_configured`, `pipeline_disabled`, `reconcile_disabled`); the manifest's `acceptStatuses: [200, 503]` comment frames all 503s as "operator decision," but `not_configured` (missing `INTERNAL_JOB_SECRET` at the Next.js process level) is a real misconfiguration, not a flag. In practice this is narrow — `run-internal-job.sh` already refuses to call the route at all if the secret is empty in the *same* env file (test #19 in `run-internal-job.test.mjs` proves this) — but a desync between the cron env file and the running webapp's process env would still be silently treated as "accepted" by the transport. It is not literally invisible: no tick is ever written for that job, so `classifyOperatorCronJobHealth` keeps reporting `no_data`/`never_run`, which bumps the aggregate to `degraded` (verified by reading `aggregateCronJobsStatus`, unchanged pre-existing code). Recommendation for whoever picks up Stage 4: split `not_configured` into its own status code, distinct from the two flag-off 503s.
  - Separately, the route unconditionally returns `{ ok: true }` / HTTP 200 and records a **success** tick even when `report.enqueue.errors > 0` (line-level: the try block always calls `recordMediaTranscodeReconcileSuccess`, `metaJson.enqueueErrors` is recorded but never gates the outcome). This is exactly the anti-pattern Stage 4 is written to close, already named there — not a new finding, and out of this candidate's declared scope (Stage 2/E3 only). Flagging so it isn't lost, not as a blocker on this candidate.
  All jobs actually touched by this candidate (manifest-declared `internal_http` jobs going through `run-internal-job.sh`) do record failure correctly: any non-accepted status is loud at the transport layer (fault injection A), and `classifyOperatorCronJobHealth` correctly treats `lastStatus==='failure'` as `error` (fault injection B).

**Q5 — can a missing/stale/extra schedule be reported healthy, and is a never-run job visible?** No, and yes respectively. Missing required installed schedule → `--verify-installed` red (self-test + fault injection D). Stale/drifted installed line → red (self-test fixture "рукописная cron-строка мимо общего transport"). Extra installed line with no manifest entry → red (self-test fixture "artifact без записи в manifest"). A never-run job never gets silently marked `ok`: `classifyOperatorCronJobHealth` returns `{status:'no_data', reason:'never_run'}` for it (test-covered, fault-injection-provable via the same file), and `aggregateCronJobsStatus` (pre-existing, unchanged) bumps the aggregate to `degraded` for any `no_data` job that isn't explicitly `optionalNoData` (only the three non-hourly backup jobs are).

**Q6 — does the manifest/artifact check run in a targeted CI path without requiring full CI?** Partially, and this is accurately disclosed rather than overclaimed. `check:background-jobs` and `test:scripts` (which includes both new `.test.mjs` files) exist as `package.json` scripts and are exercised by the three deploy scripts as a hard pre-restart gate (verified above) — that is a real, targeted, non-full-CI enforcement point. However, `.github/workflows/ci.yml` does **not** run `test:scripts` (or `check:background-jobs`) as its own job; it is only reached via a full local `pnpm run ci`. This is the same gap already named in the plan's finding A4 and explicitly deferred to the plan's own Stage 6 ("Подключить быстрые защиты к CI," not yet done) — the plan's Stage 2 "что уже стоит" bullet only claims `--check` "входит в `pnpm test:scripts`," which is true, and does not claim GitHub Actions wiring. No overclaim found; the GitHub Actions gap remains open and worth carrying into Stage 6 as already planned.

**Q7 — PROD/TEST separation, no PROD mutation?** Yes on both counts. `BACKGROUND_JOB_ENVIRONMENTS.prod`/`.test` have disjoint `envFile`, `projectRoot`, and `cronFilePrefix`; every generated artifact name and cron command embeds its own environment (verified by reading generated templates for both prefixes). This audit made zero writes to PROD or TEST: all fault injections targeted local worktree files (reverted) or `/tmp` fixtures; the one DB query was a read-only `SELECT` against the locally-reachable `bersoncarebot_test` Postgres, used only to sanity-check schema shape, not to draw any live-acceptance conclusion (that remains explicitly open per the plan's own "остался оператору" list, item 3).

## Verdict

**PASS** for the declared scope of this candidate (Stage 2, B1–B3, E3). Every acceptance criterion named in the authority plan for this stage is implemented, is the sole source of truth (no duplicate manually-maintained copy), fails loud on all four fault-injected regression classes (transport suppression, health-classification swallow, manifest/artifact drift, real pre-candidate host-state drift), and is gated before service restart on all three deploy paths. The named suspicion in Q3 is real but is exactly the intended fail-closed behavior, self-disclosed by the plan as a one-time operator prerequisite, not a hidden defect or deadlock.

## Remaining findings / blockers / owner questions (none block this candidate; carried forward as already-scoped future work)

1. **Not a new finding — already Stage 4 scope.** `media-transcode/reconcile/route.ts` still records a success tick when `report.enqueue.errors > 0`, and folds a genuine misconfiguration (`not_configured`) into the same "accepted" 503 bucket as the two intentional feature-flag-off cases. Recommend Stage 4 pick this up together with the D1 multipart-cleanup swallow already named in the plan, since both are the same class of defect (batch job treats partial/real failure as success).
2. **Not a new finding — already Stage 6 scope.** `test:scripts`/`check:background-jobs` are not wired into `.github/workflows/ci.yml`; they only fire at deploy time or via manual full `pnpm run ci`. No regression from this candidate — carried forward as planned.
3. **Operator action required before this is live-effective** (already disclosed in the plan, repeated here for traceability): install the 20 generated templates into `/etc/cron.d` on PROD and TEST as root (commands are printed by `--verify-installed` on failure); reapply `deploy/postgres/saas-isolation-telemetry.sql` on DEV/TEST/PROD so `cron_maintenance`/`cron_saas_billing` are accepted by the DB-side dictionary; then complete the live TEST acceptance (fresh tick per required job, red gate on an intentionally removed schedule). None of this was performed by this audit, per brief.
