# Independent audit — retired settings roots in active SaaS artifacts

## Тест или взгляд

Read `AGENTS.md` completely where routed, then read §10a, §10b and §24 before inspection. This stage is primarily
**качество разового действия**: two retired relations must no longer participate in current taxonomy, generators,
checked-in SQL or executable audit. Prove that by reading the final diff, tracing generator consumers, exact active
search, byte-sync checks and the current audit command. Do not invent source-text tests. Existing executable
checker/self-test behavior may be rerun; do not add a new test unless you identify a concrete expensive, silent,
repeatable regression that cannot be protected more cheaply.

## Authority and candidate

- `AGENTS.md` §4: settings live only in `public.system_settings`; no second settings storage or mirror exists.
- Implementation brief:
  `docs/_TODO/runs/integrator-cleanup/TRACK_D_RETIRED_SETTINGS_SAAS_ARTIFACTS_FIX_BRIEF_2026-08-24.md`.
- Candidate implementation commit: `a9f73e9e617c1629718e2f4b15d5eccb331abe49` on
  `wt/track-d-retired-settings-saas-artifacts-20260824`.
- Triggering integration fact: the prior full CI reached its final `pnpm run audit` step and failed because
  `tiers-218.tsv` still asserted that `public.app_runtime_settings` and
  `public.app_runtime_settings_audit` existed after their deliberate retirement.

## Required independent checks

1. Inspect the complete candidate diff and classify every changed file as active source, current input, or generated
   output. Verify generated SQL was produced by its existing generator and still byte-matches it.
2. Inventory active executable/current generated references to both retired relations. Historical migrations,
   archived plans and past evidence may mention them and must not be rewritten. A current reference is a finding only
   if a reachable checker/generator/deploy verifier still treats the relation as present.
3. Pay special attention to `schema-pre.sql` / `schema-post.sql` and any similarly named cutover snapshots left
   unchanged by the worker. Determine from their actual consumers whether they are historical/named-DEV snapshots
   that should remain untouched or active artifacts that would reintroduce/fail on the retired relations. Report the
   concrete reachable consequence; do not decide from the filename alone.
4. Verify the simplification did not weaken the canonical settings boundary:
   - patients/nonstaff cannot directly read or write `public.system_settings` or its audit;
   - the existing staff/platform/config-reader roles retain exactly their intended current access;
   - global default plus organization override semantics and audit ownership are not silently replaced by a generic
     allow-all BOOTSTRAP descriptor;
   - generated P0.5/P0.8/P0.9/S5/U9A/Phase-4 artifacts remain mutually consistent.
5. Run the directly affected checker/self-test and byte-sync commands, targeted lint if needed, and `pnpm run audit`.
   Do not rerun full CI: prior tests and builds are already green and this is continuation from the failed audit step.
6. Verify the diff has no product runtime, migration, schema, domain, environment, live DB or deployment action and
   creates no compatibility table/alias/second settings path.

## Verdict and artifact

Write
`docs/_TODO/runs/integrator-cleanup/TRACK_D_RETIRED_SETTINGS_SAAS_ARTIFACTS_AUDIT_2026-08-24.md` with:

- `PASS` or `FAIL`;
- each named authority check and evidence command/result;
- exact changed-file and consumer inspection;
- the `schema-pre/schema-post` decision with reachable-path evidence;
- any finding only when it names a real violated requirement, reachable scenario and impact;
- confirmation that no temporary fault injection or product change remains.

You are an auditor, not the fixer. Do not repair product/generator code. You may commit only the audit artifact (and
an intentional acceptance test if the strict §10a/§10b test gate genuinely requires one). Commit all allowed audit
files before ending the single turn; use explicit staging paths, never `git add -A`. Report the audit commit SHA.
