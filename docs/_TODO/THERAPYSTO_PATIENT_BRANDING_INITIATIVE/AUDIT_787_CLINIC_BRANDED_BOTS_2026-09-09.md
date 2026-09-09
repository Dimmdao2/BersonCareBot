# Independent audit — branded clinic bots (#787)

## Subject and authority

- Candidate: `10c768662b4e29d0d122c96811ce6a51bb71baa5`
- Base: `ca215b32a`
- Independent oracle: the owner-required behavior in
  `/home/dev/dev-projects/BersonCareBot/.lead/briefs/clinic-branded-bots-worker-20260909.md`, and the exact owner
  checklist entries `TPB-12a`, `TPB-12b`, `TPB-13a`, `C3`, and `D1` in `IMPLEMENTATION_PLAN.md`.
- Boundary: acceptance gate only. No production fix, deployment, provider contact, data mutation, new Next server,
  push, or automated UI test.

## Blind kill-set — recorded before implementation or existing tests

| Owner requirement | Method | Blind fault | User/data impact | Independent oracle | Final observable outcome |
| --- | --- | --- | --- | --- | --- |
| One provider-neutral dispatch path; Telegram/MAX only thin adapters. | LOOK | A caller or provider owns a second business dispatch/queue/resolver path. | A future provider or one channel can bypass audience/tenant policy and silently route a message incorrectly. | Worker brief; `C3`. | Diff has one common dispatch/credential-resolution seam; adapters only translate/send provider payloads. |
| Clinic administrators cannot mutate global TherapyGo patient or Therapysto staff credentials. | TEST | An organization-scoped admin write changes a global platform credential. | A clinic can hijack platform delivery identity/secrets for every tenant. | Worker brief; `C3`; `TPB-12a`; `TPB-12b`. | Public settings write rejects/does not persist a global platform credential under clinic authority. |
| Clinic Telegram/MAX controls are only on existing Branding surface, unavailable without active `branding`; UI, write/probe/runtime boundaries agree. | TEST (UI placement is LOOK) | A non-entitled clinic writes, probes, or resolves its bot despite the branding gate. | An unpaid clinic can use branded bot credentials; secrets and delivery identity cross an entitlement boundary. | Worker brief; `TPB-12a`; `C3`; `D1`. | Non-entitled organization receives denial/no clinic credential resolution; visual placement is inspected live/code-wise only. |
| An additional channel mechanic only restricts access and never replaces `branding`. | TEST | Enabling a channel-specific entitlement permits a clinic bot when `branding` is absent. | A tariff/package bypass gives branded delivery without paid branding. | Worker brief; `C3`. | Credential resolution falls back to TherapyGo unless `branding` is active, regardless of any additional channel gate. |
| Verified, enabled, entitled clinic credentials handle patient delivery; missing/disabled/unverified/non-entitled resolve to TherapyGo. | TEST | Any readiness/entitlement state selects the wrong sender. | Patient codes/notifications are sent from the wrong identity or a configured clinic silently loses branded delivery. | Worker brief; `TPB-12a`; `C3`. | Public dispatch outcome selects clinic only for the valid state and TherapyGo for every invalid state. |
| A selected valid clinic bot never silently retries through the platform patient bot on provider failure. | TEST | Provider failure causes a second send through TherapyGo after clinic selection. | A patient receives duplicate/misbranded security or transactional messages; clinic outage is masked. | Worker brief; `TPB-12a`; `C3`. | Delivery failure is surfaced/recorded without a platform-bot send after clinic selection. |
| Staff delivery always resolves to Therapysto, never clinic credentials. | TEST | Staff context resolves a clinic or TherapyGo credential. | Staff operational notices cross audience/tenant identity boundaries. | Worker brief; `TPB-12b`; `C3`; `TPB-13a`. | Public staff dispatch selects Therapysto only, independently of organization clinic configuration. |
| Existing organization rows in `public.system_settings` and existing single write/dispatch paths remain sole paths. | LOOK | Candidate adds a mirror, env key, duplicate setting key, or second write/dispatch resolver. | Configuration diverges or a sensitive gate is bypassed silently. | Worker brief; `C3`; `D1`; AGENTS.md §§2–5. | Diff and dependency/privilege review show no new storage/config path and one existing write/dispatch seam. |

The remaining sections are completed after inspecting the candidate diff and the relevant existing tests. No test is
added unless its independent oracle, expensive silent failure, and final observable consequence are recorded here.

## Diff and boundary review

Commands and results:

```text
git diff --check ca215b32a 10c768662b4e29d0d122c96811ce6a51bb71baa5      # exit 0
git diff --stat ca215b32a 10c768662b4e29d0d122c96811ce6a51bb71baa5       # 8 production files; no test file
git diff --name-status ca215b32a 10c768662b4e29d0d122c96811ce6a51bb71baa5
node /home/dev/brain/tools/code-search.mjs "clinic delivery credential resolver dispatch platform audience branding entitlement" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "clinic telegram max settings write clearance branding entitlement" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "platform delivery audience TherapyGo Therapysto credentials" --repo bcb -k 20
```

The complete `ca215b32a..10c768662` diff was read. It changes the existing `dispatchPort` sender-selection seam,
the existing exact-org credential resolver, the existing settings write and probe routes, and moves the existing bot
controls from `ClinicDeliveryChannelsSection` to `OrgBrandingSection`. It adds neither a provider adapter, queue,
credential store/key, env setting, privileged SQL path, nor a second resolver/write path.

- `C3` / one dispatch path → PASS: `clinicSenderScope` remains inside `createDefaultDispatchPort`; only its existing
  `platformAudience` parameter now prevents staff selection of a clinic credential. The candidate does not alter
  Telegram/MAX adapter implementation.
- Global platform credentials → PASS: `registry.ts` marks TherapyGo/Therapysto Telegram/MAX rows global and secret;
  `/api/admin/settings` rejects a clinic write for a non-per-org key before the clinic path. The candidate does not
  add a clinic route/key for them. A public route test now sends a clinic write for
  `therapygo_telegram_bot_token` and observes HTTP 403 with no write.
- Branding UI/write/probe/runtime → PASS: the UI LOOK shows bot controls only as `clinicBots` children of
  `OrgBrandingSection`; `page.tsx` requires `brandingMutationAvailable` and the existing channel mechanic before
  rendering. Write, probe, the DI write-clearance wrapper, outbound resolution, and inbound forwarding all require
  `branding` plus their existing Telegram/MAX mechanic.
- Additional mechanic cannot replace branding → PASS: each gate iterates the pair in the same order; neither map
  replaces `branding` with a provider mechanic.
- Patient resolution/fallback → PASS: the resolver reads exact org rows only after both mechanics permit it and
  returns `null` for absent, disabled, unverified, or non-entitled configuration. The existing dispatch default is
  therefore TherapyGo; an enabled `clinic_if_configured` credential upgrades to `clinic_required`.
- No platform fallback after clinic selection → PASS: `clinic_required` rethrows a provider failure rather than
  sending `brandedIntent` a second time.
- Staff isolation → PASS: the shared sender-selection seam makes `staff` platform-required before resolving a
  clinic credential and carries `platformAudience: 'staff'` onward to the existing Therapysto-aware adapter config.
- `system_settings`, tenant, secrets and privilege review → PASS by LOOK: all reads remain through
  `fetchIntegratorClinicDeliveryCredentialValueJson` in the existing `public.system_settings` path; organization ID
  remains exact-principal scoped; no migration, role, policy, log, public projection, or secret-redaction change is
  present. Settings responses still pass the existing redaction flow.

## Test-policy disposition

The candidate itself adds, changes, and deletes **no test files**. Its commit message reported two affected legacy
test files; the initial targeted run found one prohibited internal-shape assertion in the integrator file and two
parameterized route cases in the webapp file.

| Test path / action | Policy disposition | Oracle; expensive silent failure; final observable consequence |
| --- | --- | --- |
| `apps/integrator/src/infra/db/clinicDeliveryCredentials.unit.test.ts` — delete one `it` | Deleted. It copied the internal channel/mechanic registry and asserted mocked call order/list, so §10a forbids retaining it. It was directly affected by adding `branding`; no independent observable oracle remained. | N/A: this was source-shape/internal mock evidence, not a behavioral test. |
| `apps/integrator/src/infra/db/clinicDeliveryCredentialGate.audit.test.ts` — add four `it.each` cases | Retained/addition. It calls the public credential resolver and observes `null` (platform fallback) rather than its internal map. | Owner brief + `C3`; a disabled branding or provider mechanic silently selects a clinic bot, bypassing paid entitlement and misbranding patient delivery; observable result is no clinic credential/no settings read. |
| `apps/integrator/src/infra/adapters/dispatchPort.test.ts` — add staff case; retain existing no-fallback case | Both are valid public dispatch-to-provider-boundary behavior. | `TPB-12a`, `TPB-12b`, `C3`; a clinic bot for staff or fallback after a clinic failure silently sends a wrong/duplicate message; observable result is the adapter receiving only platform-staff intent, or one rejected clinic attempt with no platform resend. |
| `apps/webapp/src/app/api/tariffMechanics.route.test.ts` — replace two superseded parameterized cases with four route cases | Retained/replaced only in the candidate's direct write boundary. It invokes the public PATCH handler and observes denial, rather than its old provider-only expected mechanic. | Worker brief + `TPB-12a` + `C3`; a clinic could persist a secret bot credential without branding, or an extra mechanic could disappear; observable result is HTTP 403 for either denied gate. |
| `apps/webapp/src/app/api/admin/settings/route.route.test.ts` — add one route case | Addition. It sends the exact TherapyGo global credential key as a clinic manager and observes the public refusal before persistence. | Worker brief + `TPB-12a` + `TPB-12b`; a clinic silently overwrites the platform patient credential; observable result is HTTP 403 and no write. |

No automated UI test was added or accepted for bot placement. That is LOOK evidence and must be checked live only
after landing on the shared `:5200` server.

## Targeted checks

Initial candidate test commands exposed the superseded assertions:

```text
pnpm --dir apps/integrator exec vitest run src/infra/db/clinicDeliveryCredentials.unit.test.ts src/infra/db/clinicDeliveryCredentialGate.audit.test.ts src/infra/adapters/dispatchPort.test.ts
# FAIL: 1 copied resolver call-list assertion; 39 passed

pnpm --dir apps/webapp exec vitest run src/app/api/tariffMechanics.route.test.ts src/app/api/admin/settings/route.route.test.ts src/app/api/admin/clinic-delivery-test/route.route.test.ts
# FAIL: 2 parameterized Telegram/MAX cases expected the superseded provider-only gate; 63 passed
```

Final commands and results:

```text
pnpm --dir apps/integrator exec vitest run src/infra/db/clinicDeliveryCredentials.unit.test.ts src/infra/db/clinicDeliveryCredentialGate.audit.test.ts src/infra/adapters/dispatchPort.test.ts
# PASS: 3 files, 44 tests

pnpm --dir apps/webapp exec vitest run src/app/api/tariffMechanics.route.test.ts src/app/api/admin/settings/route.route.test.ts src/app/api/admin/clinic-delivery-test/route.route.test.ts
# PASS: 3 files, 68 tests

pnpm --dir apps/integrator typecheck && pnpm --dir apps/webapp typecheck
# PASS: both `tsc --noEmit`

pnpm --dir apps/integrator exec eslint src/infra/adapters/dispatchPort.test.ts src/infra/db/clinicDeliveryCredentialGate.audit.test.ts src/infra/db/clinicDeliveryCredentials.unit.test.ts
pnpm --dir apps/webapp exec eslint src/app/api/tariffMechanics.route.test.ts
# PASS

git diff --check
# PASS
```

No full CI, deployment, provider request, DB/data operation, new Next server, or push was run. Targeted Vitest
commands are step-level checks and do not require the host-wide full-test lock under AGENTS.md §1/§10.

## Fault injection

Every relevant retained/new behavioral acceptance test was fault-injected once and production code was restored
before the final green commands above.

| Fault injected | Command | Red result |
| --- | --- | --- |
| Remove `branding` from the Telegram runtime credential mechanics. | `pnpm --dir apps/integrator exec vitest run src/infra/db/clinicDeliveryCredentialGate.audit.test.ts` | `required telegram mechanic branding is disabled` returned a clinic token instead of `null`. |
| Remove `clinic_telegram_bot` from the Telegram runtime credential mechanics. | `pnpm --dir apps/integrator exec vitest run src/infra/db/clinicDeliveryCredentialGate.audit.test.ts -t "required telegram mechanic clinic_telegram_bot is disabled"` | The named assertion returned a clinic token instead of `null`. |
| Remove `branding` from the Telegram settings write mechanics. | `pnpm --dir apps/webapp exec vitest run src/app/api/tariffMechanics.route.test.ts -t "refuses branded bot setting clinic_telegram_bot_token when branding is unavailable"` | Expected 403; mutated handler reached later availability handling and returned 503. |
| Remove `clinic_telegram_bot` from the Telegram settings write mechanics. | `pnpm --dir apps/webapp exec vitest run src/app/api/tariffMechanics.route.test.ts -t "refuses branded bot setting clinic_telegram_bot_token when its additional clinic_telegram_bot gate is unavailable"` | Expected 403; mutated handler reached later availability handling and returned 503. |
| Disable the route's non-per-org-key rejection. | `pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.route.test.ts -t "does not let a clinic mutate the global TherapyGo Telegram credential"` | The handler passed the security boundary and reached its write/redaction path; the test failed instead of observing HTTP 403. |
| Disable the staff short-circuit in `clinicSenderScope`. | `pnpm --dir apps/integrator exec vitest run src/infra/adapters/dispatchPort.test.ts -t "keeps a staff message on the platform staff identity"` | The adapter received `clinicCredential`; the no-clinic assertion failed. |
| Permit platform retry after a selected clinic bot fails. | `pnpm --dir apps/integrator exec vitest run src/infra/adapters/dispatchPort.test.ts -t "does not fall back to the platform sender after an enabled clinic bot fails"` | Provider adapter was called twice; the one-attempt assertion failed. |

## Findings and remaining live evidence

Findings: **none**. No reachable violation of the named owner requirements or repository rules was found in the
candidate diff.

This audit is not evidence that the owner checkboxes are closed. Post-land/TEST evidence remains required for
`TPB-12a`, `TPB-12b`, `TPB-13a`, `C3`, and `D1`:

1. On the one shared `:5200` server after landing, inspect a branded and non-branded clinic: Telegram/MAX controls
   are only in Branding and are absent when branding is inactive.
2. After credentials are intentionally entered on TEST, deliver a patient phone confirmation/login code and ordinary
   notification through TherapyGo and a verified clinic bot; verify disabled/unverified/missing settings use
   TherapyGo and a selected clinic-bot provider failure does not retry through it.
3. Deliver TEST staff Telegram/MAX events through Therapysto and verify the patient/staff identities remain
   separated. Run the required TEST SMTP/From evidence for `TPB-13a` separately.
4. Perform `D1` through existing settings/branding flows only; do not add a BersonCare-specific code path.

## Verdict

**PASS FOR LAND** — for this committed code candidate and the scoped acceptance tests above. This verdict does not
close the listed owner checklist items or substitute for their post-land/TEST provider evidence.
