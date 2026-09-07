# Test or view classification — continue interrupted custom-domain readiness audit (#787)

Continue the independent audit of candidate
`a547ecc0ce585c791ab4fc55a7f3aa4582b6f960` in
`/home/dev/dev-projects/bcb-wt-branding-domain-core-20260907`.

The first Sol/xhigh auditor was stopped by a system limit after 42 minutes. Do not restart its broad
discovery. Its uncommitted work is intentionally present:

- four modified behavior-test files;
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_READINESS_2026-09-07.md`.

Read the heading map and the applicable `AGENTS.md` sections before actions, especially §§10a, 10b and
24.4–24.7 in full. Read the original brief
`/home/dev/dev-projects/BersonCareBot/runs/branding-domain-core-readiness-audit-brief-20260907.md`, then the
existing audit draft and uncommitted diff. The original brief remains the authority and scope.

## Required continuation

1. Treat the already-recorded blind kill-set as the completed pre-test classification. Inspect every
   retained test against §§10a/10b. Delete or rewrite any implementation/call-count/shape oracle; retain
   only expensive, silent, observable behavior.
2. Run the four affected test files first. For each retained new independent behavior class, record the
   prior auditor's fault-injection evidence if it is recoverable from the worktree/run record; otherwise
   perform one bounded temporary production mutation, prove the intended assertion turns red, and revert
   it immediately. Never leave production code modified.
3. Finish the original brief's remaining non-test views and exact validation gates. Reuse green evidence
   already present only when it is tied to candidate SHA; otherwise run the focused command. No TEST/PROD
   host, DNS, certificate, firewall, service, secret or live-clinic action.
4. Explicitly decide the reachable cases already highlighted by the kill-set: later health failure of an
   active binding; owner recovery from `failed`/`dns_ready`/`suspended`; exact apex DNS destination rather
   than accepting a mixed correct+wrong answer; and removal of false "later verifier" prose. These are
   findings only when they violate the active plan/repo rule with a concrete scenario and evidence.
5. Complete the audit artifact with exact commands/results, fault injections, confirmation that all
   temporary product edits were reverted, live limits, and binary PASS/FAIL. Update the existing queue
   row/verdict according to repo convention.
6. You are an auditor: do not fix product code. Commit only the four reviewed test files that remain,
   the audit artifact, and the queue verdict. Stage explicit paths, never `git add -A`; do not push or land.

Run every long command in the foreground and wait for it. Before ending, prove `git status` contains no
uncommitted auditor work and no temporary production changes. Report the commit SHA and exact remaining
MUST FIX items, if any.
