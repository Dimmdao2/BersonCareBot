# Process audit log

## 2026-07-22 — `ui-finish-process-audit-1`

- Auditor: external read-only process auditor, Claude Opus 4.8.
- Verdict: `WARN` (conditional pass; no hard stop).
- Verified: Tracks A/B/C use separate worktrees and branches; every current track commit is pushed; `main` and `test` are untouched; commits are scoped; no track is falsely marked complete; destructive TEST work is still gated.
- Evidence boundary: the auditor could inspect repository and git metadata, but its sandbox could not read taskdb, `/home/dev/brain`, or transient live PNG evidence.
- Required correction: persist checkbox-by-checkbox evidence matrices in this initiative directory; keep all tracks `doing` until code, test, runtime/live and owner gates are genuinely satisfied; run one full CI on the integrated SHA before acceptance.
- Orchestrator action: accepted. Track A round 2 was already commissioned to produce the complete durable denominator/matrix. Track B and C remain gated by independent audits. No TEST reset/drop has run. The four unrelated registered worktrees are not removed because their ownership/activity is outside this work order and was not verifiable by the auditor.
- Process status after audit: continue; no hard stop.

## 2026-07-22 — owner correction on batch sizing

- Decision: a full plan denominator may be inventoried mechanically, but implementation and substantive audit briefs must be sized to one coherent page/block or one tightly coupled contract boundary.
- Action: the 167-row Track A matrix was retained as an evidence-only census; its implementation batch is limited to the Today/Clients/Messages list contract. The broad Track B fix and Track C audit were interrupted before commit and split into bounded sequential substages.
- Track B split: email-role/fail-closed setting read; atomic OTP consume; U9A mirror whitelist; narrow PWA/push identity guard and owner handoff.
- Track C split: canonical booking code/caller/test audit; separate R5–R7 provenance/runtime/owner-gate audit.

## 2026-07-22 — owner decision on DEV/TEST cadence

- PROD is a separate server and remains outside this work order.
- Normal verification uses DEV where fast local feedback is material, then an incremental TEST deployment of a coherent integrated milestone. TEST keeps its current database and receives only required forward migrations.
- Do not pull a fresh PROD dump or repeat a full SaaS reset, cutover, or backfill for routine verification.
- Do not deploy every small commit mechanically: use targeted checks per bounded substage, one accumulated full CI gate, then TEST where environment-specific proof is required (DB grants/migrations, OTP, PWA/push, runtime boundaries).

## 2026-07-22 — Track C R5–R7 provenance audit

- Audit run: `rubitime-981-c2-ops-audit`, read-only against `471fac8fd`.
- Verdict: `WARN`; operational completion is not done.
- Atomic denominator: 48 rows — 4 evidence-already-real, 18 code-only, 8 TEST-runtime-needed, 11 owner-live-needed, 4 stale/contradictory and 3 deferred by the current non-destructive cadence.
- Durable historical evidence: `docs/archive/2026-07-rubitime-retirement/TRACK_C_R5_R7_EVIDENCE_MATRIX.md` records the then-open rows; it is no longer a current gate.
- Current static proof is deliberately narrow: mounted Rubitime routes, integrator runtime imports and API-client tokens are zero; this does not prove cutoff, queues drained, fresh CSV reconciliation, archive/drop or rollback.
- Next executable gate remains integrated-SHA checks, one accumulated full CI, incremental TEST deploy and runtime smoke/evidence. R7 destructive work remains owner-gated and is not part of routine TEST verification.

## 2026-07-29 — Rubitime retirement archived

- Rubitime was retired on 2026-07-27.
- Owner: «Rubitime у нас больше нет — убирать в архив явно».
- Track C plans, evidence and one-shot artifacts moved to `docs/archive/2026-07-rubitime-retirement/`.
- The old R5–R7 matrix and runbooks are historical evidence, not executable gates.

## 2026-07-22 — owner-confirmed execution and parallelism model

- The roadmap is navigation and dependency context, not an executable worker brief. A worker starts only from the
  current detailed owner checklist after the latest owner rulings, supersession state, taskdb status and current code
  have been reconciled.
- One worker receives one bounded semantic block. A broad denominator may be inventoried mechanically, but it is not
  handed to one implementation or substantive audit worker.
- Up to three independent product streams may run concurrently in isolated worktrees. UI, commercial work and
  onboarding/communications may overlap only when their files, domain contracts and prerequisites do not.
- Shared contracts, the same stage's worker/auditor cycle, heavy CI, the single live DEV/TEST runtime, migrations and
  deployments remain serialized. An auditor gates the same owner checklist and cannot create adjacent work from an
  unplanned finding.
- Completion is reported as a user-visible product result. Code-only, TEST-runtime and owner-live gates remain
  distinct; `done` is not owner acceptance.

## 2026-07-22 — owner ruling on overnight blockers

- A local blocker does not stop the orchestration run: record the exact residual and move the available stream to
  another independent dependency-ready block.
- Treat a stage as owner-blocked only when it explicitly requires the owner's decision/access, or when the same
  defect repeats in an audit→fix loop without closing an owner-plan checkbox. Everything else remains an executor
  problem and must continue without waiting for the owner.
- For one-off TEST integration setup, prefer the existing Settings/updateSetting path. The owner permits a bounded
  TEST-only manual DB value when materially simpler, provided mirror/tenant invariants, no-secret output and rollback
  are preserved. PROD and production credentials remain outside this work order.

## 2026-07-22 — `ui-finish-process-audit-2`

- Auditor: external read-only process auditor, Claude Opus 4.8; artifact:
  `/home/dev/brain/runs/agent-port/ui-finish-process-audit-2.json`.
- Verdict: `WARN` / conditional PASS; no hard stop, no roadmap-summary execution, no fake-done, no scope drift and no
  repeated zero-closure loop. Bounded checklist provenance, isolated parallelism, CI cadence and DEV/TEST/PROD
  boundaries passed.
- Material finding: merged task worktrees had not been pruned. Orchestrator action completed during the audit:
  verified merged ancestry and clean state, then removed the fixture, owner-email, Rubitime-provenance,
  public-slots-smoke and UI worktrees/local branches. Unrelated worktrees and unverified unmerged Rubitime branches
  were preserved.
- Follow-up: the two remaining Rubitime task branches were patch-equivalent to commits already integrated on the
  feature branch (`git cherry` returned `-` for both); after clean-state verification their worktrees/local branches
  were also removed. Four unrelated worktrees were preserved because their ownership is outside this work order.
- Evidence correction: the 21/22 incremental TEST smoke and fail-closed stop are now recorded in
  `TEST_DEPLOY_EVIDENCE_2026-07-22.md` instead of remaining only in transient orchestration context.
- Continuing rule: do not repeat the 167-row census. Advance only bounded residuals and keep owner-closed status at
  zero until the owner accepts live evidence.

## 2026-07-23 — `ui-finish-process-audit-3`

- Auditor: external read-only Claude Opus 4.8 (`claude-opus-4-8`, `xhigh`); artifact:
  `/home/dev/brain/runs/agent-port/ui-finish-process-audit-3.json`.
- Verdict: **PASS (conditional)**. The continuation used the exact linked U6A checklist, moderate isolated packets,
  serialized the integration gate/TEST deploy, did not create work from roadmap summaries, did not claim owner
  acceptance, and stopped only after executable U6A residuals were exhausted into explicit owner/live/dependency
  gates.
- Worktree/branch hygiene and DEV/TEST/PROD boundaries passed. Completed patch-equivalent worktrees were pruned;
  four unrelated pre-existing worktrees and the one unverified non-patch-equivalent UI branch were preserved.
- Carry-forward N1: cite the later U6B route addendum that supersedes the old O-1. Action completed in
  `U6A_PUBLIC_ENTRY_RECONCILIATION_2026-07-23.md`: exact roadmap section and dated addendum are now named.
- Carry-forward N2: run final full repo CI before owner acceptance. This remains an explicit final gate, not a reason
  to repeat full CI for the bounded two-commit delta.
- Process status: no hard stop, fake-done, zero-checkbox loop or audit-created product scope.
