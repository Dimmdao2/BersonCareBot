# S4-0/S4-1 contract inventory — #888

This is the S4-0 evidence record required by
[`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md) §§5–6. It is a foundation
contract, not a tariff constructor, billing activation, migration, or data apply plan.

## Canonical mechanic registry and coverage

The fourteen canonical keys and Russian labels live only in
[`types.ts`](../../../apps/webapp/src/modules/org-entitlements/types.ts:11). The method registry is
[`protectedActionRegistry.ts`](../../../apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts:18);
`check:s4-entitlement-coverage` imports that typed registry and validates every exported action in its declared
mechanic-bearing files: exactly one protected mapping or an explicit read/non-protected exemption, matching guard,
missing mechanic coverage, duplicate IDs and file/export mappings, and direct resolver/tariff reads outside the
approved boundary. This is a declared-inventory guarantee plus a bypass scan; it does not infer arbitrary future
business semantics from unrelated files.

| Mechanic      | Entrypoint / action                                                                                                                                         | Auth and trusted context                                            | Gate                                                                                       | Service / port                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| courses       | `courses/route.ts:49` `POST`                                                                                                                                | `requireDoctorWorkspaceApiContext`                                  | `:52` route adapter                                                                        | `deps.courses.createCourse`                                                          |
| mailings      | `broadcasts/actions.ts:64`                                                                                                                                  | `requireDoctorWorkspaceContext`                                     | `:68` action adapter                                                                       | `deps.doctorBroadcasts.execute`                                                      |
| cms_pages     | `content/actions.ts:14`, `lifecycleActions.ts:12`, `sections/actions.ts:23,130,196,242`                                                                     | `requireDoctorWorkspaceContext`                                     | `:19`, `:14`, `:28,:135,:201,:247` action adapter                                          | page upsert/update/lifecycle; section upsert/attach/rename/delete                    |
| subscriptions | `patient-packages/route.ts:70` `POST`                                                                                                                       | `requireDoctorBookingEngine`                                        | `:73` route adapter                                                                        | memberships create/offer command boundary                                            |
| patient_card  | visits create/update; anamnesis create; complaints update; diagnoses update/status update; physical update; comorbidities create/update/restore/soft-remove | `requireDoctorWorkspaceApiContext` + trusted patient identity       | handler-level `requireEntitlement(..., "patient_card")` after canonical patient resolution | `patientClinical`, `doctorClients.setPatientPhysical`, `patientComorbidities` writes |
| files         | `files/route.ts` `POST`; `files/[fileId]/route.ts` `PATCH`                                                                                                  | `requireDoctorWorkspaceApiContext` + trusted patient/file ownership | handler-level `requireEntitlement(..., "files")` after canonical patient/file resolution   | `deps.patientFiles.createFile/linkFileToVisit/renameFile`                            |
| booking       | branch `:26`, service `:29`, slot/schedule block `:39` `POST`                                                                                               | composed booking-engine contexts                                    | `:29`, `:32`, `:42` route adapter                                                          | catalog/service/scheduling command boundary                                          |
| payments      | `admin/settings/route.ts:276` `PATCH`, only single-key `booking_payment_providers` / `booking_payment_enabled`                                              | `requireClinicManagementApiContext`                                 | single-key route adapter                                                                   | `deps.systemSettings.updateSetting`                                                  |

`exercise_catalog`, `exercise_packages`, `patient_app`, `patient_app_paid_subscription`, `branding`, and
`custom_domain` are explicitly `declared_no_surface` in
[`protectedActionRegistry.ts`](../../../apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts:37).
Their code-search evidence is the S4 execution log scope: no route was created solely to give them a flag.

### 2026-07-19 owner correction — disabled patient card/files block every write

The owner ruling for #888 makes `patient_card` and `files` write capabilities rather than representative rollout
samples. The registry therefore maps every active mutation in those two sections, including both branches of the
comorbidity PATCH handler and its recoverable soft-remove DELETE, plus both file-item PATCH branches. A single
handler-level guard protects branches that share the same resolved workspace/patient boundary.

This correction does **not** gate GET, status-history, preview/download, export, removed-record listing, or other
recovery-safe reads. Restore itself remains a mapped mutation and is denied while the mechanic is disabled; its soft-
removed record is retained for recovery after re-enablement. The correction does not delete or hide existing
clinical/file records when a mechanic is disabled.
Explicit exclusions remain diagnosis-catalog creation, symptom trackings, booking and schedule-block DELETE,
programs, messages, identity/FIO, and admin media PATCH/DELETE; those are not Patient Card/Patient Files mutations
in the owner ruling.

## Compatibility and effective tariff source

The resolver remains `override > assigned tariff > default-on` in
[`service.ts`](../../../apps/webapp/src/modules/org-entitlements/service.ts:12). This intentionally preserves
existing organizations with `tariff_id = NULL`; the tests cover assigned tariff, override, and intentionally
unassigned behavior. The separate fixture/data gate must emit `unassigned org = 0` before implicit default is removed;
it is intentionally not run or applied by #888 because this stage prohibits DB/backfill work.

[`tariffAccessContract.ts`](../../../apps/webapp/src/modules/org-entitlements/tariffAccessContract.ts:5) defines the
future source-aware invariant: `be_organizations.tariff_id` stays a compatibility projection, while `manual` and
`paid_subscription` are alternatives in one effective access record. A mismatch is detectable; neither source is a
fallback that can silently revoke the other.

## Ownership before DDL

| Future aggregate                    | Ownership contract                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Platform tariff / package catalog   | real global catalog; never inferred from a clinic-owned row                     |
| Subscription, invoice, order, grant | direct `organization_id` or a parent already scoped to one organization         |
| Analytics aggregate                 | organization bucket only; no patient/user identity or free-form person metadata |

## Payment adapter inventory and dormant merchant separation

| Adapter       | Checkout / intent / idempotency                            | Success and refund                                     | Amount/currency and verification                                                           |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| mock          | no redirect; `mock_intent_<idempotencyKey>`                | event supplied by signed mock payload; mock refund ref | HMAC `x-mock-signature`; amount comes from payload                                         |
| YooKassa      | redirect confirmation URL; payment ID; `Idempotence-Key`   | `payment.succeeded`; refund API                        | Basic auth or HMAC signature; amount extracted from `object.amount`                        |
| Tinkoff       | `PaymentURL`; `PaymentId`; `OrderId=idempotencyKey`        | `CONFIRMED`; `REFUNDED` / `PARTIAL_REFUNDED`           | signed sorted Token; amount is minor units; status maps to normalized event                |
| CloudPayments | pay-by-link `Model.Url`; order ID; invoice=idempotency key | successful callback; refund API                        | base64 HMAC `Content-HMAC`; amount normalised from provider payload                        |
| Alfa-Bank     | form URL; order ID; client idempotency metadata            | `DEPOSITED`; refund API                                | signature/status contract is provider-specific and must be verified before S4-4 activation |

Existing per-org booking merchant identity and dormant future global SaaS identity are distinct typed contracts in
[`merchantIdentityContracts.ts`](../../../apps/webapp/src/modules/payments/merchantIdentityContracts.ts:2). The latter
contains no secret, env value, provider selection, or fallback to booking settings. A future callback may activate SaaS
access only if signature, status, amount, currency, and `payment.succeeded` all validate:
[`saasActivationContract.ts`](../../../apps/webapp/src/modules/payments/saasActivationContract.ts:14). This is a testable
dormant precondition, not PSP activation and not a subscription/grant write path.
