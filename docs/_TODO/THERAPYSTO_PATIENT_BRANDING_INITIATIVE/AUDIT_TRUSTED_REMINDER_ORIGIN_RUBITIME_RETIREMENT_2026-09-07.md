# Re-audit: trusted reminder origin and Rubitime retirement — 2026-09-07

Candidate: `05ecf862b` (`fix(#787): resolve reminder patient origins safely`)

## Test/view classification (recorded before reading tests)

| Acceptance item                                                                                                                                    | Classification | Required evidence                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| Trusted reminder materialization selects the canonical patient and organization                                                                    | `test`         | Retained behavior suite plus a real signed reminder wake.                                              |
| Missing trusted organization/origin fails closed without a staff, BersonCare, TherapyGo, or Rubitime fallback                                      | `test`         | Retained behavior suite plus a real signed reminder wake.                                              |
| Migration ownership, security-definer posture, runtime role access, and declaration/generated privilege coverage if the function signature changed | `view`         | Rollback-only preflight and privilege inspection against named `bcb_webapp_dev`; no persistent writes. |
| Integrator uses the one webapp-owned patient-origin resolver and has no second Host/origin algorithm                                               | `view`         | Candidate diff and final architecture inspection.                                                      |
| Obsolete booking source/fallback cleanup, including no alternate booking system                                                                    | `view`         | Candidate diff and final-state search; no source-text absence test.                                    |
| Active product/architecture documentation has no Rubitime behavior or diagnostic; history remains allowlisted                                      | `view`         | Active-doc search with explicit archive/history/migration/evidence allowlist.                          |
| Exact `BOOKING_URL` runtime/default/fallback and active env/deploy contract removal                                                                | `view`         | Runtime/schema/example/deploy final-state inspection; ignored live env files excluded.                 |

UI copy and layout are out of scope.

## Blind behavior kill-set

Recorded from the owner brief, `IMPLEMENTATION_PLAN.md` (`TPB-05`, `B1`, `B2`, `B3`, `B4a`, `B8`, `C5a`), the two prior audits, and `BRANDING_DOMAIN_CONTRACT.md` §§9.3–9.4 before any touched or retained test was opened. Prior accepted origin/Host classes `K1`–`K4` are reused and are not re-audited broadly.

| ID   | Named fault and observable impact                                                                                                                                                               | Intended proof                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R1` | A signed reminder callback derives organization from caller/query/cookie/actor tenant text instead of the canonical patient relationship, so the patient receives another clinic's destination. | Retained reminder materialization/route behavior plus trace from the DB operation result to the resolver input; inject a conflicting untrusted tenant where the public boundary permits it. |
| `R2` | The trusted reminder DB operation resolves the patient but omits or substitutes its organization identity, so origin selection is detached from the canonical patient.                          | Retained DB/route behavior and rollback-only function preflight; fault the returned organization value and require fail-closed behavior.                                                    |
| `R3` | Missing trusted organization still sends a patient button using staff `APP_BASE_URL`, BersonCare, hardcoded TherapyGo, or Rubitime.                                                             | Retained reminder callback behavior and live signed request; force the trusted organization result absent and assert no fallback destination is emitted.                                    |
| `R4` | The webapp-owned origin resolver fails or returns no origin, but integrator reconstructs an origin or falls back, silently misdirecting the patient.                                            | Retained M2M/reminder behavior and live signed request; force the resolver failure/empty result and require fail-closed output.                                                             |
| `R5` | A valid signed materialization wake still returns HTTP 500 in split-surface or one-host DEV, losing reminder delivery.                                                                          | Repeat the two previously failing real signed requests on isolated ports `5211..5219`; require honest recovery or correctly originated links.                                               |
| `R6` | Removing the obsolete booking fallback replaces Rubitime with another host or retains a booking button when no internal signed URL exists.                                                      | Retained public reminder/booking behavior; make internal signed-link creation unavailable and assert URL/button omission or the existing explicit error, never a substitute URL.            |

## Finding and correction

The first real signed split-surface request returned HTTP 500. The route performed a second direct
`org_enrollments` lookup after the canonical reminder DB function had already returned the trusted organization;
that lookup was not available to the bootstrap principal.

The correction does not broaden table privileges. The canonical callback now returns `organization_id`, the
integrator signs only that trusted organization for the M2M origin lookup, and the webapp resolves the
anonymous-safe patient origin through its existing custom-domain projection. Resolver failure or an absent
organization/origin remains fail-closed.

## Evidence

- `R1`/`R2`: the organization passed to the origin resolver comes only from the canonical reminder callback;
  the public M2M request no longer accepts a platform user or tenant selector.
- `R3`/`R4`/`R6`: `remindersWritesPort.test.ts`, `reminders.patientOrigin.audit.unit.test.ts`, and
  `patient-origin/route.route.test.ts` cover trusted-origin use and omission on absent/failed resolution. There is
  no staff, common-host, hardcoded product-host, or alternate-booking fallback.
- `R5`: a signed request on isolated split port `5215` for an unknown organization returned `503` instead of the
  former RLS `500`; a signed request on one-host port `5216` returned `200` with
  `http://shared.audit.test:5216`. No published tenant slug existed in named DEV, so the positive split-tenant
  smoke is deferred to TEST data after deployment.
- Migration preflight:
  `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` →
  `pending=1 total=139`, rollback completed. The migration changes only result columns of the existing canonical
  functions; no new role/table/signature is introduced. Function declaration reconciliation remains required
  after apply because `DROP/CREATE` changes object identity.
- Validation: integrator targeted suites passed (`2` files, `9` tests), webapp route suite passed (`1` file,
  `4` tests), and both application typechecks plus scoped ESLint passed.
- Final-state search of runtime, examples, deploy contract, and active architecture docs found no live
  `BOOKING_URL` or obsolete external-booking behavior. Historical migrations, schema snapshots, archive plans,
  and dated evidence remain history rather than runtime authority.

## Test-policy cleanup

Deleted `reminders.notifSettings.d22.test.ts`: it asserted exact keyboard/call composition rather than an
observable module outcome. The retained/new tests exercise delivery/no-delivery and HTTP boundary behavior.

## Verdict

**PASS for landing.** The previous reachable 500 is fixed without a broad privilege grant, and reminder links
are now derived from the canonical appointment organization or omitted. TEST deployment must still perform the
positive branded-tenant smoke against real TEST tenant data.
