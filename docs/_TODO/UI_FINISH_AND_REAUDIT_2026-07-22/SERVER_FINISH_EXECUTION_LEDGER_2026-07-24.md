# SERVER FINISH — EXECUTION LEDGER (2026-07-24, DEV+TEST orchestrator run)

> **Единственный источник «готово» для этого прогона.** Миррорит `SERVER_FINISH_AND_TEST_DEPLOY_KICKOFF.md` Шаг 3
> + LEDGER §4. Каждый пункт закрывается ТОЛЬКО с evidence (code `path:line` | тест | runtime | SHA). «audit PASS» ≠
> «готово». Back-link: `SERVER_FINISH_AND_TEST_DEPLOY_KICKOFF.md`. Forward-link из `CURRENT_AUTHORITY_MAP.md` §Старт.
>
> Дисциплина: Opus = оркестратор + аудит high-risk (auth/tenant/деньги/миграции/destructive DROP); Sonnet = воркеры.
> Инкрементальный TEST-деплой (`deploy/host/deploy-test.sh feat/doctor-ui-rebuild`) — БД сохраняется, без reset.

## Baseline (verified 2026-07-24)
- Branch tip: `f7d1fa9b1`. TEST deployed HEAD: `5d6e83c569e` (46 commits behind, ancestor — clean fast-forward).
- TEST DB `bersoncarebot_test`: 208 public tables, reachable via `sudo -u postgres psql`.
- env mode: `DB_PRINCIPAL_CONTEXT_MODE=locked` (api.test + webapp.test) — FORCE-RLS locked ALREADY active.
- Services: api/worker/scheduler/webapp/media-worker test — all `active`.
- No `%rubitime%` public tables. Canonical = `be_*` (KEEP). Legacy catalog to retire under R7 = `booking_branches`,
  `booking_branch_services`, `branches`, plus `integrator.rubitime_records/events`. Runbook =
  `RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md` (binding executable spec).
- Migration delta deployed→tip: ONLY `patient-support-mark-read-grant.sql` (no drizzle migrations, no destructive SQL).
- mark-read grant is NOT wired into strict-closure overlays → applied separately.

## Checklist (kickoff Шаг 3)

| # | Item | Risk | Owner-of-work | Status | Evidence |
|---|------|------|---------------|--------|----------|
| 1 | mark-read grant on TEST + `POST /api/patient/messages/read` 200(owner)/0-row(cross) | med | Sonnet+audit | ✅ | DB grant `UPDATE(read_at)` applied+verified. **Live TEST: POST 200 (owner, idempotent x2); cross-user patient B → 404 not_found, A's rows untouched.** Route `apps/webapp/src/app/api/patient/messages/read/route.ts` → `pgSupportCommunication.ts:1218`. 42501 = rewrite-time column-priv. Proof: scratchpad/markread-http-proof.md |
| 2 | Isolation CRITICAL `role_pool_mismatch` — diagnose+fix on TEST | HIGH (tenant) | Opus-audit | 🔄 | Event `role_pool_mismatch:webapp:webapp_db_request` occ=13, last_seen **07-23 16:36 — STALE** (0 recurrence through today's full deploy+22-scenario smoke). Class = 42501 missing-GRANT. **Diagnostic found 3 MORE candidate 42501 paths for app_patient** (reminder journal done/snooze/skip; treatment-program progress; analytics ingest — scratchpad/isolation-42501-matrix.md). NEEDS per-path runtime verification + grant-vs-SECURITY-DEFINER decision (NOT reflexive grants). Then resolve event via coverage-complete. **Grant-gap CONFIRMED on TEST** (app_patient: reminder_journal/occurrence_history=SELECT-only, product_analytics_hourly/events_recent=none, treatment_program_instance*=SELECT-only). **RLS scoping check:** reminder_journal, treatment_program_instance{s,_stages,_stage_items}, product_analytics_{events_recent,user_hourly} have correct patient-scoping policies → grant is SAFE (mark-read pattern). EXCEPTIONS needing design review (NOT plain grant): `product_analytics_hourly` (org-GUC policy `c4_web_push_reminder_org`, RLS off) + `reminder_occurrence_history` (integrator-scoped policy, no patient branch). Predicates saved: scratchpad/isolation-flagged-rls-policies.txt. **FIX APPLIED (TEST + committed `ca8ba6ff3`):** overlay `deploy/postgres/patient-write-grants-role-pool-mismatch.sql` grants reminder_journal INSERT + treatment_program_instance* UPDATE (column-level, verified) → fixes reminder-DONE + treatment-program touch/complete. Analytics = FALSE POSITIVE (SECURITY DEFINER RPC already). **REMAINING:** snooze/skip write `reminder_occurrence_history` (RLS integrator-scoped, no patient branch) → needs SECURITY DEFINER RPC (owner-gated, mirror analytics pattern). Then resolve saas_isolation_events via coverage-complete. TODO-harden: wire this + mark-read grant into deploy overlay set |
| 3a | Track C drain/cutoff RR-PROOF-09 (stop exchange, drain outbox) | HIGH | Opus-audit | 🔄 | **TEST drain snapshot (read-only):** `projection_outbox` DRAINED (0 due, 0 dead; 3330 done/9 cancelled). Provider quiet (rubitime_records 0 recent-24h; total 91 rec/409 evt). **BUT `rubitime_create_retry_jobs` has 46 non-terminal** (22 pending+4 processing+20 dead) = retirement debris (no provider to process) → need owner-waive/archive, not drain-to-done. R6 proof doc not yet written |
| 3b | Remove `branchServiceId` (R3C-11, ~51 webapp files) | med | Sonnet+audit | ⏳ | gates R7 (booking_* catalog on keep-list until this done) |
| 3c | R7: archive + DROP rubitime/legacy tables on TEST + residual grants; close #839 | HIGH (destructive) | Opus-audit | ⏳ | 8 rubitime tables in `integrator.*` (archive: records/events; drop: api_throttle/create_retry_jobs/booking_profiles/branches/services/cooperators). BLOCKED on 3a proof + 3b + archive + static-no-ref + explicit owner per-batch go. Dedicated focused pass, NOT parallel |
| 4 | Track D D1→D10 (direct integrator→public writes; D1 scaffold ready) | HIGH | Opus-audit | ⏳ | |
| 5 | PII Task A — org col + backfill + write-stamp on `platform_user_contacts`/`user_phone_history` | HIGH (PII) | Opus-audit | 🟡 | **Enforcement DEPLOYED on TEST** — leak closed. Live policy `saas_bootstrap_hybrid_p0_8_6` = strict gated predicate under FORCE (relforcerowsecurity=t). Code wired: `rls-descriptor-model.mjs:205` scopingKind `bootstrap_hybrid_org_gated` for both tables; `p0-8-6-policy-targets.mjs` asserts per-table shapes; `renderBootstrapHybridOrgGatedPredicate` (rls-sql-renderer.mjs:504); overlay `phase4-locked-helper-rls-policies.sql`. contacts 0/3 NULL-org, phone_history 1/93. **TASK_A plan doc's "step 3 not done" is STALE — corrected.** REMAINING: flip-blocker runtime proof under live strict+FORCE (FB#1 bootstrap OTP/messenger phone-write; FB#1 close-prior UPDATE vs unique index for the 1 NULL-org row) |
| 6 | FORCE-RLS cutover on TEST (2-org/2-patient isolation smoke) | HIGH (tenant) | Opus-audit | 🟡 | **TEST already locked+FORCE.** env `DB_PRINCIPAL_CONTEXT_MODE=locked` (api+webapp); deploy hard-asserts FORCE-RLS wall (exit 0); relforcerowsecurity=t on sensitive tables; locked product smoke 22/22 incl. cross-tenant denies (doctor/clinic-admin health 403, global-admin.clinical-write.denied). REMAINING: explicit 2-org/2-patient who-sees-what evidence via `rehearse-multitenant-isolation.mjs` |
| 7 | Delivery-alerting P0/P-guard live fault-injection on TEST | med | Sonnet+audit | ⏳ | |
| 8 | Security: first Semgrep/Trivy triage; CSP decision; SVG-upload; CSRF-matcher scope | med | Sonnet+Opus | 🟡 | **Triaged (scanners actually run):** 0 exploitable Critical/High; Trivy 0, pnpm audit 0. Real: 1 hardening `crypto.ts:82` (pin `authTagLength:16` — not exploitable but ERROR-sev reds CI) + 2 RFC-6238 test-vector FPs need suppression + 39 noise. 3 owner-decision items have concrete recs (CSP default-src report-only rollout; SVG force Content-Disposition:attachment on presigned GET; CSRF build-time regression guard). Report: scratchpad/security-triage.md. TODO: apply crypto fix + FP suppress (small); owner sign-off on 3 |
| 9 | Card UI-5b body merge (Обзор/Записи/Коммуникации/Финансы) — owner visual acceptance | frontend | Sonnet+owner | ⏳ | BLOCKED owner-visual |
| D | Incremental TEST deploy to tip + locked product smoke green | HIGH | Opus | ✅ | TEST HEAD=`f7d1fa9b12a` (tip). deploy-test.sh exit 0. Locked product smoke **22/22 pass** incl. cross-tenant denies (doctor/clinic-admin system-health 403, global-admin.clinical-write.denied). All 5 services active. FORCE-RLS wall hard-asserted. Isolation diag-gate WARN-only → item #2 |

Legend: ⏳ todo · 🔄 in-progress · ✅ done+evidence · ⛔ owner-gated · 🟡 audit-pass-awaiting-owner

### Batch deploy 2 (2026-07-24, feat `cd6898db6`) — D1 + rubitime-queue rename + security fixes
- **Track D D1** (`b4fa18544`): integrator writes public identity/prefs directly (approach A); adversarial Opus audit no-blocker; 2 byte-parity fixes; suite 1372. **A7 live webhook verify in progress**, then tick WORK_ORDER D1.
- **Rubitime queue rename** (`f478cb546`): `rubitime_create_retry_jobs`→`message_retry_jobs` (owner: it was a legacy-named generic delivery queue, sloppy migration). Migration applied on TEST — verified `message_retry_jobs` exists, old name gone, 61 data rows intact. All refs/docs/gates updated.
- **Security fixes** (`cd6898db6`): pin GCM authTagLength=16 + suppress 2 RFC-6238 semgrep FPs.
- **Deploy result:** exit 0, HEAD=`cd6898db6f2`, 5 services active, **product smoke 22/22**, no NEW isolation events (grants clean). Isolation diag-gate still WARN (stale event; won't clear until snooze/skip fixed via D7).
- **Also on TEST earlier this run:** 46 stuck `message.deliver` jobs deleted (owner: rubitime test junk).

## Repo hygiene — Codex overnight leftovers (owner request 2026-07-24)
4 `codex/*` branches from cloud Codex (out of tokens) — all pushed to origin (0/0, nothing lost), NONE merged into feat.
Owner directive: consolidate the BEST of each into `feat` (feat = single dev branch); some work was redone vs feat.

| Branch | taskdb | Disposition (verified) | Action taken |
|--------|--------|------------------------|--------------|
| `codex/u5a-test-live-796` | #796 | **MERGE (clean additive)** — 11 files, 0 conflicts, unit test 7/7 | ✅ merged→feat `f444fe7bc`; worktree+local branch removed (in feat history) |
| `codex/task-985-smtp-otp` | #985 | **SUPERSEDED** — byte-identical to feat + feat adds `58c577ef0` locked-principal binding; nothing to take | ✅ local branch+worktree removed; origin kept |
| `codex/patient-mark-read-988` | #988 | **feat's fix wins** — grant covers all 3 methods (proven live); branch definer covers 1 & is mutually-exclusive with grant. Route.ts 404-guard = behavioral change, NOT merged (needs product call) | ✅ worktree removed; branch KEPT (deferred tighter-scoping redesign) |
| `codex/direct-public-d1-987` | #987 | **NEEDS OWNER + AUDIT** — competing design (DB SECURITY DEFINER fn) vs feat TS scaffold; ungated definer + no live-TEST proof | ⛔ branch+worktree PRESERVED; owner decision queued (taskdb #987) |

All 4 branches were fully on origin (0 unpushed) — nothing lost. u5a's 10-file uncommitted WIP (07-23 18:12) preserved (committed → now in feat history via merge).
**feat now `f444fe7bc`, ahead of origin/feat by 4 (local; reaches TEST via deploy bundle, no push to main/test).**

## Owner decisions to collect (single sheet — deliver at end)
- SMTP creds for TEST (login/email path acceptance).
- age-key + authorization for backup DR-drill (DR-01/02).
- Session TTL (D1 revoke; recommend 7 days staff+admin, patient 90 unchanged) — taskdb #970.
- Paid billing in first prod scope? (yes/no — gates C5B/C/D + store).
- Full CSP `default-src` signoff.
- (carry from taskdb waiting: #805 public-booking accept, #818 mock-pay env-gate, #821 TEST acceptance, #848 SCH-G5,
  #881 rubitime/tg cred rotation, #913 NTF-01 matrix, #963 UI-6b contract, #964 UI-7a scheduled msgs.)
