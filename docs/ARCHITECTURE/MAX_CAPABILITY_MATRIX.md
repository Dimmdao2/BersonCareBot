# MAX vs Telegram — capability matrix

This document records which Telegram mechanics are **fully supported**, **partially supported**, or **not supported** in the MAX integration, and the chosen fallback where applicable.

Reference: [MAX API docs](https://dev.max.ru/docs-api), [Telegram Bot API](https://core.telegram.org/bots/api).

## Incoming

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Text message | full | full | `message_created` with `message.text` mapped to `message.received`. |
| Callback (button press) | full | full | `message_callback` with `callback_id`, `payload` mapped to `callback.received`. |
| Contact request | full | partial | MAX has `request_contact` button type; flow parity not yet verified. |
| /start, bot_started | full | full | `bot_started` and `/start` text both open start flow. |
| Reply keyboard (persistent bottom buttons) | full | unsupported | MAX uses inline keyboard only; we use inline menu as fallback. |

## Outgoing

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Send text | full | full | POST `/messages?user_id=`. |
| Send with inline keyboard | full | full | `attachments` with `inline_keyboard` and `callback` / `link` buttons. |
| Edit message text | full | full | PUT `/messages?message_id=` (MAX allows edit within 24h). |
| Edit message reply markup | full | full | Same PUT with `attachments` (inline keyboard). |
| Answer callback | full | full | POST `/answers` with `callback_id`. |
| Reply keyboard (persistent) | full | unsupported | Fallback: use inline keyboard for menu. |
| Parse mode (HTML/Markdown) | full | full | MAX supports `format: "html"` / `"markdown"` in NewMessageBody. |

## Notifications

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Bot-initiated message to user | full | full | Same POST `/messages` by `user_id`. |
| Notifications via platform | full | full | Delivered as normal messages. |

## Web App / deep links

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Open Web App (Mini App) | full | partial | MAX has `open_app` button type; URL and init data flow to be verified. |
| Deep link with start param | full | partial | Depends on MAX deep link format. |

## Webhook and dev workflow

| Mechanic | Telegram | MAX | Notes |
|----------|----------|-----|------|
| Webhook (HTTPS) | full | full | POST `/webhook/max`, secret in `X-Max-Bot-Api-Secret`. |
| Long polling | supported | full | GET `/updates` for dev when webhook not set. |
| **Production blocker** | — | HTTPS only, port 443 | MAX does not deliver to HTTP or non-443. Use public HTTPS URL or long-poll for dev. |

## Summary

- **Fully supported in MAX for MVP:** receive text/callback, send text, inline keyboard, edit message, answer callback, HTML/Markdown.
- **Partial / not yet used:** contact request, open_app (Web App), deep links.
- **Unsupported (with fallback):** reply keyboard → use inline keyboard for main menu.
