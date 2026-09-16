# Worker brief — #787 Berson Care TEST custom domain closure

## Authority and required reading

- Work only in `/home/dev/dev-projects/bcb-wt-berson-test-custom-domain-20260909` on `wt/berson-test-custom-domain-20260909`.
- Before every action obey the heading-map gate in `AGENTS.md`. Read the complete relevant sections: §1 (including server conventions, migration/grant rules and checklist/commit states), §1a, §1b, §4a, §5, §7, §9–§10b, §12 and §24. Read `README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, and the current owner authority in `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.2a plus B2/B8/C5a.
- Later owner decision, 09.09.2026, overrides older prose: `test.bersoncare.ru` is no longer a legacy redirect. It is the Berson Care branded TEST patient custom domain, exact apex binding (`placement=apex`, `baseDomain=test.bersoncare.ru`). PROD remains `app.bersoncare.ru` and must not be touched.
- Start with `code-search` and inspect the existing custom-domain path end to end before editing. Extend the existing binding/resolver/host deployment path. Do not create a Berson-specific product fork, second resolver, second settings store, direct DB path, or manual grant source.

## Exact observed failures to close

1. Saving the Berson Care TEST binding through the ordinary staff settings path reached `pgCustomDomainBinding.ts` and failed with SQLSTATE `42501`. The current Drizzle insert names defaulted columns as well as explicit values, while the single privilege declaration does not necessarily cover every column named by the generated INSERT. Diagnose from the actual generated path and fix the canonical declaration/reconcile source, never a hand-written GRANT and never a migration that grants rights.
2. `deploy/host/apply-test-surface-domains.sh` still renders `test.bersoncare.ru` as a legacy redirect to Therapysto/TherapyGo. Change the existing TEST vhost operation so that HTTPS requests preserve the actual Host and reach the same webapp, allowing the existing Host→organization resolver to produce the Berson Care patient surface. Preserve the existing TEST access boundary, TLS files, payment callback reachability if still required, proxy headers, upstreams, backup/rollback and dry-run semantics. This one TEST hostname is an operational first use of the generic custom-domain mechanism, not a per-tenant product branch and not authority to change PROD.
3. Active docs still contain older statements that `test.bersoncare.ru` is transitional or remains on its old address. Update only active contradictory prose to the newer owner decision; do not rewrite historical audit evidence. Do not close B2/B8/C5a wholesale unless all their stated behavior is actually proven; report exact remaining gaps.

## Scope and constraints

- Allowed product paths: existing custom-domain repository/service/settings composition as needed, `deploy/postgres/privileges/**`, `deploy/host/apply-test-surface-domains.sh`, and directly related active docs under the #787 initiative plus `README.md`.
- Do not write or edit tests. Independent auditor owns any justified behavioral tests. Do not clean historical tests. If this workstream itself has just introduced a harmful test, remove only that new test and explain it.
- Do not mutate DEV/TEST DB, nginx, certificates, systemd, real provider state, env or secrets in this worker. Do not read or print credentials. Do not deploy or push.
- No full CI. Run only targeted static/render/privilege checks and scoped typecheck/lint if product TypeScript changes. Use the repository host lock for build/test commands if applicable.
- Do not touch unrelated UI or the other active workstreams.

## Architecture and acceptance

- Quote and apply §5 “Один общий проход”: parameterize/repair the existing path rather than adding a parallel helper or special-case application route.
- If a migration is truly required, it must be timestamp-forward generated-schema-B compatible, contain no rights statements, and include the written rights analysis required by §1 before handoff. Prefer no migration if this is only a declaration/reconcile mismatch.
- Prove from render output that `test.bersoncare.ru` no longer redirects to either platform hostname and that requests are proxied with the original Host/X-Forwarded-Host to the TEST webapp under the existing access/TLS boundary.
- Prove the canonical privilege declaration matches the actual Drizzle write columns and preserves organization RLS/cross-org isolation; do not add broader table-wide mutation rights.
- Finish the whole bounded stage in one pass. Wait for foreground validations, explicitly stage only owned paths, commit before exiting, leave the tree clean, and report SHA, exact commands/results, changed files, rights analysis, and anything that still requires post-landing TEST application/live verification.
