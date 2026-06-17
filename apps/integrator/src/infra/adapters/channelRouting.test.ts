/**
 * Unit tests for channelRouting.ts (PLAN S2 DoD).
 * Verifies:
 * 1. readChannel / readChannelWithDefault / readChannelStrict behave identically
 *    to the original per-adapter local copies they replaced (D4).
 * 2. messageToIntent round-trips produce the same JSON as the current hand-rolled
 *    call sites (reportOperatorFailure.ts:90, relayOutboundRoute.buildIntent).
 */
import { describe, expect, it } from 'vitest';
import type { OutgoingIntent } from '../../kernel/contracts/index.js';
import type { UnifiedOutgoingMessage } from '../../kernel/contracts/unifiedMessage.js';
import {
  readChannel,
  readChannelWithDefault,
  readChannelStrict,
  messageToIntent,
} from './channelRouting.js';

// ── readChannel ────────────────────────────────────────────────────────────────

describe('readChannel', () => {
  it('reads channels[0] from payload.delivery.channels for message.send', () => {
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e1', occurredAt: '', source: 'telegram' },
      payload: { delivery: { channels: ['telegram'] } },
    };
    expect(readChannel(intent)).toBe('telegram');
  });

  it('falls back to meta.source for message.send when channels is absent', () => {
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e2', occurredAt: '', source: 'max' },
      payload: {},
    };
    expect(readChannel(intent)).toBe('max');
  });

  it('returns empty string (falsy) when message.send has no channels and source is empty string', () => {
    // meta.source ?? null returns '' for empty string (falsy but not null).
    // The dispatch port treats both null and '' as "no channel" via `if (!channel)`.
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e3', occurredAt: '', source: '' },
      payload: {},
    };
    expect(readChannel(intent)).toBeFalsy();
  });

  it('returns meta.source for non-message.send intents (e.g. callback.answer)', () => {
    const intent: OutgoingIntent = {
      type: 'callback.answer',
      meta: { eventId: 'e4', occurredAt: '', source: 'telegram' },
      payload: {},
    };
    expect(readChannel(intent)).toBe('telegram');
  });

  it('returns null for non-message.send when source is empty (|| null coercion)', () => {
    const intent: OutgoingIntent = {
      type: 'message.delete',
      meta: { eventId: 'e5', occurredAt: '', source: '' },
      payload: {},
    };
    // Non-message.send path uses `source || null`, so '' → null.
    expect(readChannel(intent)).toBeNull();
  });
});

// ── readChannelWithDefault ─────────────────────────────────────────────────────

describe('readChannelWithDefault', () => {
  it('returns the resolved channel when present', () => {
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e6', occurredAt: '', source: 'smsc' },
      payload: { delivery: { channels: ['smsc'] } },
    };
    expect(readChannelWithDefault(intent, 'smsc')).toBe('smsc');
  });

  it('returns the fallback when channel is null (telegram adapter behaviour: fallback=smsc)', () => {
    // This is exactly what telegram/deliveryAdapter.ts did before consolidation.
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e7', occurredAt: '', source: '' },
      payload: {},
    };
    expect(readChannelWithDefault(intent, 'smsc')).toBe('smsc');
  });

  it('smsc adapter: always returns smsc as fallback when no channel set', () => {
    // Mirrors smsc/deliveryAdapter.ts:17 original behaviour (D4).
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e8', occurredAt: '', source: '' },
      payload: { delivery: { channels: [] } },
    };
    expect(readChannelWithDefault(intent, 'smsc')).toBe('smsc');
  });
});

// ── readChannelStrict ──────────────────────────────────────────────────────────

describe('readChannelStrict', () => {
  it('returns channel when present', () => {
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e9', occurredAt: '', source: 'telegram' },
      payload: { delivery: { channels: ['max'] } },
    };
    expect(readChannelStrict(intent)).toBe('max');
  });

  it('throws CHANNEL_NOT_SPECIFIED when channel cannot be determined', () => {
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'e10', occurredAt: '', source: '' },
      payload: {},
    };
    expect(() => readChannelStrict(intent)).toThrow('CHANNEL_NOT_SPECIFIED');
  });
});

// ── messageToIntent ────────────────────────────────────────────────────────────

describe('messageToIntent — round-trip samples', () => {
  const now = '2026-06-17T00:00:00.000Z';

  it('telegram sample — matches reportOperatorFailure.ts hand-rolled shape', () => {
    // The expected shape matches exactly what reportOperatorFailure.ts produces
    // at line ~90 (chatId, channels:['telegram'], maxAttempts:1).
    const msg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'telegram',
      recipient: { chatId: 364943522 },
      content: { text: 'Operator alert: test' },
      meta: {
        eventId: 'op-inc:dedup:364943522',
        occurredAt: now,
        source: 'telegram',
      },
      delivery: { maxAttempts: 1 },
    };

    const intent = messageToIntent(msg);

    expect(intent.type).toBe('message.send');
    expect(intent.meta.source).toBe('telegram');
    expect(intent.meta.eventId).toBe('op-inc:dedup:364943522');
    const payload = intent.payload as Record<string, unknown>;
    expect((payload.recipient as Record<string, unknown>).chatId).toBe(364943522);
    expect((payload.message as Record<string, unknown>).text).toBe('Operator alert: test');
    expect((payload.delivery as Record<string, unknown>).channels).toEqual(['telegram']);
    expect((payload.delivery as Record<string, unknown>).maxAttempts).toBe(1);
    // No extra fields that don't belong.
    expect(payload.recipient).not.toHaveProperty('userId');
    expect(payload.recipient).not.toHaveProperty('email');
  });

  it('max sample — matches relayOutboundRoute.buildIntent max branch', () => {
    // relayOutboundRoute.buildIntent for 'max': recipient:{userId}, channels:['max']
    const msg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'max',
      recipient: { userId: 987654321 },
      content: { text: 'Max message' },
      meta: {
        eventId: 'relay-max-001',
        occurredAt: now,
        source: 'max',
        correlationId: 'idem-key-001',
      },
    };

    const intent = messageToIntent(msg);

    expect(intent.type).toBe('message.send');
    expect(intent.meta.source).toBe('max');
    const payload = intent.payload as Record<string, unknown>;
    expect((payload.recipient as Record<string, unknown>).userId).toBe(987654321);
    expect((payload.delivery as Record<string, unknown>).channels).toEqual(['max']);
    expect((payload.message as Record<string, unknown>).text).toBe('Max message');
  });

  it('email sample — content.subject forwarded as payload.subject (contract fix S9)', () => {
    // Verifies: messageToIntent forwards content.subject → payload.subject,
    // so EmailDeliveryAdapter can read payload.subject as the canonical email subject.
    const msg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'email',
      recipient: { email: 'user@example.com' },
      content: {
        subject: 'Email Subject Line',
        text: 'Body text',
      },
      meta: {
        eventId: 'email:send:abc123',
        occurredAt: now,
        source: 'email',
      },
    };

    const intent = messageToIntent(msg);

    const payload = intent.payload as Record<string, unknown>;
    // payload.subject must be present (canonical email subject path).
    expect(payload.subject).toBe('Email Subject Line');
    // payload.delivery.channels[0] must be 'email'.
    expect((payload.delivery as Record<string, unknown>).channels).toEqual(['email']);
    // recipient.email must be forwarded.
    expect((payload.recipient as Record<string, unknown>).email).toBe('user@example.com');
    // message.text must be forwarded.
    expect((payload.message as Record<string, unknown>).text).toBe('Body text');
  });

  it('smsc sample — matches relayOutboundRoute.buildIntent sms branch (channels=[smsc])', () => {
    // relayOutboundRoute.buildIntent for 'sms': recipient:{phoneNormalized}, channels:['smsc']
    const msg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'smsc',
      recipient: { phoneNormalized: '+79991234567' },
      content: { text: 'Ваш код: 123456' },
      meta: {
        eventId: 'otp:smsc:relay-001',
        occurredAt: now,
        source: 'smsc',
        correlationId: 'otp-idem-001',
      },
    };

    const intent = messageToIntent(msg);

    expect(intent.type).toBe('message.send');
    expect(intent.meta.source).toBe('smsc');
    const payload = intent.payload as Record<string, unknown>;
    expect((payload.recipient as Record<string, unknown>).phoneNormalized).toBe('+79991234567');
    expect((payload.delivery as Record<string, unknown>).channels).toEqual(['smsc']);
    expect((payload.message as Record<string, unknown>).text).toBe('Ваш код: 123456');
    // Only phoneNormalized in recipient — no chatId/userId/email.
    expect(payload.recipient).not.toHaveProperty('chatId');
    expect(payload.recipient).not.toHaveProperty('userId');
    expect(payload.recipient).not.toHaveProperty('email');
  });

  // ── S12: web_push round-trip ────────────────────────────────────────────────
  // DoD: a web_push UnifiedOutgoingMessage → messageToIntent → back preserves all
  // push fields with 1:1 mapping to WebPushClientPayload (no data loss).
  //
  // Field mapping verified here (PLAN S12):
  //   UnifiedContent.title          → payload.title           (WebPushClientPayload.title)
  //   UnifiedContent.text           → payload.message.text    (WebPushClientPayload.body)
  //   UnifiedContent.url            → payload.url             (WebPushClientPayload.url)
  //   pushExtras.tag                → payload.pushExtras.tag
  //   pushExtras.trackingId         → payload.pushExtras.trackingId
  //   pushExtras.topicCode (null)   → payload.pushExtras.topicCode (null preserved)
  //   pushExtras.intentType         → payload.pushExtras.intentType
  //   pushExtras.pushKind           → payload.pushExtras.pushKind
  //   pushExtras.warmupSloganKey    → payload.pushExtras.warmupSloganKey
  //   recipient.pushUserId          → payload.recipient.pushUserId
  //   channel 'web_push'            → payload.delivery.channels[0] = 'web_push'

  it('web_push — round-trips all WebPushClientPayload fields losslessly (S12 DoD)', () => {
    const msg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'web_push',
      recipient: { pushUserId: 'user-uuid-1234' },
      content: {
        title: 'New message from Dr. Ivanov',
        text: 'You have a new reply from your doctor.',
        url: 'https://app.bersoncare.ru/patient/messages',
        pushExtras: {
          tag: 'doctor-reply',
          trackingId: 'track-abc123',
          topicCode: null,          // nullable — must survive as null, not dropped
          intentType: 'doctor_reply',
          pushKind: 'transactional',
          warmupSloganKey: null,    // nullable — must survive as null, not dropped
        },
      },
      meta: {
        eventId: 'web_push:msg:user-uuid-1234:reply-789',
        occurredAt: now,
        source: 'web_push',
      },
    };

    const intent = messageToIntent(msg);

    expect(intent.type).toBe('message.send');
    expect(intent.meta.source).toBe('web_push');
    expect(intent.meta.eventId).toBe('web_push:msg:user-uuid-1234:reply-789');

    const payload = intent.payload as Record<string, unknown>;

    // channel tag in canonical wire location (D2 / D3)
    expect((payload.delivery as Record<string, unknown>).channels).toEqual(['web_push']);

    // recipient.pushUserId forwarded (subscriptions resolved later in S14 adapter)
    expect((payload.recipient as Record<string, unknown>).pushUserId).toBe('user-uuid-1234');
    // No other recipient fields should appear
    expect(payload.recipient).not.toHaveProperty('chatId');
    expect(payload.recipient).not.toHaveProperty('userId');
    expect(payload.recipient).not.toHaveProperty('email');
    expect(payload.recipient).not.toHaveProperty('phoneNormalized');

    // WebPushClientPayload.title → payload.title
    expect(payload.title).toBe('New message from Dr. Ivanov');

    // WebPushClientPayload.body → payload.message.text
    expect((payload.message as Record<string, unknown>).text).toBe('You have a new reply from your doctor.');

    // WebPushClientPayload.url → payload.url
    expect(payload.url).toBe('https://app.bersoncare.ru/patient/messages');

    // All pushExtras forwarded into payload.pushExtras — 1:1 with WebPushClientPayload optional fields
    const extras = payload.pushExtras as Record<string, unknown>;
    expect(extras).toBeDefined();
    expect(extras.tag).toBe('doctor-reply');
    expect(extras.trackingId).toBe('track-abc123');
    // Nullable fields must be preserved as null (not stripped/undefined)
    expect(extras.topicCode).toBeNull();
    expect(extras.intentType).toBe('doctor_reply');
    expect(extras.pushKind).toBe('transactional');
    expect(extras.warmupSloganKey).toBeNull();
  });

  it('web_push — minimal payload (title+text+url only, no extras) round-trips correctly', () => {
    // Ensures sparse web_push messages work (no pushExtras, no optional fields).
    const msg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'web_push',
      recipient: { pushUserId: 'user-uuid-5678' },
      content: {
        title: 'Reminder',
        text: 'Time for your exercise!',
        url: 'https://app.bersoncare.ru/patient',
      },
      meta: {
        eventId: 'web_push:reminder:user-uuid-5678',
        occurredAt: now,
        source: 'web_push',
      },
    };

    const intent = messageToIntent(msg);
    const payload = intent.payload as Record<string, unknown>;

    expect((payload.delivery as Record<string, unknown>).channels).toEqual(['web_push']);
    expect((payload.recipient as Record<string, unknown>).pushUserId).toBe('user-uuid-5678');
    expect(payload.title).toBe('Reminder');
    expect((payload.message as Record<string, unknown>).text).toBe('Time for your exercise!');
    expect(payload.url).toBe('https://app.bersoncare.ru/patient');
    // No pushExtras key at all when not set
    expect(payload.pushExtras).toBeUndefined();
  });
});
