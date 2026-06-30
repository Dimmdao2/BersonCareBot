/**
 * Typed view over OutgoingIntent. The send module maps this to/from the legacy `payload` JSON;
 * the wire/DB shape is unchanged (see PLAN D2). Channel vocabulary frozen per D3: note `smsc`
 * (not `sms`) matches the registered smscDeliveryAdapter.canHandle and relayOutboundRoute.buildIntent.
 */
import type { IntentMeta, OutgoingIntentType } from './events.js';

/**
 * Supported channel tags (frozen per PLAN D3).
 * NOTE: SMS channel tag is `'smsc'` — not `'sms'`. This is what smsc/deliveryAdapter.ts:16
 * matches in `canHandle` and what relayOutboundRoute.buildIntent already emits
 * (`delivery.channels:['smsc']`). Do NOT rename (out of scope; D3).
 */
export type Channel = 'telegram' | 'max' | 'smsc' | 'email' | 'web_push';

/**
 * Per-channel typed recipient union. The channel decides which field is read by the
 * corresponding DeliveryAdapter; all fields are optional to allow a single type
 * to express any channel's recipient without forced narrowing at the call site.
 */
export type UnifiedRecipient = {
  /** Telegram chatId or MAX chatId (number or numeric string). */
  chatId?: number | string;
  /** MAX platform userId. */
  userId?: number | string;
  /** E.164 phone number for SMSC (e.g. "+79991234567"). */
  phoneNormalized?: string;
  /** Email address for the email channel. */
  email?: string;
  /** Integrator/webapp user id whose active web-push subscriptions receive the push. */
  pushUserId?: string;
};

/**
 * Channel-agnostic message content. Each DeliveryAdapter reads only the fields
 * relevant to its channel. web_push extras live in `pushExtras` to avoid
 * polluting the flat namespace.
 */
export type UnifiedContent = {
  /** Body text (messenger, SMS, email plain-text). */
  text?: string;
  /** Title for web_push and messenger (NOT the email subject — use `subject` for email). */
  title?: string;
  /** Email subject line. Forwarded as `payload.subject` by messageToIntent.
   *  The EmailDeliveryAdapter reads `payload.subject ?? payload.title` so existing
   *  call sites that set only `title` keep working, but new email call sites should
   *  always set `content.subject` (contract fix, PLAN S9). */
  subject?: string;
  /** CTA URL for web_push or email. */
  url?: string;
  /** Email HTML body (takes precedence over `text` for HTML-capable email clients). */
  html?: string;
  /** Email `from` override; falls back to system SMTP `from` when omitted (PLAN N2 / §5b). */
  fromOverride?: string;
  /** Telegram/MAX reply keyboard/inline markup (JSON). */
  replyMarkup?: unknown;
  /** Telegram/MAX parse mode. */
  parse_mode?: 'HTML' | 'Markdown';
  // eslint-disable-next-line no-secrets/no-secrets -- type/field names in JSDoc, not secrets
  /**
   * web_push specific extras that map 1:1 to WebPushClientPayload fields
   * (apps/webapp/src/modules/web-push/sendWebPushToSubscriptions.ts).
   *
   * Field mapping to WebPushClientPayload (superset — no data loss):
   *   UnifiedContent.title          → WebPushClientPayload.title   (required in push)
   *   UnifiedContent.text           → WebPushClientPayload.body    (required in push)
   *   UnifiedContent.url            → WebPushClientPayload.url     (required in push)
   *   pushExtras.tag                → WebPushClientPayload.tag?
   *   pushExtras.trackingId         → WebPushClientPayload.trackingId?
   *   pushExtras.topicCode          → WebPushClientPayload.topicCode?    (string | null)
   *   pushExtras.intentType         → WebPushClientPayload.intentType?   (string | null)
   *   pushExtras.pushKind           → WebPushClientPayload.pushKind?     (string | null)
   *   pushExtras.warmupSloganKey    → WebPushClientPayload.warmupSloganKey? (string | null)
   *
   * Nullable fields preserved as `string | null` to match the source type exactly.
   */
  pushExtras?: {
    tag?: string;
    trackingId?: string;
    /** Matches WebPushClientPayload.topicCode?: string | null */
    topicCode?: string | null;
    /** Matches WebPushClientPayload.intentType?: string | null */
    intentType?: string | null;
    /** Matches WebPushClientPayload.pushKind?: string | null */
    pushKind?: string | null;
    // eslint-disable-next-line no-secrets/no-secrets -- field name in JSDoc, not a secret
    /** Matches WebPushClientPayload.warmupSloganKey?: string | null */
    warmupSloganKey?: string | null;
    /** Reminder occurrence id — enables snooze/skip action buttons in the service worker. */
    occurrenceId?: string | null;
  };
};

/**
 * Unified typed outgoing message (PLAN D2 / Inventory §4.4 target shape).
 * This is a typed superset of today's OutgoingIntent: the send module maps it
 * to/from the legacy `payload` JSON but the on-the-wire/in-DB JSON shape
 * (outgoing_delivery_queue.payload_json.intent) is unchanged.
 */
export type UnifiedOutgoingMessage = {
  /** Maps to OutgoingIntent.type. Typically `'message.send'` for channel messages. */
  kind: OutgoingIntentType;
  /** Single canonical channel tag (PLAN D3). */
  channel: Channel;
  /** Per-channel typed recipient. */
  recipient: UnifiedRecipient;
  /** Channel-agnostic content. */
  content: UnifiedContent;
  /** Same as OutgoingIntent.meta / IntentMeta. */
  meta: IntentMeta;
  /**
   * Optional delivery hints. `maxAttempts` mirrors OutgoingIntent payload.delivery.maxAttempts.
   * `fallbackChannels` is for future use (PLAN §0); not consumed by the dispatcher today.
   */
  delivery?: {
    maxAttempts?: number;
    fallbackChannels?: Channel[];
  };
};
