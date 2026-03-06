# Business Scripts Format Audit (post alias cleanup)

Date: 2026-03-06  
Scope: `src/content/telegram/scripts.json`, `src/content/rubitime/scripts.json`

## Current strengths of the format

- `match` already expresses business selection clearly by source/event + conditions:
  - Telegram command start: `telegram.start` uses `match.input.text = "/start"`.
  - Telegram stateful flow: `telegram.ask.question` uses `match.context.conversationState` + input guards.
  - Rubitime domain branching: `rubitime.record.updated.accepted` uses structured `match.input` (`entity/action/status`).
- Business scenarios are explicit and readable as ordered `steps`.
- Match criteria are transport-agnostic enough at the selection layer (`input`, `context`, `meta` style patterning), which aligns with script-matcher architecture.

## Current weaknesses of the format

- Delivery/transport policy is still embedded directly in business scenarios (not only in transport adapters/policies):
  - `delivery.channels`, `delivery.maxAttempts`
  - `retry.maxAttempts`, `retry.backoffSeconds`
  - `onFail.fallbackIntent`
  - `recipientPolicy.preferredLinkedChannels`
- Transport-specific terms are mixed into business scripts:
  - hardcoded channel names such as `telegram`, `smsc`
  - transport event names `callback.received`, `webhook.received` inside business script definitions
  - UI transport actions tightly coupled to Telegram (`message.replyKeyboard.show`, `message.inlineKeyboard.show`, `callback.answer`, callback data semantics).
- This coupling makes business intent harder to reuse across channels and shifts delivery strategy decisions into content.

## Concrete examples

### From `src/content/telegram/scripts.json`

- `telegram.ask` and `telegram.ask.question` include direct channel delivery config:
  - `delivery: { channels: ["telegram"], maxAttempts: 1 }`
- Callback transport semantics are encoded in business scenarios:
  - scripts with `event: "callback.received"` (e.g., notifications/menu flows)
  - explicit `callback.answer` step usage.

### From `src/content/rubitime/scripts.json`

- `rubitime.record.created` (and sibling record scenarios) includes delivery policy concerns in-script:
  - `recipientPolicy.preferredLinkedChannels: ["telegram"]`
  - `delivery.channels: ["telegram"]`
  - `retry` block with attempts/backoff
  - `onFail.fallbackIntent` that switches channel to `smsc`.

## Concern separation snapshot

### Matching concerns (keep in scripts)

- `match` predicates over business/event context (`input`, `context`, `meta`) used to choose scenario.

### Business intent concerns (keep in scripts)

- Domain actions and sequencing (e.g., `booking.upsert`, `user.state.set`, notify user/admin).

### Delivery/transport concerns (candidate to extract)

- Channel selection and preferences (`delivery.channels`, `preferredLinkedChannels`)
- Retry and failover policies (`retry`, `onFail`, `fallbackIntent`)
- Transport-specific interaction primitives (`callback.answer`, telegram keyboard/callback details).

## Is current `match` format sufficient for business scenarios?

Short answer: **Yes, with caveat.**  
For scenario selection, current `match` is sufficient and expressive. The main architectural issue is not matching capability, but cross-concern mixing in `steps.params` for delivery/transport policy.

## Next single architectural step (recommended)

Introduce a **delivery-policy resolver outside business scripts** and migrate scripts to intent-only notifications.

Concretely (single step target):
- Stop encoding `retry`, `onFail/fallbackIntent`, `delivery.channels`, `preferredLinkedChannels` directly in business scenarios.
- Replace with a minimal intent marker (e.g., notification intent + template/business payload).
- Resolve channel routing/retry/failover centrally in runtime/dispatcher policy layer.

This keeps `match` and business intent in content while moving operational delivery strategy to infra/runtime where it belongs.
