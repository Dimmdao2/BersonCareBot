# #787 — audit the completed surface-split substage

You are the independent `auditor-live` for exact product commit `a3183f03e` in `/home/dev/dev-projects/bcb-wt-branding-login-split-20260907`. Product code is read-only. This is a bounded acceptance of the already completed surface-presentation/cross-origin substage so the same branch can continue with the newer first-launch auth-policy requirements. Commit before ending; do not push, land, deploy, mutate DEV/TEST/PROD, or touch DNS/TLS/services.

## Test or view classification — first action

Before reading tests, read `AGENTS.md` §§10a, 10b, 11, 15, 16, 17, 21 and 24 completely. Classify route isolation, canonical cross-origin navigation, auth-policy selection and post-auth guards as repeatable behavior (`test`). Classify hierarchy, clarity, absence of role-selection clutter, branding and responsive appearance as live `view`; never encode those as text/DOM/count/layout tests. Record the classification first.

## Authority and bounded scope

Read the initial worker brief `runs/branding-login-surfaces-worker-brief-20260907.md` and `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` `TPB-02`, `TPB-03`, `TPB-05`. The newer `TPB-20`–`TPB-22` remain intentionally open for the follow-up worker and are not acceptance criteria for this exact earlier commit. A PASS means this substage is a safe base, not that the whole login milestone is complete.

## Exact acceptance

1. Inspect `a3183f03e`. There remains one auth engine and one Host resolver. Host selects staff/platform-admin/patient presentation and existing auth policy; it does not grant authorization.
2. Therapysto has a staff presentation without role choice; admin Therapysto is platform-operator-only and has no alternate-role control; TherapyGo/slug/custom domains have patient presentation with resolved identity.
3. Any staff↔patient escape link changes origin through typed product-surface config. It must not create a patient path on staff Host or staff path on patient Host; admin has no alternate link. Untrusted `next` is not forwarded across products.
4. Wrong-surface paths are refused/canonically redirected, unknown Host remains 404, and post-auth guards remain intact. The reported old `proxy.route.test.ts` expectation that admin Host accepts doctor login is stale behavior and must be updated or deleted according to §§10a/10b, not satisfied by restoring the bug.
5. Build a blind fault list before reading tests. Run relevant route/surface/auth-policy/post-auth suites. Add only compact stable behavior acceptance if missing. Inspect touched tests and delete harmful source/call-shape/copy/DOM/count/layout tests in scope.
6. Start the candidate only on a free port `5211..5219` with safe DEV env. Perform one desktop and one narrow live view for staff/admin/patient; branded patient only if named DEV data already exists. Stop the exact process group and prove listener cleanup.

## Validation and deliverables

Run webapp typecheck, scoped ESLint, targeted suites and `git diff --check`; no full CI. Persistent changes may be only justified behavior tests, harmful-test cleanup and an audit artifact under `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/`. Append a concise queue verdict for `a3183f03e`, stage explicit paths only and commit. Report binary readiness of this substage, live views, killed/uncaught faults and audit commit SHA.
