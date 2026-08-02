# Billing small integration — combined CI (2026-08-02)

## Accepted inputs

- registration tariff hardening, audit race oracle and green fix: `65d9196df`;
- TEST YooKassa ingress and independent audit: `4d655d4be`;
- YooKassa Idempotence-Key wire fix and independent audit: `81aa4ae9a`.

All three are ancestors of integration product head `4ebae643f`. Migration `0308` / `wt/saas-seat-billing` is not
an ancestor and was not included.

## Integration correction

The first integration preflight stopped before tests because the registration merge had been created in the local
`feat` worktree instead of the new integration worktree. Nothing was pushed. The exact merge was brought into
`wt/billing-small-integration`, the local `feat` ref was restored to `origin/feat/doctor-ui-rebuild`, and ancestry was
rechecked: all three accepted heads returned `ancestor_rc=0` only in the integration branch.

The first actual combined CI stopped at lint:

```text
check-saas-a2-nginx-forwarded-host.mjs:94:39
Unnecessary escape character: \{  no-useless-escape
```

Commit `4ebae643f` removes only that unnecessary regex escape. Scoped ESLint, checker self-test `4/4`, generated
config dry-run and `git diff --check` then passed.

## Final combined gate

Exact command on `4ebae643f`:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm install --frozen-lockfile && pnpm run ci"
```

Result: **PASS**, exit 0, 468 seconds.

- repository lint, DB chokepoint, raw-SQL, runner visibility, migration journal and media-door gates: PASS;
- all workspace typechecks: PASS;
- integrator: 36 files passed / 3 skipped; 237 tests passed / 4 expected-fail / 9 skipped;
- webapp: 134 files passed / 2 skipped; 602 tests passed / 6 skipped;
- media-worker: 1 file / 5 tests PASS;
- integrator and Next.js production builds: PASS; known Turbopack NFT trace warning did not fail the build;
- full SaaS migration/product-smoke/audit tail and registry production dependency audit: PASS.

No DB, migration, nginx apply, deploy, DEV/TEST/PROD action or secret read/output occurred. B0.3 remains open until
the accepted nginx generator is applied on TEST and a real test-card payment reaches capture through the public
webhook.

