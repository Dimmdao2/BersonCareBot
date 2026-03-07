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

## Code validation status (2026-03-07)

### Short conclusion

- **Scripts parse successfully.**
- **Script matching/selection works for the current JSON structure.**
- **Not all current script semantics execute correctly at runtime.**

### What is confirmed to work in code

- `scripts.json` is validated and loaded by content registry.
- `match` is preserved through `contentRegistry` -> `contentPort` -> orchestrator.
- Current matcher shape used in business scripts is supported:
  - `match.input.text`
  - `match.input.action`
  - `match.input.entity`
  - `match.input.status`
  - `match.input.textPresent`
  - `match.input.phonePresent`
  - `match.input.excludeActions`
  - `match.input.excludeTexts`
  - `match.context.conversationState`
  - `match.context.linkedPhone`
- Current transport events used in scripts are mapped into runtime input correctly:
  - Telegram -> `message.received`, `callback.received`
  - Rubitime -> `webhook.received`
- All action kinds currently used in the two script files have executor handling:
  - `event.log`
  - `booking.upsert`
  - `message.send`
  - `message.replyKeyboard.show`
  - `message.inlineKeyboard.show`
  - `message.edit`
  - `callback.answer`
  - `admin.forward`
  - `user.state.set`
  - `user.phone.link`
  - `notifications.toggle`

### Evidence checked

- Focused tests for content loading, routing, plan building, and executor behavior passed: **35/35**.
- Real plans were built from current `src/content/telegram/scripts.json` and `src/content/rubitime/scripts.json`.

### What does not fully work today

#### 1. Template variables are not fully rendered in the production pipeline

- Orchestrator injects template text by `templateKey`, but only copies raw template text into payload fields.
- It does **not** render placeholders like `{{name}}`, `{{messageText}}`, `{{event.payload.body.data.record}}` at this stage.
- Executor can render templates only when a `TemplatePort` is provided, but current incoming-event pipeline does not pass such dependency into executor.

Result:
- Rubitime notification texts may leave raw placeholders in outgoing messages.
- Telegram `admin.forward` template text may leave raw placeholders in outgoing messages.

#### 2. Telegram button labels from `textTemplateKey` are effectively broken in the real pipeline

- `message.replyKeyboard.show` and `message.inlineKeyboard.show` rely on button labels such as `textTemplateKey: "telegram:menu.book"`.
- Those button texts are resolved only in executor via template rendering.
- In the current production pipeline no `TemplatePort` is wired into executor.

Result:
- Menu/button markup is built, but button captions become empty strings in real execution.

#### 3. Some script placeholders reference fields that are not populated anywhere

- `{{context.adminChatId}}`
- `{{context.bookingWidgetUrl}}`
- `{{actor.displayName}}`

These fields are present in script content, but no confirmed runtime population path was found for them.

Result:
- These values currently resolve to empty strings unless injected elsewhere outside the inspected path.

#### 4. `params.vars` in `admin.forward` is not enough on its own

- Script defines `vars` for `telegram:adminForward`.
- Current orchestrator interpolates `params.vars`, but then replaces `templateKey` with raw template text.
- Final template rendering against `vars` does not happen in the production path.

Result:
- The script shape is accepted and parsed, but intended templating semantics are incomplete.

### Final assessment

The current business script format is **structurally valid and parseable** in code.

However, the runtime support is only **partially complete**:
- **selection works**,
- **action dispatch works**,
- but **template-backed content semantics are incomplete in the real pipeline**.

So the accurate status is:

> The format is loaded and matched successfully, but not all existing script content executes with the intended rendered output.
