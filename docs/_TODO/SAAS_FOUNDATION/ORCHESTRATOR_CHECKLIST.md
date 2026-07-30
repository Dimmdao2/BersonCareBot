# Multitenant Flip Orchestrator Checklist

Status: active operating checklist for the full multitenant flip work, not only Phase 2.

Cadence:

- Re-check this checklist at least every 30 minutes of active work and before every commit.
- Record material decisions, blockers, validation, audits, and commits in the canonical plan/relevant phase log.
  Keep taskdb to title, status, plan link, optional concise description and service fields.

Scope discipline:

- Keep the objective as the full multitenant flip through completion, not a smaller passing subset.
- Treat any roadmap/stage summary as a pointer: read every linked detailed authority, quote each in-scope atomic
  owner checkbox in worker and auditor briefs, and maintain the latest supersession map.
- Work in bounded slices: brief -> worker/subagent -> lead integration -> validation -> independent audit -> commit.
- Do not mix unrelated slices in one commit.
- Do not start broad next-slice implementation while the current slice has dirty uncommitted work, unless the current slice is explicitly parked.

Orchestration:

- Lead owns scope, branch hygiene, taskdb/docs, validation choice, audit routing, and final verdict.
- Lead verifies a per-checkbox matrix with code/test/runtime evidence or an exact deferred/blocker reason. Aggregate
  worker `done` or audit `PASS` cannot close a slice, plan/roadmap/LOG, or taskdb while a referenced checkbox is open;
  only an explicit owner defer/cancel with link and reason may close that row.
- Delegate implementation or complex investigation to worker/subagents when the slice is non-trivial.
- Use Claude Opus for final important audits unless the owner explicitly allows Sol as the final gate.
- Sol/deep Codex is acceptable for intermediate audit or specialized heavy analysis.
- Do not silently self-audit important security/database changes.
- Audit depth is risk-sized: presentation/layout/text/mechanical work gets worker + one independent audit, without
  serial nit-picking rounds. Its `FAIL/BLOCKED` stops the slice without automatic correction/re-audit. Multi-round
  adversarial audit is reserved for high-risk identity/auth/tenant/security/migration/money/data scope and remains
  capped by `docs/ORCHESTRATION_BINDINGS.md`; anyone who changes code in that correction path needs a different
  independent auditor to verify the fix.
- Findings outside the owner checklist are regressions/repo-rule issues, owner questions, or recommendations; they
  do not become new scope automatically.

Database safety:

- Never validate on prod/test/dev databases.
- Use scratch databases or disposable prod-dump copies only.
- Scratch DB names must be clearly disposable, e.g. `bcb_saas_*_scratch_*`, and cleanup must be verified.
- Do not print secrets or connect using prod env files.

Git hygiene:

- Stay on the active branch unless owner says otherwise.
- Commit completed slices frequently after validation and audit.
- Do not push without explicit approval.
- Keep worktree clean between completed slices.
- Keep completed branch work merged into the single active branch regularly; clean stale worked branches when safe.
- Never revert unrelated user/worktree changes.

Validation:

- Run focused static checks and scratch smokes for the changed slice.
- Run `node scripts/check-saas-db-regression.mjs` when SaaS DB guard artifacts change.
- Use full CI/typecheck/lint only when the slice risk requires it; delegate mechanical run/fix loops.
- Report validation honestly and do not claim unrun tests passed.

Checkpoint Questions:

- Am I still driving the full flip objective, not just the nearest easy subtask?
- Is this slice the right size: neither tiny busywork nor an unreviewable blob?
- Is a worker/subagent doing implementation/audit where appropriate?
- Is every DB validation scratch/disposable-only?
- Is the worktree clean or intentionally dirty for exactly one active slice?
- Are docs/taskdb updated with current evidence?
- Does the audit brief quote the same full linked checklist scope as the worker brief?
- Is the risk-sized independent audit complete, with one evidence row per checkbox, before commit?
