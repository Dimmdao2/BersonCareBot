# TaskDB #996 — executable cutover gate independent re-audit (2026-08-15)

## Verdict: PASS

Audited fixer commit: `c997d6336aeba8cd2f3be49cc1b0c082bb59a733`.

Scope was limited to the exact saved executable kill-set, cutover-preflight wiring and artifact/process
cleanliness. The prior independent re-audit remains the authority for the broad relation/data inspection;
it found no open issue other than executable fault sensitivity.

## Executable replay

Command:

```bash
pnpm run check:prod-to-target-cutover
```

Result (exit 0):

```text
ok schema-pre.sql
ok schema-post.sql
ok ledgers-and-baseline.sql
ok runtime-settings.sql
prod-to-target cutover snapshot matches current DEV schema B
PASS executable cutover systemic gate
```

The gate reads the product files `deploy/postgres/prod-to-target-cutover-data.sql` and
`apps/webapp/scripts/consolidate-owner-identity.sql`, starts a private socket-only PostgreSQL cluster, executes
the product SQL slices, and queries the resulting rows for membership, F1–F5 assertions. It does not connect to
DEV, TEST or PROD.

Exact six-mutant replay command:

```bash
for mutant in membership f1 f2 f3 f4 f5; do
  node scripts/prod-to-target-cutover-executable-gate.mjs --mutant="$mutant"
done
```

Result (exit 0; each `RED` is the required rejection):

```text
RED membership: F2-F4 and membership product SQL: NOTICE:  table "cutover_patient_fact_registry" does not exist, skipping
RED f1: F1 product SQL: ERROR:  specialist reference migration drift in public.be_appointments: duplicate 2, total 2, canonical 0
RED f2: F2-F4 and membership product SQL: ERROR:  reminder history identity disposition drift: source 2, target 2, attributable 1, attributed 0, honest null 2, mismatched 1
RED f3: merged live reference
RED f4: F2-F4 and membership product SQL: ERROR:  message draft preservation drift: source 1, target 1, content mismatches 1
RED f5: delivery attribution
```

Thus membership and each saved F1–F5 actual-SQL mutation independently turns the acceptance gate red.

## Wiring and acceptance shape

Command:

```bash
nl -ba package.json | sed -n '47,54p'
nl -ba deploy/host/deploy-test-full-reset.sh | sed -n '16,34p'
```

Result: `check:prod-to-target-cutover` runs snapshot `--check` followed by
`scripts/prod-to-target-cutover-executable-gate.mjs`; `deploy-test-full-reset.sh` invokes that check at lines
25–29 before `exec bash "$SCRIPT_DIR/deploy-test-saas.sh" "$@"` at line 32. The executable preflight therefore
precedes the destructive reset hand-off.

Command:

```bash
sed -n '1,180p' scripts/prod-to-target-cutover-contract.test.mjs
rg -n -i "toy|marker|source.{0,40}(marker|phrase)|assert\\.(match|doesNotMatch)" \
  scripts/prod-to-target-cutover-contract.test.mjs \
  scripts/prod-to-target-cutover-executable-gate.mjs || true
rg -n "function productSlices|read\\('deploy/postgres/prod-to-target-cutover-data.sql'|read\\('apps/webapp/scripts/consolidate-owner-identity.sql'|function assertState|membership count|specialist rewrite|reminder attribution|merged live reference|draft content|delivery attribution" \
  scripts/prod-to-target-cutover-executable-gate.mjs
```

Result: the contract test invokes the executable gate once unmutated and once per saved mutant; it has no
membership/F1–F5 SQL-marker or toy-array acceptance. The executable gate reads product SQL and asserts real
PostgreSQL result rows for the six acceptance classes. The fixture relation list only defines disposable schema
shape; it is not an acceptance substitute.

## Legacy census and cleanup

Commands:

```bash
node scripts/check-legacy-access-census.mjs
node scripts/check-legacy-access-census.mjs --self-test
find /tmp -maxdepth 1 -type d \( -name 'bcb_cutover_gate_*' -o -name 'bcb_cutover_mutant_*' \) -print
pgrep -af '^postgres .*bcb_cutover_gate_' || true
git diff --check
git status --short
```

Results:

```text
legacy access census: PASS (7 active roots; 7 exact transition files)
legacy access census self-test: PASS
```

The temporary-directory and PostgreSQL-process checks produced no output. `git diff --check` passed. Before this
artifact was created, `git status --short` was empty; no product SQL was changed by the replay.
