# Blind kill-set — RuStore Universal Push provider contract #915

Prepared before reading existing provider or fan-out tests. Authority: auditor-live brief, `MASTER_PLAN.md` M6-03, M6-05, M6-06, M6-08, M6-09 and M6-11, plus the official Universal Push API contract.

The stable, expensive-and-silent failure protected here is a native Push target receiving a malformed or wrongly classified provider request: delivery fails or the only valid target is deactivated without an observable local failure.

1. Default dispatch makes exactly one `POST` to `https://vkpns-universal.rustore.ru/v1/send` with `Content-Type: application/json`; a validated configured endpoint may replace only that URL. No direct-RuStore bearer authorization header is sent.
2. The serialized body has exactly the Universal topology: `providers.rustore.{project_id,auth_token}`, `tokens.rustore: [token]`, and `message.data`. It has no top-level `projectId`, flat `tokens`, flat `data`, or bearer/direct API credential.
3. Typed route/surface/kind payload reaches `message.data` unchanged. A one-target send names only that RuStore target/provider; request result and logs expose neither credential nor token.
4. HTTP success is `{ ok: true }`. HTTP validation/auth/internal/provider failures, network failure and timeout are non-secret typed provider errors and do not deactivate a target. Cleared timeout state cannot abort or leak into a later send.
5. Official one-token error vocabulary `errors: ["rustore: invalid tokens ..."]` maps exactly to `{ ok: false, code: "invalid_token", invalidToken: true }`; the composite seam idempotently deactivates only that target ID. `invalid auth token` and every other provider message do not deactivate it.
6. Required fault injections and expected red assertions: restore bearer/flat direct body → Universal request/header assertion; swap project ID and target token → nested provider/token body assertion; classify `invalid auth token` as invalid token → target remains active assertion; ignore official invalid-token vocabulary → typed invalid outcome and deactivation assertion; remove timeout cleanup → later independent send completes without inherited abort assertion.

This is a behavioral acceptance contract, not a source-text or documentation-scraping test plan.
