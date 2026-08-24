# Track D — remove retired settings roots from active SaaS artifacts

## Role and authority

You are the implementation worker for one bounded CI-repair stage. Read `AGENTS.md` first, especially the route,
§4, §4a, §9, §10 and §24. The binding product rule is `AGENTS.md` §4: settings live only in
`public.system_settings`; `public.app_runtime_settings` and `public.app_runtime_settings_audit` were deliberately
retired by `apps/webapp/db/drizzle-migrations/20260824T120000_make_system_settings_single_root.sql`.

The integration SHA before this stage passed lint, typecheck, all webapp/integrator/media tests, DB privileges,
both builds, and the DEV migration preflight. Its final `pnpm run audit` then failed at
`SAAS P0.10 tier completeness`: `tiers-218.tsv` still names the two retired relations. Inspection also found that
the same retired split is encoded in several active SaaS checker/generator sources. Fix the whole active class in
one coherent pass, not only the first failing TSV row.

## Required outcome

1. Inventory every **active, executable or current generated** reference to
   `public.app_runtime_settings` / `public.app_runtime_settings_audit` that can affect current audit, role/grant,
   RLS descriptor, checked-in SQL generation, or deployment verification.
2. Remove the retired relation-specific branches and classifications. Where the current machinery still needs a
   settings relation, make it describe the canonical `public.system_settings` semantics instead of introducing a
   second path. Prefer simplifying/parameterising the existing common model; do not add a new wrapper,
   compatibility root, exception list, or parallel abstraction.
3. Update current taxonomy/input data and regenerate checked-in artifacts with their existing generators. Never
   hand-edit a generated artifact when the repository already has a generator.
4. Run the directly relevant checker/generator self-tests and `pnpm run audit`. If the audit exposes another
   failure from the same retired-settings class, finish that entire class in this same pass.
5. Commit every task-related file before ending the turn, with explicit paths only (never `git add -A`). Report the
   commit SHA, changed-file list, exact validation commands and results.

Likely active starting points include `docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv` and scripts under
`docs/_TODO/SAAS_FOUNDATION/scripts/` for descriptor modelling, role splits/grants, S5 config-reader/settings
security, U9A platform settings, and phase-4/P0.9 enforcement. Treat this as a starting inventory, not an exhaustive
allowlist.

## Out of scope / prohibitions

- Do not change product runtime code, migrations, schema definitions, the live DEV/TEST databases, deployment,
  domains, environment files, or any Therapysto domain-cutover branch.
- Do not restore either retired table, its policies, grants, sync path, or a compatibility alias.
- Do not weaken current protection of `public.system_settings`; preserve its existing role/tenant boundary and the
  owner decision that all writes use the single service path.
- Do not rewrite historical migrations, archived plans, completed logs, audit reports, or past evidence merely
  because they mention the old tables. Historical statements are evidence, not active execution inputs.
- Do not expand into unrelated SaaS cleanup or speculative hardening. A finding outside this retired-settings class
  is reported with evidence, not fixed.
- Do not rerun full CI: prior tests/builds are green and §9 requires continuation from the failed audit step.
- Do not end while a foreground command is still running. There is no second agent turn.

## Acceptance

- `pnpm run audit` exits zero.
- Every directly affected checker/generator self-test exits zero.
- Generated artifacts match their generators.
- An exact active-scope search shows no executable/current generated reference that still treats either retired
  relation as present. Historical mentions remain untouched.
- The diff contains no product/runtime/migration/domain/deploy change and no new settings storage path.
