# VK messenger

VK is an operational messenger channel, not the VK ID OAuth provider. The integrator owns one
Callback API route, `POST /webhook/vk`, and the existing outgoing-delivery dispatch selects the
same durable attempt/retry boundary used by Telegram and MAX.

## Configuration

Set the three global `public.system_settings` values through the admin settings surface:

- `vk_community_access_token` — community token with the `messages` permission;
- `vk_callback_secret` — Callback API secret;
- `vk_callback_confirmation_token` — the confirmation string issued by VK.

Then enable `vk` in `platform_integration_availability`. The channel stays disabled by default;
this prevents queue attempts before credentials and Callback API are configured. A tariff-gated
clinic may set `clinic_vk_community_access_token` for outbound messages; essential delivery falls
back to the platform community when that credential is absent or rejected. Inbound traffic remains
on the platform Callback API route.

## Contract

- `confirmation` responds with the configured confirmation token.
- Every accepted callback is authenticated by the configured secret and responds with plain `ok`.
- `message_new` text becomes a canonical incoming message. A message containing attachments is
  intentionally represented as `unsupported`, so the common unsupported-content flow responds
  instead of dropping it.
- `message_event` becomes the common callback event and uses the VK `event_id:user_id:peer_id`
  identity for deduplication and `messages.sendMessageEventAnswer` for callback feedback.
- Outbound text uses `messages.send` and derives a deterministic, non-zero `random_id` from the
  durable outgoing event id. Provider recipient-denial codes are normalized to the existing
  `recipient_blocked_bot` outcome; all other provider failures stay retryable at the common queue.

Protocol authority: [messages.send](https://dev.vk.com/ru/method/messages.send),
[Callback API getting started](https://dev.vk.com/ru/api/callback/getting-started), and
[messages.sendMessageEventAnswer](https://dev.vk.com/ru/method/messages.sendMessageEventAnswer).
