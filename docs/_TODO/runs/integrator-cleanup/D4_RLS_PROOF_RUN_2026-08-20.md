# D4 — live RLS proof run on TEST (2026-08-20)

## Result

**NOT DONE — the real proof could not be started because the named TEST runtime does not provide `DB_PRINCIPAL_SIGNING_SECRET`.** No product code, test files, migrations, privileges, or databases were changed. PROD was not contacted.

The intended target was verified before the run: the TEST integrator port identifies as
`bersoncarebot_test|bcb_test_integrator_login`. This is the login and database required by the test header.

## Exact commands run

All commands ran in the foreground. Secrets were loaded only inside the `deploy` child process and never printed; connection-string values and any secret values are redacted by omission.

```bash
# Baseline and post-run cleanup-scope count (admin socket; TEST only)
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bersoncarebot_test -v ON_ERROR_STOP=1 -A -t -q \
  -c "SELECT count(*) FROM public.reminder_rules WHERE integrator_rule_id LIKE 'rls-it-bare-%' OR integrator_rule_id LIKE 'rls-it-unfixed-%' OR integrator_rule_id LIKE 'rls-it-fixed-%';"

# The first attempted location was inaccessible to the TEST runtime account.
sudo -n -u deploy env USE_REAL_DATABASE=1 RUN_REMINDER_RULES_RLS_TEST=1 \
  DB_PRINCIPAL_CONTEXT_MODE=locked bash -lc '
  cd /home/dev/dev-projects/bcb-wt-d4-rls-proof-20260820/apps/integrator
  # source /opt/env/bersoncarebot/api.test; DATABASE_URL="$INTEGRATOR_DB_URL"; pnpm exec vitest ...
'

# Exact test file comparison before switching to the canonical TEST checkout.
sha256sum apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts
sudo -n -u deploy sha256sum \
  /opt/projects/bersoncarebot-test/apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts

# Intended live proof from the canonical TEST checkout.
sudo -n -u deploy env USE_REAL_DATABASE=1 RUN_REMINDER_RULES_RLS_TEST=1 \
  DB_PRINCIPAL_CONTEXT_MODE=locked bash -lc '
  set -Eeuo pipefail
  cd /opt/projects/bersoncarebot-test/apps/integrator
  set -a; source /opt/env/bersoncarebot/api.test; set +a
  : "${INTEGRATOR_DB_URL:?api.test must define INTEGRATOR_DB_URL}"
  : "${DB_PRINCIPAL_SIGNING_SECRET:?api.test must define DB_PRINCIPAL_SIGNING_SECRET}"
  runtime_identity="$(PGDATABASE="$INTEGRATOR_DB_URL" psql -X -v ON_ERROR_STOP=1 -A -t -q -c "SELECT current_database() || '\''|'\'' || current_user;")"
  [ "$runtime_identity" = "bersoncarebot_test|bcb_test_integrator_login" ]
  export DATABASE_URL="$INTEGRATOR_DB_URL"
  pnpm exec vitest run src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts
'

# Non-secret key-presence check under the same runtime account.
sudo -n -u deploy awk -F= '/^(INTEGRATOR_DB_URL|DATABASE_URL|DB_PRINCIPAL_SIGNING_SECRET|DB_PRINCIPAL_CONTEXT_MODE)=/{print $1}' \
  /opt/env/bersoncarebot/api.test /opt/env/bersoncarebot/webapp.test
```

## Observations and exit codes

| Check | Outcome |
| --- | --- |
| TEST target identity | PASS: `bersoncarebot_test|bcb_test_integrator_login` |
| Source test equivalence | PASS: both paths SHA-256 `aed555542f756da7ea5be44b8d3da97111e1c1811c3ab311eb455800e019da4b` |
| Worktree invocation | Exit `1` before Vitest: `deploy` cannot traverse `/home/dev/dev-projects/bcb-wt-d4-rls-proof-20260820/apps/integrator` |
| Canonical TEST-checkout invocation | Exit `1` before Vitest: `DB_PRINCIPAL_SIGNING_SECRET: api.test must define DB_PRINCIPAL_SIGNING_SECRET` |
| PostgreSQL SQLSTATE | None: no PostgreSQL statement from the test body was reached |

The TEST env key check found:

- `api.test`: `DB_PRINCIPAL_CONTEXT_MODE`, `INTEGRATOR_DB_URL`
- `webapp.test`: `DB_PRINCIPAL_CONTEXT_MODE`

Neither contains `DB_PRINCIPAL_SIGNING_SECRET`; the only TEST-named env files visible to `deploy` are `api.test`, `webapp.test`, `media-worker.test`, and `saas-test-fixture.env`. The deploy script’s own signing-secret preflight also names `api.test` and `webapp.test` as the sources, so no alternate credential path was invented.

## Required three assertions

| Assertion | Outcome |
| --- | --- |
| Bare integrator login without principal is denied | NOT RUN |
| Integrator principal without org re-wrap is denied | NOT RUN |
| Same principal with org re-wrap writes a row with non-NULL `organization_id` | NOT RUN |

## Cleanup confirmation

The cleanup-scope query for all three test ID prefixes returned **0 before** the attempted run and **0 after** it (exit `0` for each `psql` command). Since Vitest never started, it created no rows; the marker scope is back at its initial count.

## NOT DONE

The live behavioral proof remains unexecuted. It requires a TEST `DB_PRINCIPAL_SIGNING_SECRET` made available through the repo’s canonical TEST runtime env path, while preserving `DB_PRINCIPAL_CONTEXT_MODE=locked` and the `bcb_test_integrator_login` connection. No substitute database, PROD connection, weakened `assertTestDb`, or fabricated passing result was used.
