# Independent audit — patient absolute-link integration (#787)

**Candidate:** `672595a759f14bcf04a62c454bddfd041f717a37`
**Scope:** focused implementation gate for Stage `B3`; product code is read-only.  
**Verdict:** `FAIL — NOT FOR LAND`

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

The inventory is a view of non-test production code on the candidate; settings rendering is
excluded (`branding-domain-ui-20260907`). Repeated organization-bound failures are deliberately
one finding: `organizationId -> patient public origin` needs one shared seam, not a test/fix per
producer.

| Call site | Classification | Result |
| --- | --- | --- |
| `modules/payments/service.ts:29`, doctor acquiring charge `app/api/doctor/patients/[userId]/acquiring-charge/route.ts:95`, staff appointment payment `app/api/doctor/booking-engine/appointments/[id]/payment/route.ts:108` | patient payment return | **FAIL F-1**: all construct a patient return from staff `APP_BASE_URL`; the retained route oracle observes the first path. |
| `modules/memberships/service.ts:459`, `modules/patient-booking/canonicalCreate.ts:505-508`, `modules/patient-booking/sendBookingConfirmationEmail.ts:82` | organization-bound package/booking payment and ICS/confirmation | **FAIL F-1**: same missing organization-origin seam; no duplicate oracle is justified. |
| `modules/doctor-broadcasts/service.ts:198`, `modules/messaging/notifyPatientDoctorReply.ts:121`, `modules/patient-notifications/patientWebPushNotify.ts:267` | patient broadcast/reply/appointment notification | **FAIL F-1**: patient-visible links either begin with staff origin or receive it as the fallback. |
| `integrator/src/kernel/domain/executor/handlers/reminders.ts:563-572` | reminder callback links | **FAIL F-1**: patient profile/mobile links use the integrator staff origin; `infra/adapters/remindersReadsPort.ts:53-74` itself is a signed service-to-service webapp read and is correctly staff-bound. |
| `modules/auth/yandexOAuthCallbackHandler.ts:63-99, 112-221` | request-bound patient OAuth error/success redirects | **FAIL F-2**: trusted `getResolvedSurface()` is obtained but redirects still use `env.APP_BASE_URL`; the retained unit oracle observes the `access_denied` external redirect. |
| reminder organization selection (`app-layer/reminders/runPatientReminderMaterializationWake.ts`, `infra/repos/pgReminderProjection.ts` as traced in the recovered run) | authority provenance | **FAIL F-3**: the organization may be selected from browser query/cookie provenance rather than a trusted patient relationship/resource. |
| `config/productSurfaces.ts`, `config/env.ts` | unscoped patient entry | **PASS**: the typed patient origin is the intended entry seam; its absent DEV/TEST value falls back to `APP_BASE_URL`. |
| `modules/messaging/notifyDoctorPatientMessage.ts:50`, `notifyDoctorPatientProgramNote.ts:60`, `doctorSupportMessagingService.ts:139`, `modules/saas-billing/service.ts:56-57`, `app/api/clinic/invites/route.ts:92`, `app/api/admin/google-calendar/callback/route.ts:25`, operator-health and web-push VAPID uses | staff/admin/operator/protocol URLs | **PASS**: these are staff/operator links, an invite/calendar callback, deployment identity, or a protocol subject; moving them to a patient host would be wrong. |
| `app/app/settings/page.tsx:401-416` | organization-settings URL display | **EXCLUDED**: owned by `branding-domain-ui-20260907`; untouched and not judged here. |

The legacy VK/Apple/Google callback implementations also have deployment-origin patterns, but
this gate's accepted C2 authority and retained oracle are Yandex patient OAuth; no separate
finding or test is added outside that named scope.

## Fault injections and validation

The prior independent pass is preserved in
`/home/dev/brain/runs/agent-port/branding-domain-absolute-links-audit-20260907.json` and its
raw provider stream named by the record. It records that temporary product mutations were reverted
(`resultText`: "Продуктовые файлы после fault injection чисты") and that the inventory found the
same three classes. The original candidate already fails both newly retained expensive, silent
external-effect oracles, so §24.5 requires no additional mutation of product code for them.

| Oracle | Exact command | Result on candidate |
| --- | --- | --- |
| payment return | `pnpm --dir apps/webapp exec vitest run --project route src/app/api/payments/patientAcquiring.route.test.ts` | selected `route` file: **15 passed, 1 failed**. Expected `https://patient.clinic-1074.example.test/app/patient/purchases`; received `http://127.0.0.1:5200/app/patient/purchases`. |
| Yandex callback | `pnpm --dir apps/webapp exec vitest run --project unit src/modules/auth/yandexOAuthCallbackSurfaceRedirect.audit.unit.test.ts` | selected `unit` file: **1 failed**. Expected clinic origin; received `https://staff.example.test/app?oauth=error&reason=access_denied`. |

The retained payment assertion is allowed: the `returnUrl` handed to the acquiring provider is the
observable external effect. The Yandex assertion observes the HTTP `Location`. No source/import/
count/call-order test was added. No newly found harmful test exists in this touched scope; the two
retained tests each name an expensive silent patient misdirection and are red on the original code.

## Findings and verdict

1. **MUST FIX F-1 — canonical organization-to-patient-public-origin seam is absent.** Reachable
   organization-bound payment, booking, confirmation, notification, broadcast and reminder
   producers construct URLs from staff `APP_BASE_URL`. A patient can therefore be returned from
   checkout or a message to Therapysto rather than their clinic. Extend one existing trusted
   organization/surface seam: current eligible active custom hostname wins; otherwise return the
   permanent `https://<slug>.<patient-base-host>` origin. Pending, failed and suspended bindings
   must never be targets. This consolidates K1–K4/K7–K10.
2. **MUST FIX F-2 — Yandex callback discards trusted `ResolvedSurface.publicOrigin`.** A branded
   patient OAuth error (and the later callback redirects using the same `appBase`) goes to the staff
   deployment origin. Preserve the resolved public origin for patient surfaces; staff remains staff.
3. **MUST FIX F-3 — reminder organization provenance is browser-controlled.** Materialization can
   choose an organization from query/cookie rather than the trusted patient relationship/resource,
   allowing a wrong-clinic delivery context. Resolve it from the trusted resource relationship
   before F-1's shared seam is called.

Binary gate: **FAIL**. Product code is intentionally untouched; the next bounded implementation
must make the two retained acceptance oracles green and reuse the shared organization-origin seam
for every F-1 producer.
