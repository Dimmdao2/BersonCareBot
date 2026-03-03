import { describe, expect, it, vi } from 'vitest';
import type { IncomingEvent } from '../../contracts/index.js';
import { orchestrateIncomingEventWithDeps } from './orchestrateIncomingEvent.js';

type LinkData = {
  chatId: number;
  telegramId: string;
  username: string;
  phoneNormalized: string | null;
};

function buildEvent(overrides?: Partial<IncomingEvent>): IncomingEvent {
  return {
    type: 'message.received',
    meta: {
      eventId: 'incoming_test_1',
      occurredAt: new Date().toISOString(),
      source: 'telegram',
      correlationId: 'corr-1',
      userId: 'tg-123',
    },
    payload: {
      incoming: {
        kind: 'message',
        chatId: 123,
        telegramId: '123',
        text: '/start rec-1',
        contactPhone: '+7 (999) 123-45-67',
        userRow: null,
        userState: 'await_contact:rubitime_record:rec-1',
        hasLinkedPhone: false,
      },
    },
    ...overrides,
  };
}

function buildDeps() {
  return {
    telegram: {
      userPort: {
        upsertTelegramUser: vi.fn(async () => null),
        setTelegramUserState: vi.fn(async () => undefined),
        getTelegramUserState: vi.fn(async () => 'idle'),
        tryAdvanceLastUpdateId: vi.fn(async () => true),
        tryConsumeStart: vi.fn(async () => true),
      },
      notificationsPort: {
        getNotificationSettings: vi.fn(async () => null),
        updateNotificationSettings: vi.fn(async () => undefined),
      },
      content: {
        mainMenu: { ask: 'ask', book: 'book', more: 'more' },
        mainMenuKeyboard: {},
        requestContactKeyboard: {},
        bookingUrl: 'https://example.test',
        moreMenuInline: {},
        messages: {
          welcome: 'welcome',
          chooseMenu: 'choose',
          describeQuestion: 'describe',
          questionAccepted: 'accepted',
          notImplemented: 'not-implemented',
          bookingMy: 'booking-my',
          confirmPhoneForRubitime: 'confirm-phone',
          bookingOpenPrompt: 'open-prompt',
          bookingOpenButton: 'open-button',
        },
        notificationSettings: { title: 'title', subtitle: 'subtitle' },
        buildNotificationKeyboard: () => ({}),
      },
      linking: {
        adminTelegramId: '99999',
        getRubitimeRecordById: vi.fn(async () => ({
          rubitimeRecordId: 'rec-1',
          phoneNormalized: '+79991234567',
          payloadJson: {},
          recordAt: new Date('2025-02-24T14:00:00Z'),
          status: 'created' as const,
        })),
        findTelegramUserByPhone: vi.fn(async () => null),
        getTelegramUserLinkData: vi.fn(async (): Promise<LinkData> => ({
          chatId: 123,
          telegramId: '123',
          username: 'user',
          phoneNormalized: null,
        })),
        setTelegramUserPhone: vi.fn(async () => undefined),
      },
    },
  };
}

describe('orchestrateIncomingEventWithDeps linking trace', () => {
  it('returns db reads and writes for successful linking flow', async () => {
    const deps = buildDeps();
    const result = await orchestrateIncomingEventWithDeps(buildEvent(), deps);

    expect(result.reads.map((x) => x.type)).toEqual([
      'booking.byRubitimeId',
      'user.byPhone',
      'user.byTelegramId',
    ]);
    expect(result.writes.map((x) => x.type)).toEqual(['user.phone.link', 'user.state.set']);
    expect(result.outgoing.length).toBeGreaterThan(0);
  });

  it('returns user read and state write when phone already linked and contact missing', async () => {
    const deps = buildDeps();
    deps.telegram.linking.getTelegramUserLinkData = vi.fn(async (): Promise<LinkData> => ({
      chatId: 123,
      telegramId: '123',
      username: 'user',
      phoneNormalized: '+79991234567',
    }));

    const event = buildEvent({
      payload: {
        incoming: {
          kind: 'message',
          chatId: 123,
          telegramId: '123',
          text: '/start rec-1',
          userRow: null,
          userState: 'await_contact:rubitime_record:rec-1',
          hasLinkedPhone: false,
        },
      },
    });

    const result = await orchestrateIncomingEventWithDeps(event, deps);
    expect(result.reads.map((x) => x.type)).toEqual(['user.byTelegramId']);
    expect(result.writes.map((x) => x.type)).toEqual(['user.state.set']);
    expect(result.outgoing).toEqual([]);
  });
});
