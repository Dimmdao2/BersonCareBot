# #787 — final integrated patient-origin / Host / DB live gate

You are the independent final auditor on `wt/branding-domain-absolute-links-20260907`, after the implementation worker has committed. Product code is read-only. This is one bounded continuation audit, not a new serial nit-picking round. Commit before ending; do not push, land, deploy, or touch TEST/PROD/DNS/TLS/services.

## Mandatory start

1. Run `grep -n "^## \\|^### " AGENTS.md`, read the route and `AGENTS.md` §§1, 1a, 1b, 5, 6, 7, 9, 10a, 10b, 11 and 24 in full. Read `README.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md` and `docs/ORCHESTRATION_BINDINGS.md` before host/DB/runtime action.
2. Read current authority and prior findings:
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` B1/B2/B3/B4a/B8/C5a;
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PATIENT_ABSOLUTE_LINKS_2026-09-07.md`;
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md`;
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_READINESS_2026-09-07.md`;
   - `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md` §§9.3–9.4.
3. Begin the report with per-item `test` versus `view` classification. Reuse the existing kill-sets and retained oracles for already-audited behavior. Do not compose another blind list for the same F-1/F-2/F-3 or core findings.

## Exact acceptance

- Inspect the worker diff and prove there is one shared organization-to-patient-public-origin seam, not per-producer copies or a second Host resolver. Active custom hostname wins; otherwise the permanent normal address is `https://<slug>.therapygo.ru`. Pending/failed/suspended/quarantined custom bindings never win. `therapysto.ru` remains staff.
- Preserve the explicit transitional DEV/TEST contract: the permanent platform-alias host is derived from the typed `PATIENT_APP_ORIGIN` deployment surface, not hardcoded to the new production domain. Under the current one-host TEST-style env no generated patient link may escape to `therapygo.ru` before cutover. A route must not carry an inline projection-to-origin fallback merely to satisfy an old mock; the test double should implement the same public service seam as production.
- Reconcile every call site in the patient-link audit: payment returns; memberships; booking pay/confirmation/ICS; broadcasts/replies/web push; webapp and integrator reminder callbacks. Confirm the audit's staff/admin/operator/protocol PASS list stays staff-bound.
- Run the existing payment-return and Yandex callback acceptance oracles. Verify F-3 by the real request path, not only by filtering a materialization snapshot: changing browser query/cookie after delivery cannot switch a reminder to a different enrolled clinic; authority comes from trusted request surface/resource relationship; legacy/unscoped links fail or recover honestly.
- Inspect every touched test under §§10a/10b. Remove any harmful source/format/function-spelling/call-shape/UI-copy/layout/count/DOM/table-count oracle found in touched scope. Do not create UI shape/copy tests.

## Named-DEV DB proof for B2

The core audit explicitly left global uniqueness, immutable owner, permanent quarantine and active-only resolution without live DB proof. Classify these as repeatable expensive/silent DB behavior. Search for an existing proof first. If absent, one compact opt-in `*.devDbProof.test.ts`/`.mjs` is authorized under §10b; it must:

- refuse every database except named `bcb_webapp_dev` or explicitly named TEST (do not use TEST in this run);
- use the canonical application/admin-socket mechanism already used by neighbouring proofs;
- execute all writes in one transaction with mandatory `ROLLBACK` and prove before/after no persistent row count/state change;
- attempt cross-org duplicate claim/reclaim, organization-id rewrite, non-active public resolution, and quarantine reuse at the actual DB boundary;
- observe DB outcomes, not SQL/source text, internal call counts, row/table counts as a proxy for behavior, or formatting;
- run only on named DEV with its explicit opt-in flag. No disposable DB and no migration/reconcile/seed.

If a safe rollback-only proof cannot be written using current named DEV data without inventing fixtures or leaving claims, mark B2 live DB evidence blocked and name the exact blocker; never mutate persistent clinic settings to manufacture evidence.

## Candidate live Host matrix

- Use only a free port in `5211..5219`; never touch or stop shared `:5200`.
- Source `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` into the candidate process without printing or copying secret values. Override only local process identity needed to distinguish the split surfaces and chosen listen port.
- Read-only requests must exercise the real exported Next proxy/composition, not an injected lookup: staff Host, patient-default Host, known `<slug>.therapygo.ru`, known active custom Host if one already exists, and unknown Host. Check root plus representative `/app`, booking and path/query-preserving redirect semantics. Do not create/change slug or binding; claims/quarantine are permanent.
- If named DEV has no existing slug/custom binding suitable for a case, report the exact absent case; do not fabricate it. A missing external DNS/ACME/PROD state is an external owner gate, not a local product PASS.
- Stop only the candidate process group and prove the chosen listener is gone.

## Validation and deliverables

Use the cheapest relevant targeted suites, both changed-package typechecks, scoped ESLint and `git diff --check`. Do not run full CI; the lead owns the single post-land repo-level CI. Product files remain untouched; persistent outputs may be only a justified DB behavior proof, missing behavior tests if truly required by the existing kill-set, the appended audit artifact, and the audit-queue verdict. Stage explicit paths only, never `git add -A`.

Verdict must be binary for repository readiness and separately list external owner-authorized gates: PROD deploy, real DNS, REG.RU credentials/allow-list, actual first issuance, renewal and cutover/rollback. Report exact commands/results, candidate SHA, killed/uncaught count for any new test work, cleanup, and commit SHA.
