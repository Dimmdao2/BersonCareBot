# Script Actions

| action | status | note |
| --- | --- | --- |
| `user.phone.link` | EXECUTABLE_NOW | Direct executor support writes `user.phone.link`; payload shape matches current Telegram script usage. |
| `user.state.set` | EXECUTABLE_NOW | Direct executor support writes `user.state.set`; string `channelId`/`channelUserId` is accepted by DB write path. |
| `message.send` | BLOCKED_BY_PAYLOAD_SHAPE | Template text is resolved before execution, and transport path exists, but script interpolation leaves `recipient.chatId` as a string. Executor passes it through unchanged, while Telegram delivery requires numeric `chatId`. |
| `notifications.toggle` | BLOCKED_MISSING_SUPPORT | Direct executor support exists for single-category toggles, but `notify_toggle_all` is gated by `supportsToggleAll === true`, which current scripts never provide. |
| `callback.answer` | EXECUTABLE_NOW | Direct executor support produces a `callback.answer` intent; contracts, dispatch, and Telegram adapter all accept the current payload shape. |

# Script Execution Status

| scriptId | status | blockers | note |
| --- | --- | --- | --- |
| `message.received` | PARTIALLY_EXECUTABLE | `message.send` payload-shape mismatch | This is one of the only routed Telegram scripts. State writes and phone linking can execute, but all outbound messages depend on `recipient.chatId`, which arrives as a string after interpolation. |
| `callback.received` | PARTIALLY_EXECUTABLE | `message.send` payload-shape mismatch; incomplete `notify_toggle_all` support | This is the other routed Telegram script. `callback.answer` works, individual notification toggles work, but outgoing refresh messages still depend on string `chatId`; `notify_toggle_all` does not fully execute. |
| `telegram.message.dispatch` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Duplicates `message.received` logic, but nothing routes to it and nothing invokes it as a subflow. |
| `telegram.start` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Internals are simple, but the script is unreachable in the current pipeline. |
| `telegram.ask` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Unreachable helper flow. |
| `telegram.ask.question` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Unreachable helper flow; both admin-forward and user-confirmation sends depend on numeric `chatId`. |
| `telegram.contact.link` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Write steps are executable in isolation, but the script is not wired and its sends still fail on `chatId` shape. |
| `telegram.booking` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Unreachable helper flow. |
| `telegram.more` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Unreachable helper flow. |
| `telegram.notifications.show` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Unreachable helper flow; also still only sends plain text, not interactive inline markup. |
| `telegram.notifications.toggle` | LOGICAL_ONLY | no route; no `flow.invoke`; incomplete `notify_toggle_all`; `message.send` payload-shape mismatch | Unreachable helper flow. |
| `telegram.menu.myBookings` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Unreachable helper flow. |
| `telegram.menu.back` | LOGICAL_ONLY | no route; no `flow.invoke`; `message.send` payload-shape mismatch | Unreachable helper flow. |

# Remaining Blockers

## 1. `flow.invoke` / script reachability

- **Blocker name:** `flow.invoke`
- **Affected scripts:** `telegram.message.dispatch`, `telegram.start`, `telegram.ask`, `telegram.ask.question`, `telegram.contact.link`, `telegram.booking`, `telegram.more`, `telegram.notifications.show`, `telegram.notifications.toggle`, `telegram.menu.myBookings`, `telegram.menu.back`
- **Why it blocks execution:** current Telegram routes only target `telegram:message.received` and `telegram:callback.received`. No current route points at the helper scripts above, and no flow-control action exists to invoke them as subflows.
- **Suggested future layer:** executor / orchestrator flow-control

## 2. Numeric Telegram id coercion (`chatId` / `messageId`)

- **Blocker name:** payload numeric coercion
- **Affected scripts:** every script that emits `message.send` with `recipient.chatId`, especially `message.received` and `callback.received`; any future script using `message.edit`, `message.replyMarkup.edit`, `message.replyKeyboard.show`, `message.inlineKeyboard.show`, or `admin.forward` with interpolated ids
- **Why it blocks execution:** orchestrator interpolation turns `"{{event.payload.incoming.chatId}}"` into a string. `message.send` forwards that payload unchanged, and Telegram delivery rejects non-numeric `chatId`. For `message.edit` / `message.replyMarkup.edit` / lowering actions, executor only accepts numeric top-level `chatId` and `messageId` via strict number checks.
- **Suggested future layer:** preprocessing / utility coercion, or executor normalization

## 3. `notifications.toggle` incomplete `notify_toggle_all`

- **Blocker name:** `notify_toggle_all` support gap
- **Affected scripts:** `callback.received`, `telegram.notifications.toggle`
- **Why it blocks execution:** executor only applies all-on/all-off logic when `supportsToggleAll === true`. Current scripts pass `toggleKey` only, so `notify_toggle_all` produces no full toggle behavior.
- **Suggested future layer:** executor

## Confirmed not current blockers

The following expected blockers are **not currently used** in `src/content/telegram/scripts.json`, so they are not what blocks the current Telegram script layer today:

- `guard.start.dedup`
- `command.parse`
- `phone.normalize`
- `phone.validate`

# Telegram UI Intent Path

| behavior | status | note |
| --- | --- | --- |
| `message.send` | PARTIAL | Executor, intent model, dispatch path, and Telegram adapter all exist. Current Telegram scripts still fail in practice because interpolated `recipient.chatId` is a string, not a number. |
| `message.edit` | PARTIAL | Full path exists in contracts/executor/dispatch/adapter. Remaining risk is script-layer payload shape: executor only reads numeric top-level `chatId` and `messageId`. |
| `message.replyMarkup.edit` | PARTIAL | Full path exists in contracts/executor/dispatch/adapter. Same numeric id coercion risk as `message.edit`. |
| `callback.answer` | COMPLETE | Executor emits the intent, outgoing intent model includes the type, dispatch routes non-message intents by source, and Telegram adapter handles `callbackQueryId` directly. |

# Lowering Path Audit

| source action | status | is lowering implemented? | lowered target complete? | payload-shape mismatch risk? | note |
| --- | --- | --- | --- | --- | --- |
| `message.replyKeyboard.show` | PARTIAL | Yes | Yes, lowered to `message.send` with Telegram reply markup | Yes | Lowering exists in executor, but top-level `chatId` must already be numeric. Current script interpolation would produce a string. Current Telegram scripts do not yet use this action. |
| `message.inlineKeyboard.show` | PARTIAL | Yes | Yes, lowered to `message.send` with inline markup | Yes | Same risk as above. Current Telegram scripts do not yet use this action. |
| `admin.forward` | PARTIAL | Yes | Yes, lowered to `message.send` | Yes | Lowering exists, but top-level `chatId` must be numeric. Current `telegram.ask.question` does not use this action yet; it still uses direct `message.send`. |

# Overall State

STILL_LOGICAL

# Next Smallest Useful Step

Add one normalization step for Telegram numeric ids before executor dispatch: coerce interpolated `chatId` and `messageId` values from strings to numbers for script-produced payloads. That single change would unblock the live `message.received` and `callback.received` message paths without requiring any Telegram content rewrite.