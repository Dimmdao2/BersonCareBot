# Test or view classification — patient absolute-link audit continuation (#787)

Read the `AGENTS.md` header map first, then §§1, 5, 9, 10, 10a, 10b, 11 and 24 in full; `README.md`; `docs/ORCHESTRATION_BINDINGS.md`; exact §§1–1.3/B3/B8/C5a authority in `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`; the original brief `runs/branding-domain-absolute-links-audit-brief-20260907.md`; and the interrupted artifact `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PATIENT_ABSOLUTE_LINKS_2026-09-07.md`.

Continue the independent audit on synchronized candidate `672595a759f14bcf04a62c454bddfd041f717a37`. The serious Sol/xhigh pass already derived K1–K14, inspected the repository, restored all temporary product mutations, and left two intentional red acceptance oracles in commit `01c57e717`. Its host runner ended at the system boundary before completing/committing the artifact; do not redo its blind phase, widen scope, or add duplicate tests.

Use the existing run record `/home/dev/brain/runs/agent-port/branding-domain-absolute-links-audit-20260907.json` and the actual candidate tree to finish the artifact. Verify the two retained tests are selected and fail for the intended observable outcomes. Classify every reachable non-test patient/staff `APP_BASE_URL` or absolute-link producer in the original scope, but consolidate repeated organization-bound failures behind one required organization→patient-public-origin seam instead of demanding a duplicate fix/test per producer.

The prior run's confirmed findings to prove or reject from current code are:

1. Organization-bound patient notifications, reminders, booking/payment return links and related producers have no shared organization→patient-public-origin resolver and can point to staff `APP_BASE_URL`; active eligible custom domain must win, otherwise permanent `https://<slug>.<patient-base-host>` must win, and pending/failed/suspended custom domains must never be targets.
2. Yandex callback error/success redirects can lose the trusted `ResolvedSurface.publicOrigin` and fall back to the staff origin.
3. Reminder organization selection may trust browser query/cookie provenance instead of a trusted patient relationship/resource.

Keep correct staff/admin/operator/payment/invite/OAuth callback uses on the staff origin explicitly classified as correct. Settings UI files remain excluded because `branding-domain-ui-20260907` owns them. A source/import/count/call-order test is prohibited. Existing side-effect argument assertions are allowed only where the URL delivered to a provider is the observable external effect. Remove any newly found harmful test in this exact touched scope and record why; do not perform a repository-wide test cleanup.

Deliver in one commit: completed audit artifact with candidate SHA, call-site classification, exact red commands/results, fault-injection/reversion evidence recoverable from the run record, concrete reachable MUST FIX findings and binary FAIL/PASS; the two intentional acceptance tests (renamed conventionally as already staged); and one audit-queue verdict row. Product code remains untouched. Explicit paths only, no `git add -A`, no push/land/deploy/DB/live host work.
