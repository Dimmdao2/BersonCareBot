# Independent audit — clinic custom-domain settings UI (#787)

## Candidate and authority

- Candidate: `cfe89ba03a719734873ca8be5e1388951361dc34` (`git rev-parse HEAD`).
- Owner oracle: `IMPLEMENTATION_PLAN.md` `TPB-14`, `B8`, and `C5a`: browser enters only a base domain and placement; the server derives the hostname and sole A/CNAME instruction; custom routing is active only after DNS, TLS and routing proof; pending or failed custom state cannot damage `<slug>.therapygo.ru`.
- Reused accepted core evidence: `AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md`, including its final post-correction focused suite (`4 files / 22 tests PASS`) for lifecycle, entitlement, DNS/TLS/edge and pre-activation HTTP exposure. This audit does not duplicate those service/route oracles at RTL level.

## Blind kill-set and test/view classification

Written before candidate-test inspection.

| # | Class | Kill / inspection target | Evidence |
| --- | --- | --- | --- |
| 1 | test | A browser-controlled final hostname, DNS target, lifecycle state or `app` prefix must not reach the canonical binding write. | Existing public settings `PATCH` route test; strengthened below with one boundary assertion. |
| 2 | test | A save must not present a binding as active; canonical recheck must return and refresh the actual lifecycle state. | Reused core lifecycle/recheck route and health-tick evidence. |
| 3 | test | Non-owner/non-entitled callers cannot mutate. The UI must not offer a false enabled action. | Reused core HTTP entitlement/owner boundary; view of disabled/absent controls. |
| 4 | test | Pending/failed custom host cannot redirect or displace the technical patient host; active link derives only from returned hostname. | Reused core proxy/service evidence; view of returned binding projection. |
| 5 | view | Settings must build card root as `<slug>.therapygo.ru` and booking as configured patient-origin `/book/<slug>`, never staff `APP_BASE_URL`. This is page composition, not a stable DOM oracle. | `page.tsx` and `ClinicSlugSection.tsx` review; existing `envDatabaseRuntime.unit.test.ts` covers configured patient origin. |
| 6 | view | Existing slug rename, branding, booking and settings composition remain present and use the configured TEST fallback rather than local component branching. | Candidate diff/read view; no source-text test. |
| 7 | view | Desktop/mobile overflow, readable DNS values, reachable status/error/recheck and doctor shared geometry require one live viewport pass, not RTL/layout tests. | Live candidate gate attempted below; not completed. |
| 8 | view | No second page/store/API/Berson-specific path; settings composes the accepted binding projection and public-surface configuration. | Candidate diff/read view plus accepted core topology audit. |
| 9 | view | `OrgCustomDomainSection.ui.test.tsx` remains deleted. Its old checks pinned labels, wording and disabled controls, so it must not return. | Exact path check below. |

No new UI-shape test was added. The only retained/additional acceptance is at the cheaper public HTTP boundary.

## Intentional acceptance test and fault injection

Extended `apps/webapp/src/app/api/admin/settings/route.route.test.ts` in its existing case `computes the fixed app label server-side and ignores a browser-supplied prefix`.

- Fault: temporarily passed `subdomainLabel: 'browser-controlled'` to `customDomainBinding.setCustomDomainIntent`.
- Red oracle: the exact port argument assertion failed, receiving the extra browser-controlled field where only trusted `organizationId`, normalized `baseDomain`, and `placement` are permitted.
- Reversion: removed both temporary production-code edits. `git diff -- apps/webapp/src/app/api/admin/settings/route.ts` was empty and `git diff --check` passed before this artifact was added.

This protects the expensive silent failure in which a future route change hands a browser-derived final hostname component to the binding service. The test does not assert copy, DOM layout, source imports, element order or call count.

## Candidate view

Read view of `OrgCustomDomainSection.tsx`:

- the two placement choices are human-labelled and send only base domain plus placement;
- hostname and sole DNS instruction render from returned `domainBinding`, not a browser-derived target;
- lifecycle text is derived from returned `pending`, `dns_ready`, `active`, `failed`, `suspended` or `quarantine`; the external hostname link exists only for `active`;
- save and recheck replace local binding from the response and call `router.refresh()`; read-only hides mutation buttons and disables fields;
- the section uses `DoctorSection`, `DoctorField`, doctor primitives and responsive `flex max-w-md` composition; no second settings/API/store path appears in the candidate diff.

`page.tsx` composes the binding from `deps.customDomainBinding.getBindingState`, passes `PATIENT_DEFAULT_SURFACE.origin` to slug/booking/card links, and has no `APP_BASE_URL` use. `ClinicSlugSection.tsx` forms booking URLs with `new URL('/book/<slug>', patientOrigin)`.

## Commands and results

| Command | Result |
| --- | --- |
| `git rev-parse HEAD` | `cfe89ba03a719734873ca8be5e1388951361dc34` |
| `pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.route.test.ts src/modules/system-settings/orgCustomDomainHostname.unit.test.ts src/config/envDatabaseRuntime.unit.test.ts` | PASS: 3 files, 40 tests. |
| `pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.route.test.ts -t 'computes the fixed app label server-side'` with injected port label | RED as intended: 1 failed; received `subdomainLabel: 'browser-controlled'`. |
| `pnpm --dir apps/webapp exec eslint src/app/api/admin/settings/route.ts src/app/api/admin/settings/route.route.test.ts src/app/app/settings/OrgCustomDomainSection.tsx src/app/app/settings/ClinicSlugSection.tsx src/app/app/settings/page.tsx` | PASS. |
| `git diff --check` | PASS. |
| `test ! -e apps/webapp/src/app/app/settings/OrgCustomDomainSection.ui.test.tsx` | PASS: deleted UI-shape oracle remains absent. |

## Live viewport gate

An isolated candidate server was attempted exactly as the runbook permits on `127.0.0.1:5210`; shared `:5200` was detected occupied and untouched.

| Viewport | Result |
| --- | --- |
| Desktop | Not observed. Candidate Next compilation reached its instrumentation hook but candidate worktree has no DEV runtime env; it stopped with `Development requires SESSION_COOKIE_SECRET (min 16 chars) in env`. |
| Mobile | Not observed for the same reason. |

No secret was read or copied from another worktree, and no TEST/PROD/DNS/TLS system was touched. Therefore there are no honest live facts about overflow, clipping, readable DNS values or mobile reachability to report.

## Verdict and queue

**FAIL — HOLD, NOT FOR LAND.** There is no concrete reachable product-code finding in this UI pass: the strengthened HTTP acceptance is green after reversion and the accepted core audit supplies the lifecycle/security evidence. The required desktop/mobile candidate live gate was not executable with the candidate worktree's missing DEV runtime environment, so a binary PASS would be false. Queue verdict: run one isolated candidate desktop/mobile inspection with sanctioned non-secret DEV env, then record actual viewport facts; do not recreate `OrgCustomDomainSection.ui.test.tsx`.
