# Final integrated branding evidence salvage (#787)

**Candidate:** `e4330eea2d8ebb7e220331fbeec75aab2f64807b`

**Product commit under review:** `9eab369b2` (`fix(#787): preserve typed patient origins for reminders`) is an ancestor of this candidate.
**Mode:** independent continuation `view`; product code, tests, databases, services, DNS and TLS were not changed.

## Test/view classification

This is a `view` under `AGENTS.md` §§10a, 10b and 24.4: it verifies preserved evidence from the interrupted independent run and the two already-reported reachable failures. It does not run a new test, kill-set, DB proof, live matrix or typecheck.

## Verified evidence

1. **F-1 remains reachable: integrator reminder callback uses the staff origin for patient buttons.** In the current candidate, `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts` derives `profileUrl` and `mobileUrl` from `env.APP_BASE_URL`, then places both into the callback follow-up keyboard. The `9eab369b2..HEAD` path log contains no later change to this handler. A patient selecting either button can therefore be sent to the staff surface, contrary to B3's shared organization-to-patient-public-origin seam and the patient alias contract in `BRANDING_DOMAIN_CONTRACT.md` §9.3.

2. **F-2 remains reachable: the signed materialization wake returns HTTP 500.** The preserved raw transcript records a valid signed `POST /api/integrator/patient-reminders/materialize-wake` returning `{"ok":false,"error":"internal_error"}` / HTTP 500 in both the split-surface candidate on `:5212` and the one-host DEV configuration on `:5213`. The current route still catches the request-path error and returns that 500. This means the trusted reminder delivery path is not repository-ready; snapshot filtering is not a substitute for a successful signed request.

3. **Preserved positive and blocked Host evidence.** On isolated `:5212`, the real Next composition passed staff, patient-default and unknown-host routing; the transcript also records candidate listener cleanup. Named DEV had no slug-directory row and no custom-domain binding. Known-slug, active-custom-host and technical-to-custom 308 cases were therefore absent, not passed, and no fixture was created.

4. **Preserved validation boundary.** The interrupted run recorded `apps/integrator` typecheck success. It started webapp typecheck in the foreground, but this continuation has no accepted final result for it and does **not** claim webapp typecheck passed.

## Binary verdict

**FAIL — NOT FOR LAND.** Either reachable failure is sufficient; both remain:

- F-1: reminder callback patient links bypass the shared patient-origin seam and use staff `APP_BASE_URL`.
- F-2: real signed reminder materialization fails with HTTP 500 in both preserved deployment configurations.

## Explicitly unproved cases

- B2 live DB behavior: cross-organization claim/reclaim, immutable owner and quarantine reuse.
- Known platform-slug, active-custom binding and 308 path/query Host cases; named DEV has no suitable rows.
- Webapp typecheck result from the interrupted run.
- External owner-authorized gates: PROD deployment, real DNS/edge reachability, REG.RU credentials/allow-list, first issuance and renewal, cutover and rollback.

No result above is inferred from an unrun check.
