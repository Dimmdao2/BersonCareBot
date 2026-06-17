import { describe, expect, it, vi } from 'vitest';
import {
  messengerPhoneBindDedupKey,
  parseAdminIncidentAlertConfigIntegrator,
  relayMessengerPhoneBindAdminIncident,
} from './adminIncidentAlertRelay.js';
import type { DbPort, DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';

describe('parseAdminIncidentAlertConfigIntegrator', () => {
  it('defaults when null', () => {
    const c = parseAdminIncidentAlertConfigIntegrator(null);
    expect(c.topics.messenger_phone_bind_blocked).toBe(true);
    expect(c.channels.max).toBe(true);
  });

  it('merges known topic flags', () => {
    const c = parseAdminIncidentAlertConfigIntegrator({
      value: { topics: { channel_link: false }, channels: { max: false } },
    });
    expect(c.topics.channel_link).toBe(false);
    expect(c.topics.auto_merge_conflict).toBe(true);
    expect(c.channels.max).toBe(false);
  });
});

describe('messengerPhoneBindDedupKey', () => {
  it('uses conflict key for blocked topic', () => {
    expect(
      messengerPhoneBindDedupKey({
        topic: 'messenger_phone_bind_blocked',
        conflictKey: 'abc',
        reason: 'x',
        candidateIds: [],
        details: {},
      }),
    ).toBe('abc');
  });

  it('is stable under candidate id reorder when no conflict key', () => {
    const base = {
      topic: 'messenger_phone_bind_anomaly' as const,
      conflictKey: null,
      reason: 'r',
      details: {},
    };
    const a = messengerPhoneBindDedupKey({
      ...base,
      candidateIds: ['b', 'a', 'b'],
    });
    const b = messengerPhoneBindDedupKey({
      ...base,
      candidateIds: ['a', 'b'],
    });
    expect(a).toBe(b);
  });
});

/** Build a minimal DbPort mock that returns the given value_json for given setting keys. */
function makeDbPort(settingValues: Record<string, unknown>): DbPort {
  return {
    query: vi.fn(async (_sql: string, params?: unknown[]) => {
      const key = params?.[0] as string | undefined;
      if (key && key in settingValues) {
        return { rows: [{ value_json: settingValues[key] }] };
      }
      return { rows: [] };
    }),
    tx: vi.fn(async (fn: (db: DbPort) => Promise<unknown>) => fn({} as DbPort)),
  } as unknown as DbPort;
}

/** Build a minimal DispatchPort mock that captures dispatched intents. */
function makeDispatchPort(): {
  port: DispatchPort;
  intents: OutgoingIntent[];
} {
  const intents: OutgoingIntent[] = [];
  const port: DispatchPort = {
    dispatchOutgoing: vi.fn(async (intent: OutgoingIntent) => {
      intents.push(intent);
      return {};
    }),
  };
  return { port, intents };
}

/**
 * Operator config with `account_conflicts` enabled and the given channels active.
 */
function operatorCfgJson(channels: { telegram?: boolean; max?: boolean; web_push?: boolean }) {
  return {
    topics: { account_conflicts: true },
    channels: {
      account_conflicts: { telegram: false, max: false, web_push: false, ...channels },
    },
  };
}

describe('relayMessengerPhoneBindAdminIncident — MAX via dispatchPort', () => {
  it('dispatches a max intent with userId recipient when max channel is enabled', async () => {
    const db = makeDbPort({
      operator_health_alert_config: operatorCfgJson({ max: true }),
      admin_max_ids: { value: ['12345'] },
    });
    const { port, intents } = makeDispatchPort();

    await relayMessengerPhoneBindAdminIncident({
      db,
      getDispatchPort: () => port,
      topic: 'messenger_phone_bind_blocked',
      dedupKey: 'test-key',
      lines: ['incident line 1'],
    });

    expect(intents).toHaveLength(1);
    const intent = intents[0]!;
    expect(intent.type).toBe('message.send');
    expect(intent.meta.source).toBe('max');
    expect((intent.payload.recipient as { userId: number }).userId).toBe(12345);
    expect((intent.payload.message as { text: string }).text).toBe('incident line 1');
    expect((intent.payload.delivery as { channels: string[] }).channels).toContain('max');
  });

  it('dispatches to multiple max recipients', async () => {
    const db = makeDbPort({
      operator_health_alert_config: operatorCfgJson({ max: true }),
      admin_max_ids: { value: ['111', '222'] },
    });
    const { port, intents } = makeDispatchPort();

    await relayMessengerPhoneBindAdminIncident({
      db,
      getDispatchPort: () => port,
      topic: 'messenger_phone_bind_anomaly',
      dedupKey: 'multi-key',
      lines: ['line a'],
    });

    expect(intents).toHaveLength(2);
    const userIds = intents.map((i) => (i.payload.recipient as { userId: number }).userId);
    expect(userIds).toContain(111);
    expect(userIds).toContain(222);
  });

  it('skips max dispatch when no dispatch port is provided', async () => {
    const db = makeDbPort({
      operator_health_alert_config: operatorCfgJson({ max: true }),
      admin_max_ids: { value: ['99999'] },
    });

    // No error should be thrown; function simply logs and skips
    await expect(
      relayMessengerPhoneBindAdminIncident({
        db,
        topic: 'messenger_phone_bind_blocked',
        dedupKey: 'no-dispatch',
        lines: ['test'],
      }),
    ).resolves.toBeUndefined();
  });

  it('skips max dispatch when no admin_max_ids are configured', async () => {
    const db = makeDbPort({
      operator_health_alert_config: operatorCfgJson({ max: true }),
      // admin_max_ids not present → empty rows
    });
    const { port, intents } = makeDispatchPort();

    await relayMessengerPhoneBindAdminIncident({
      db,
      getDispatchPort: () => port,
      topic: 'messenger_phone_bind_blocked',
      dedupKey: 'no-ids',
      lines: ['test'],
    });

    expect(intents).toHaveLength(0);
  });

  it('dispatches both telegram and max intents when both channels enabled', async () => {
    const db = makeDbPort({
      operator_health_alert_config: operatorCfgJson({ telegram: true, max: true }),
      admin_telegram_ids: { value: ['55555'] },
      admin_max_ids: { value: ['77777'] },
    });
    const { port, intents } = makeDispatchPort();

    await relayMessengerPhoneBindAdminIncident({
      db,
      getDispatchPort: () => port,
      topic: 'messenger_phone_bind_blocked',
      dedupKey: 'both-channels',
      lines: ['dual channel test'],
    });

    expect(intents).toHaveLength(2);
    const channels = intents.map((i) => i.meta.source);
    expect(channels).toContain('telegram');
    expect(channels).toContain('max');

    const telegramIntent = intents.find((i) => i.meta.source === 'telegram')!;
    expect((telegramIntent.payload.recipient as { chatId: number }).chatId).toBe(55555);

    const maxIntent = intents.find((i) => i.meta.source === 'max')!;
    expect((maxIntent.payload.recipient as { userId: number }).userId).toBe(77777);
  });

  it('does not dispatch when account_conflicts topic is disabled', async () => {
    const db = makeDbPort({
      operator_health_alert_config: {
        topics: { account_conflicts: false },
        channels: { account_conflicts: { telegram: true, max: true } },
      },
    });
    const { port, intents } = makeDispatchPort();

    await relayMessengerPhoneBindAdminIncident({
      db,
      getDispatchPort: () => port,
      topic: 'messenger_phone_bind_blocked',
      dedupKey: 'disabled-topic',
      lines: ['should not be sent'],
    });

    expect(intents).toHaveLength(0);
  });

  it('max eventId is clipped and includes channel and recipient', async () => {
    const db = makeDbPort({
      operator_health_alert_config: operatorCfgJson({ max: true }),
      admin_max_ids: { value: ['42'] },
    });
    const { port, intents } = makeDispatchPort();

    await relayMessengerPhoneBindAdminIncident({
      db,
      getDispatchPort: () => port,
      topic: 'messenger_phone_bind_blocked',
      dedupKey: 'eventid-check',
      lines: ['line'],
    });

    expect(intents).toHaveLength(1);
    const eventId = intents[0]!.meta.eventId as string;
    expect(eventId).toContain('max');
    expect(eventId).toContain('42');
    expect(eventId.length).toBeLessThanOrEqual(240);
  });
});
