# D31 VK messenger — independent audit result

- Role: `auditor-live`
- Product SHA: `f72b388538c0f339f5ec57f0f095e74816502497`

Authority: active owner decision Р-D31 (2026-07-31), D31 parts 1/2 and 2/2 in
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, and
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §25. No newer conflicting owner decision was found before the
audit.

## Blind kill-set (written before reading D31 tests)

1. Callback secret verification is bypassed, so a missing or wrong `secret` reaches channel behavior.
2. `confirmation` returns an unrelated/static value, or an unsupported Callback API event is acknowledged as
   accepted.
3. `message_new` loses its stable source/event identity, sender, peer, or text, or is acknowledged without
   reaching the shared event gateway.
4. `message_event` loses its stable source/event identity, sender, peer, or payload, or is acknowledged without
   reaching the shared event gateway.
5. Outbound `messages.send` targets the wrong recipient or derives a different `random_id` for the same delivery
   attempt, allowing a retry to duplicate the user-visible message.
6. A non-2xx VK HTTP response or a VK `error` response body is reported as successful delivery.
7. VK delivery bypasses the shared dispatcher/retry/delivery-journal path, or VK's recipient-blocked protocol
   error is classified as a generic retryable failure.
8. A clinic override without usable credentials suppresses the usable platform sender, crosses organization
   scope, or VK is advertised as available when neither level has a usable sender.

The configuration, migration, clearance, secret-leak, Instagram-removal, and VK-ID separation criteria are
one-time wiring/state properties and are audited by diff and exact searches, not source-text tests.

## Evidence and verdict

**Verdict: FAIL.** The product contains five independently reachable gaps, three of them demonstrated by
red acceptance tests at the user-event boundaries.

### MUST FIX findings

1. **The official `message_new` envelope is rejected before the shared gateway.** VK's official callback
   schema puts the message at `object.message`; `VkCallbackSchema` instead requires `from_id` and `peer_id`
   directly in `object`. A documented callback therefore receives HTTP 400 and the patient message is lost.
   The acceptance assertion at `webhook.route.test.ts:131` is red on the product SHA.
2. **Every outbound VK send is rejected by the shared dispatcher before the adapter and journal.**
   `assertOutboundMessagePolicy()` accepts only Telegram, MAX, email, SMSC and web push. A valid VK
   `message.send` consequently throws `OUTBOUND_MESSAGE_POLICY_DENIED/channel_missing_or_unknown`; neither
   `messages.send` nor the shared delivery-attempt journal is reached. The acceptance assertion at
   `dispatchPort.test.ts:270` is red.
3. **The webapp producer never selects or materializes VK.** The reminder wake target, topic-channel rules,
   channel resolver and delivery materializer contain Telegram/MAX/email/web-push paths but no VK path. A
   VK-linked patient who enabled the channel produces an empty delivery list. The acceptance assertion at
   `runPatientReminderMaterializationWake.audit.unit.test.ts:120` is red.
4. **Platform VK credentials have no existing admin surface and are not client/audit-redacted.** The registry
   declares the three global DB settings, but `/api/platform/settings` does not allow or redact them and the
   platform integrations page renders only Telegram credentials. `/api/admin/settings` returns all platform
   settings through `redactAdminSettingsForClient()`, whose secret list also omits all three keys; the durable
   audit redactor omits them too. Thus the required configured state cannot be created through the existing UI,
   and, if populated through an application DB port, an authorized platform settings GET and its audit trail
   expose the raw credential values. Availability can meanwhile be enabled independently and advertised as
   usable.
5. **The new schema-B migration fails the repository gate.** Its first statement starts with
   `BCB-MIGRATION-VERIFY` rather than the required owner/backfill header. The migration-order shell gate fails,
   and the real-migration test is also stale at 19 while the command observes 20. The privilege gate is green:
   the migration introduces no grant/revoke drift. Separately, webapp typecheck is red because the existing
   settings UI test was not updated for required `vkConfigured`.

### Criteria matrix

| #   | Result | Evidence                                                                                                                                                                                                                                                                          |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | FAIL   | Wrong/missing secret and unsupported events are rejected; confirmation is correct. The actual official `message_new` payload is nevertheless rejected with 400.                                                                                                                   |
| 2   | FAIL   | `message_event` maps into the shared gateway and no separate VK engine was added; actual `message_new` never reaches it.                                                                                                                                                          |
| 3   | FAIL   | The direct client uses `messages.send`, the intended recipient, stable `random_id`, and rejects HTTP/protocol errors; the common dispatcher rejects VK before calling it.                                                                                                         |
| 4   | FAIL   | Direct adapter blocked-recipient classification and clinic fallback work, but all VK intents are denied before shared dispatch/retry/journal.                                                                                                                                     |
| 5   | FAIL   | Runtime and clinic reads use existing Drizzle ports with exact organization scoping; platform configuration is absent and the platform VK secret keys are omitted from client/audit redaction. No new secret env key or secret value was found in the product diff/generated SQL. |
| 6   | FAIL   | Clinic setting uses existing entitlement/clearance, but platform credentials cannot be managed and availability can claim VK without a configured sender.                                                                                                                         |
| 7   | FAIL   | Generated snapshots contain the new keys and no privilege grant/revoke; the migration itself fails the active schema-B static gate.                                                                                                                                               |
| 8   | PASS   | Exact source search found only the test asserting removed Instagram stays absent. VK ID uses `vk_id_*`/`user_oauth_bindings`; messenger uses `vk_*`/`user_channel_bindings`.                                                                                                      |
| 9   | FAIL   | Both active D31 checkboxes are `[x]`, while inbound, producer, dispatcher, configuration and migration evidence above is red.                                                                                                                                                     |

### Blind mutation ledger

- secret comparison bypassed -> `rejects an unauthenticated callback before the gateway` changed from expected
  403 to 500;
- parse failure acknowledged as `ok` -> `rejects unsupported Callback API event types before the gateway`
  changed from expected 400 to 200;
- official `message_new` envelope -> baseline product defect: `accepts the documented message_new envelope...`
  is red at 400 before the gateway;
- `message_event.peer_id` shifted by one -> the canonical gateway assertion reported `chatId` 18 instead of 17;
- `messages.send.user_id` shifted by one -> the request assertion reported recipient 18 instead of 17;
- `random_id` salted per request -> the stable retry assertion observed two different IDs;
- non-2xx guard removed -> `rejects non-success HTTP responses...` resolved with message id 42 instead of
  rejecting;
- VK error 901 removed from the blocked set -> `normalizes VK recipient denial...` received `VkApiError`
  instead of `RecipientBlockedBotError`;
- clinic-to-platform fallback call removed -> the shared-dispatch fallback assertion rejected with
  `clinic_provider_failed`;
- common VK dispatch -> baseline product defect: the acceptance assertion rejects with
  `OUTBOUND_MESSAGE_POLICY_DENIED` before adapter/journal;
- VK reminder materialization -> baseline product defect: the acceptance assertion receives `[]` deliveries.

Every temporary production mutation was reverted before validation. No product source file remains modified.

### Commands and observed results

- `pnpm --dir apps/integrator exec vitest --run src/integrations/vk/client.unit.test.ts src/integrations/vk/mapIn.unit.test.ts src/integrations/vk/webhook.route.test.ts src/integrations/clinicDeliveryAdapters.unit.test.ts src/infra/adapters/dispatchPort.test.ts`
  -> 2 failed and 25 passed assertions: the two failures are findings 1 and 2.
- `pnpm --dir apps/webapp exec vitest --run src/app-layer/reminders/runPatientReminderMaterializationWake.audit.unit.test.ts`
  -> 1 failed and 1 passed assertion: the failure is finding 3.
- `pnpm --dir apps/integrator typecheck` and `pnpm --dir apps/integrator lint` -> passed.
- `pnpm --dir apps/webapp run typecheck` -> failed at
  `ClinicDeliveryChannelsSection.ui.test.tsx:9` because required `vkConfigured` is absent.
- `pnpm --dir apps/webapp run lint` -> ESLint had 0 errors and 2 pre-existing warnings, then the command failed
  at `check-drizzle-migration-order.sh` on migration statement 1.
- `bash apps/webapp/scripts/check-drizzle-migration-order.sh` -> failed on statement 1 missing a valid
  owner/backfill header.
- `node scripts/check-migration-privileges.mjs` -> passed for 21 migration files.
- `node --test deploy/postgres/privileges/migration-order.test.mjs` -> 1 of 22 tests failed: expected 19 real
  migrations, observed 20.
- Instagram absence was checked with `code-search` query
  `Instagram integration registry descriptor incoming outbound integrator`, exact
  `rg -n -i '\binstagram\b|\binsta\b' apps packages deploy`, exact registry-symbol search, and direct review of
  `apps/integrator/src/integrations/registry.ts`; only the negative registry test matched.
- Secret/env absence was checked over `git diff a72170ba4..f72b38853`, `.env.example`, `apps/*/.env.example`,
  `deploy/env`, and `deploy`; matches were API constants/error strings and documented DB setting names, not secret
  values or new environment configuration.

No DEV/TEST/PROD database, live VK endpoint, real secret, disposable database, or full CI was used.

Official protocol oracle: VK's primary
[`callback/objects.json`](https://github.com/VKCOM/vk-api-schema/blob/master/callback/objects.json) and
[`messages/methods.json`](https://github.com/VKCOM/vk-api-schema/blob/master/messages/methods.json).
