# Independent audit — patient absolute-link integration (#787)

**Candidate:** `eb402b6d0` (to be verified against `HEAD` before verdict)  
**Scope:** focused implementation gate for Stage `B3`; product code is read-only.  
**Verdict:** `PENDING`

## Blind kill-set and test/view classification

Recorded from the owner brief and active plan before inspecting existing test bodies.

| ID | Classification | Named failure and patient impact | Oracle / intended proof |
| --- | --- | --- | --- |
| `K1` | `test` | An organization-bound patient link uses the staff origin, so a notification opens Therapysto instead of the patient's clinic surface. | Plan §§1, 1.1, `B3`; one canonical organization-surface helper/service boundary, fault: return `APP_BASE_URL`. |
| `K2` | `test` | An eligible organization with an active custom binding still receives its technical slug origin, so patient links expose the wrong public address. | Plan §§1.1–1.3, `B3`, `B8`/`C5a`; same canonical boundary, fault: ignore an active binding. |
| `K3` | `test` | A pending, failed, or suspended custom binding becomes a link target, so patients are sent to an unready/broken host. | Plan §1.2 and `B8`/`C5a`; same canonical boundary, fault: accept a non-active state. |
| `K4` | `test` | Custom-binding fallback corrupts or removes the permanent slug origin, so the clinic loses its always-working patient address. | Plan §§1.2 and 1.2h, `B8`/`C5a`; same canonical boundary, fault: omit the technical fallback. |
| `K5` | `test` | A request-bound patient redirect ignores `ResolvedSurface.publicOrigin`, so a valid patient Host is redirected to Therapysto or another clinic. | Plan §§1 and 1.3, `B3`, accepted C2 request-surface contract; cheapest affected route/helper boundary, fault: substitute configured staff origin. |
| `K6` | `view` | Browser body/query/cookie data can select organization, final hostname, edge target, or readiness, enabling cross-clinic misdirection. | Owner brief and plan §§1.1–1.3; trace authority from request parsing through resolver/write boundaries and inspect exact input provenance. |
| `K7` | `view` | Notification/message/broadcast delivery bypasses the canonical organization surface seam, so future producers can silently send staff or foreign-clinic links. | Plan `B3`, §1.5; classify every reachable producer and confirm wiring to the shared seam. Retain a producer test only if it adds independent URL behavior. |
| `K8` | `view` | Reminder materialization bypasses the same seam and opens the wrong host. | Plan `B3`, `C3`; inspect producer wiring. Do not duplicate `K1`–`K4` at every producer. |
| `K9` | `view` | Patient package or appointment payment return URLs use the staff origin or another clinic. | Owner brief, plan `B3`; inspect trusted organization provenance and canonical seam use. Add a test only for independent path/query/return semantics. |
| `K10` | `view` | Booking confirmation/ICS or booking-done links use the wrong public origin. | Owner brief, plan §§1.2b, 1.3 and `B3`; inspect all reachable builders, with a test only for independent URL composition behavior. |
| `K11` | `view` | Patient OAuth/error redirects escape the accepted request surface. | Owner brief and accepted `C2` contract; inspect request-surface propagation and exact allowlist/state checks. Add a route test only for an uncovered independent redirect decision. |
| `K12` | `view` | Staff payment/invite/OAuth/operator URLs are mechanically moved to a patient host, breaking staff flows. | Owner brief, plan §§1 and 1.3; explicitly classify these call sites as correctly staff-bound. |
| `K13` | `test` | A truly unscoped patient entry ignores `PATIENT_APP_ORIGIN`, or its absent DEV/TEST fallback stops using `APP_BASE_URL`. | Owner brief, plan `A1`, `TPB-09`; existing typed config public boundary, fault: always return staff origin or remove fallback. |
| `K14` | `view` | Organization-settings URL rendering is edited or judged by this workstream, colliding with `branding-domain-ui-20260907`. | Explicit owner exclusion; report overlap only and leave those files unchanged. |

## Reachable call-site classification

Pending inventory.

## Fault injections and validation

Pending.

## Findings and verdict

Pending.
