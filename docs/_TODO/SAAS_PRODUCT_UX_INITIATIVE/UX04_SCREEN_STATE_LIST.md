# UX-04 — Screen and state list

**Статус:** owner rulings 2026-07-16 integrated; awaiting independent audit. The earlier independent re-audit PASS is
historical pre-ruling evidence.
**Authority:** производный state list; `OWNER_RULINGS_2026-07-16.md` имеет product/UX приоритет.
**Назначение:** компактный перечень экранов/состояний для UX-06 composition и UX-07 prototype. Это не route plan.

## 1. Platform acquisition and specialist signup

| ID     | Surface                     | Required states                                                                                                                                                                                                        |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACQ-01 | Specialist-oriented landing | default; signup disabled/waitlist; login; legal/support                                                                                                                                                                |
| ACQ-02 | Specialist signup           | empty; validation; duplicate email; network/server recovery                                                                                                                                                            |
| ACQ-03 | Verify specialist email     | code; cooldown; resend; expired; too many attempts; change data                                                                                                                                                        |
| ACQ-04 | Provision workspace         | in progress; authenticated/idempotency-receipt retry; challenge replay denied; partial failure; deferred specialist binding                                                                                            |
| ACQ-05 | Owner first-run             | checklist; specialist binding pending/ready; factor enroll/verify; recovery codes/alternate recovery; lost/unavailable factor; cooldown; replacement; revoke sessions; high-risk step-up; billing/entitlement recovery |

## 2. Staff invite

**Deferred future state family:** retained for historical traceability; none of `STF-01…08` is an initial-release
screen/state acceptance requirement, and exact future clinic roles/grants are not frozen.

| ID     | Surface                   | Required states                                                                                                                                                                                                                |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| STF-01 | Team and invitations      | members; relationship pending/accepted/expired/revoked/superseded; independent latest delivery summary; empty                                                                                                                  |
| STF-02 | Create invite             | role/capabilities; specialist binding fields; seat blocked; duplicate/already member                                                                                                                                           |
| STF-03 | Invite detail             | relationship state separate from immutable email attempts: queued/provider accepted/delivered/temporary failure/bounce/complaint/suppressed; resend creates superseding invite; revoke; corrected recipient creates new invite |
| STF-04 | Public staff join preview | raw-token exchange; URL scrub/short continuation; masked recipient; valid neutral preview; invalid/expired/revoked/superseded; organization unavailable                                                                        |
| STF-05 | Staff identity            | existing email+password login/step-up; new recipient proof + set password once; wrong account; patient-persona collision; additive persona or fail-closed link/support; other-active-org conflict                              |
| STF-06 | Staff security            | policy evaluation; factor enroll/verify; recovery codes/alternate recovery; lost/unavailable factor; cooldown/abuse; replacement; revoke sessions; deferred/high-risk step-up according to ruling                              |
| STF-07 | Accept role summary       | organization/role; canonical recipient re-check; accepting; transactional idempotency; concurrent replay; seat/plan unavailable; specialist binding pending                                                                    |
| STF-08 | First staff workspace     | specialist Today; simple management page/area for an owner-specialist; dual-role destination; assistant operations home reserved for a future clinic mode only                                                                 |

## 3. Staff-created patient, optional portal activation, install and push

| ID     | Surface                                          | Required states                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PIN-01 | Staff creates patient and visit                  | new/existing patient; scheduled appointment or immediate walk-in; name and phone required by product policy; email optional; duplicate candidates; fixed organization and specialist; portal entitlement absent/present                                 |
| PIN-02 | Optional portal access delivery                  | card and visit already exist independently; no usable email/phone; email primary and SMS optional; immutable attempts queued/delivered/failed/bounced/complaint/suppressed; invite expiry never removes the clinical card or visit                      |
| PIN-03 | Patient join preview                             | raw-token exchange; URL scrub/narrow continuation; valid neutral org/specialist; masked recipient; invalid/expired/revoked/superseded                                                                                                                   |
| PIN-04 | Patient passwordless identity                    | request/verify OTP; resend/cooldown/abuse; inaccessible channel recovery without invite consumption; wrong account; canonical conflict/recovery; current password/OAuth compatibility only                                                              |
| PIN-05 | Link portal identity to existing card            | organization summary; match by verified email/phone plus conflict recovery; consent if required; canonical recipient re-check; idempotent convergence; unavailable org; no duplicate patient card                                                       |
| PIN-06 | Activation success/first value                   | appointment; active program/task; empty relationship with next action                                                                                                                                                                                   |
| PIN-07 | Install offer                                    | eligible prompt after value; manual iOS instructions; already installed; repeat suppressed; dismissed; unsupported; browser continues; launch uses platform app; future generated org PWA is separate and native org app is out of scope                |
| PIN-08 | First installed launch (future channel contract) | valid session; missing/expired session → passwordless OTP; no invite re-consumption; org-specific branded app remains pinned to its organization; platform app restores last used organization and offers a switcher; remembered org invalid → recovery |
| PIN-09 | Push education/permission/subscription           | not asked; explicit request after auth/context; granted; dismissed/default; denied/revoked; unsupported; expired/rotated subscription; device replacement; settings recovery; deep-link enrollment recheck                                              |

## 4. SMS fallback

| ID     | Surface          | Required states                                                                                                     |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| SMS-01 | Add SMS delivery | allowed; no phone; invalid phone; consent/policy blocked; suppressed; rate limited                                  |
| SMS-02 | SMS result       | queued/provider accepted/delivered where available; temporary/permanent failure; opted out                          |
| SMS-03 | SMS link entry   | raw-token exchange/URL scrub; same invite valid; email proof still required; terminal invite; no SMS-only elevation |

## 5. Public booking and portal activation

| ID     | Surface                     | Required states                                                                                                                                                    |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PBK-01 | Published booking entry     | valid organization; unpublished/invalid; platform-domain launch entry; future custom-domain entry isolated to its organization; no catalog                         |
| PBK-02 | Service/location/format     | available; no results; ambiguous tenant denied; back/restore selection                                                                                             |
| PBK-03 | Slot selection              | available; no slots; stale/overlap; timezone/context visible                                                                                                       |
| PBK-04 | Contact/intake              | required fields; invalid phone/email; privacy/legal; retained safe draft                                                                                           |
| PBK-05 | Review/submit               | exact org/service/time; submitting; duplicate click; rate limit; server recovery                                                                                   |
| PBK-06 | Booking result              | confirmed; pending payment/review; delivery failed; slot conflict; signed one-time continuation; internal user id never exposed; support recovery                  |
| PBK-07 | Portal access after booking | continuation exchange/URL scrub; authenticated open; passwordless OTP; new activation; ambiguous identity recovery; replay requires canonical object authorization |
| PBK-08 | Appointment first value     | exact organization/appointment; portal identity not linked; revoked relationship recovery                                                                          |

## 6. Returning multi-organization patient

| ID     | Surface                  | Required states                                                                                                                                                                                                                                            |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOR-01 | Resolve entry context    | browser/platform-app launch; valid/no session; passwordless re-auth; zero/one/multiple organizations; last-used organization; remembered invalid; trusted target object; foreign/revoked target; branded org-specific app never offers cross-org switching |
| MOR-02 | Organization chooser     | permitted active list; suspended/archived policy state; empty/recovery                                                                                                                                                                                     |
| MOR-03 | Patient context switcher | collapsed single; persistent multiple; switching; destination unavailable                                                                                                                                                                                  |
| MOR-04 | Context-change notice    | invite/booking/deep-link selected another org; accept/undo-to-chooser where safe                                                                                                                                                                           |
| MOR-05 | Organization Today       | appointment/program/messages attribution; empty; entitlement/read-only; current known error finding                                                                                                                                                        |

## 7. Shared invite failures

| ID     | Surface                       | Required states                                                                                                                                                 |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ERR-01 | Invalid link                  | neutral invalid; rate limited; login/support                                                                                                                    |
| ERR-02 | Expired link                  | safe org identity if known; request/resend cooldown                                                                                                             |
| ERR-03 | Revoked/superseded            | revoked; use latest; contact organization                                                                                                                       |
| ERR-04 | Already accepted/replayed     | terminal token grants no context; auth required; accepted canonical user/live relationship match; exact-context open or neutral mismatch; no duplicate mutation |
| ERR-05 | Wrong recipient/account       | masked target; switch account; staff correction/new invite                                                                                                      |
| ERR-06 | Relationship/persona conflict | staff other-org fail-closed; patient+staff additive persona or account-link support; patient existing new-org; same relationship idempotent                     |
| ERR-07 | Organization/plan unavailable | suspended/closed; seat unavailable; recovery owner/CTA                                                                                                          |

## 8. Prototype priority for UX-07

Prototype end-to-end, including recovery states:

1. `ACQ-01 → ACQ-05` solo signup and first-run.
2. `STF-01 → STF-08` is a historical/future clinic journey, absent from initial solo release.
3. `PIN-01 → PIN-09` manual patient + scheduled/walk-in visit, optional portal identity linking, then deferred install/push channel states.
4. `SMS-01 → SMS-03` fallback without auth elevation.
5. `PBK-01 → PBK-08` public booking to patient app.
6. `MOR-01 → MOR-05` last-used organization, platform-app switcher and trusted deep-link context change; no switcher in a future org-specific branded app.

UX-06 owns final routes/navigation/reuse mapping. UX-05 owns branding/domain/sender presentation applied to these
surfaces. This list must not be converted into parallel patient/doctor route trees.
