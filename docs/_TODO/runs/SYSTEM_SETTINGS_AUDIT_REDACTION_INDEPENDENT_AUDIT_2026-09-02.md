# `system_settings` audit redaction — independent audit, 2026-09-02

## Verdict

**FAIL, NOT FOR LAND** for candidate `a81ccd8d9cb1fe995b0c02385e18dace544982f7`.

Authority: `INTEGRATION_SECRET_ENCRYPTION_DECISION_PACKET_2026-09-02.md` §1.8 and §6 step 7,
taskdb `#1071`, and the audit brief. The audit changed no product code; the permanent diff contains only
acceptance tests and this artifact.

## Findings

### F1 — malformed composite envelopes still fail open

`redactObjectField()` redacts only when the expected field is present. A structurally valid envelope whose
secret moved under an unknown field is returned unchanged. The acceptance input
`web_push_vapid = { value: { publicKey, signingPrivateKey } }` therefore returns the raw
`signingPrivateKey`, contrary to the explicit malformed/unknown-shape fail-closed requirement.

Reachable impact: `SystemSetting.valueJson` and the settings write port accept `unknown`; an already malformed
or legacy row is read as `oldSetting` by an ordinary PATCH and copied through the shared redactor into both the
admin log and the durable ledger. The same helper shape is used for SMTP/IMAP composites. A malformed value can
therefore make a credential survive indefinitely in audit history.

Evidence: `auditRedaction.unit.test.ts` →
`fails closed when a VAPID envelope has an unrecognized secret-bearing object shape` is red on the unchanged
candidate and shows the raw marker in the received value.

### F2 — public OAuth identifier policy exposes neighboring secrets on malformed input

The six public identifier keys correctly use `secretAudit.kind = 'none'` for their normal scalar envelope, but
`none` returns every shape unchanged. `PATCH /api/admin/settings` accepts `value: z.unknown()` for those keys and
does not narrow them to a scalar before the audit call. Sending, for example,
`google_client_id = { clientId, clientSecret }` therefore places `clientSecret` unchanged into the admin log and
`system_settings_audit`.

Impact: a malformed admin request turns the intended public-ID exception into a durable credential disclosure.
This violates both halves of the requirement: normal public IDs must remain visible, while neighboring
`client_secret` / private-key / refresh-token material must not.

Evidence: six table-driven acceptance cases first prove the normal scalar identifier remains visible, then fail
because the malformed neighboring credential is returned verbatim.

## Kill-set result

1. New `secret_envelope` default/census — **PASS**. A temporary registry key defaulted to `whole_value`; the
   31-key census and 19-key scalar census failed as intended (32/20 observed). The all-scalar behavior oracle
   redacts every current `whole_value` key.
2. `web_push_vapid` — **FAIL** on the unknown object shape (F1). Normal `privateKey` redaction is protected: changing
   its registry policy to `none` produced 3 failing assertions.
3. Both payment-provider envelopes — **PASS**. Booking and SaaS reuse their domain redactors; current and unknown
   provider IDs, known credential fields, and extra credential-like fields do not survive the audit projection.
   Returning the raw domain envelope produced 3 failures across unit and route tests.
4. SMTP/IMAP and scalar secrets — **PASS** for normal shapes. All three password composites retain public metadata
   and redact `password`; all 19 scalar-secret definitions redact the complete value.
5. Six public OAuth identifiers — **FAIL** on malformed neighboring credentials (F2); their normal scalar form is
   visible as required.
6. Ledger and route chokepoints — **PASS** for current normal secret shapes. New behavior tests inspect bound values
   for upsert and delete ledger INSERTs; removing both ledger redactor calls produced 2 failures. Route tests cover
   old and new values; bypassing either route redactor produced a failure.
7. Registry/writer completeness — **PASS** for the current census. Exact command
   `rg -n --glob '!**/*.test.*' --glob '!docs/**' --glob '!**/drizzle-migrations/**' "INSERT INTO system_settings_audit" apps packages | wc -l`
   returned `2`; both sites are in `pgSystemSettings.ts`. Exact command
   `rg -n --glob '!**/*.test.*' --glob '!docs/**' "\\[admin-settings audit\\]" apps packages | wc -l`
   returned `2`; both are in `admin/settings/route.ts`.
8. Scope separation — **PASS by diff inspection**. Candidate changes audit policy/wiring and tests/docs only; it does
   not change setting storage, at-rest encryption, access, client serialization, or client projections.

## Fault-injection transcript summary

All temporary product mutations were reverted before this artifact was written.

- `web_push_vapid` policy `object_field(privateKey) → none` → 3 failures, including the raw private key assertion.
- payment `domain_redactor → return value` → 3 failures, including the route log marker.
- unknown-key fallback `whole_value → none` → 1 failure.
- new default `secret_envelope` registry entry → 2 census failures (`32 != 31`, `20 != 19`).
- route new-value bypass → 1 failure; route old-value bypass → 1 failure.
- ledger upsert/delete bypass → 2 failures with raw secrets visible in bound SQL parameters.

## Validation

- Candidate baseline before new acceptance cases: targeted Vitest `2` files, `37/37` passed.
- Final targeted acceptance command:
  `TEST_CPUSET=0-7 VITEST_MAX_WORKERS=8 /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/system-settings/auditRedaction.unit.test.ts src/app/api/admin/settings/route.route.test.ts src/infra/repos/pgSystemSettings.preauth.unit.test.ts"`
  → `1` file failed, `2` passed; `7` tests failed, `48` passed. The 7 failures are F1 plus six F2 inputs.
- `pnpm --dir apps/webapp typecheck` and scoped ESLint for the three changed test files completed with `rc=0`.
- Full CI was not run, as explicitly prohibited by the brief.
