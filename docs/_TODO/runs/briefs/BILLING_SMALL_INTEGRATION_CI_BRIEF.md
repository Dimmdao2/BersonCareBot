# Billing small integration — merge/CI brief

## Authority and exact inputs

Lead-only integration stage under `AGENTS.md` §7/§9/§24.8. Start from current `feat/doctor-ui-rebuild` in
`wt/billing-small-integration`; merge these independently accepted heads without squashing or rewriting product:

- registration tariff hardening + saved race audit/fix: `65d9196df`;
- TEST YooKassa ingress + independent audit: `4d655d4be`;
- YooKassa Idempotence-Key limit + independent audit: `81aa4ae9a`.

The parallel `wt/saas-seat-billing` / migration `0308` is not part of this integration and must not be touched.

Источник оракула: `AGENTS.md` §24.8 — «Ветки принимаются по одной: diff/evidence → требуемые проверки →
`tools/orch-launch.sh land` → push разрешённой интеграционной ветки».

## Work and evidence

- Merge current feat into the integration worktree first, then merge exact accepted heads. Resolve only real merge
  conflicts; no product redesign, migration, journal or plan-checkbox closure.
- Verify all three accepted product/audit diffs are present and no branch-only unrelated path entered.
- Run focused union checks: registration disposable smoke + org-entitlements test; nginx checker self-test + repo
  dry-run/bash syntax; YooKassa provider identity tests + scoped lint/typecheck/raw-SQL/diff.
- Then run one exact combined full CI through the host lock:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm install --frozen-lockfile && pnpm run ci"
```

- If CI exposes a concrete integration regression, fix only that regression on this integration branch, record exact
  evidence and keep accepted behavior. No new blind audit for the same surfaces.
- No nginx apply, deploy, DB/migration, DEV/TEST/PROD action, secret read/output or push from a worker.

Deliver a clean integration head and one report under `docs/_TODO/runs/billing/` with exact commits, commands/counts,
CI result and remaining live TEST limitation. Lead performs `tools/orch-launch.sh land`, pushes feat, then removes the
three source worktrees/branches including accidental old remotes only after ancestry checks.

