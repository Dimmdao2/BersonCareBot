import { describe, expect, it } from 'vitest';
import type { Action, DbWritePort, DomainContext, OutgoingIntent } from '../../contracts/index.js';
import { executeAction } from './executeAction.js';

const SOURCES = ['telegram', 'max'] as const;

function context(source: (typeof SOURCES)[number]): DomainContext {
  const nowIso = '2026-07-30T10:00:00.000Z';
  return {
    event: {
      type: 'message.received',
      meta: {
        eventId: `event-993-${source}`,
        occurredAt: nowIso,
        source,
      },
      payload: {
        incoming: {
          chatId: source === 'telegram' ? 99301 : '99302',
        },
      },
    },
    nowIso,
    values: {},
    base: {
      actor: { isAdmin: false },
      identityLinks: [],
      facts: {
        links: {
          webappHomeUrl: `https://app.example.test/app/${source}`,
        },
      },
    },
  };
}

const action: Action = {
  id: 'phone-link-993',
  type: 'user.phone.link',
  mode: 'sync',
  params: {
    channelUserId: 'channel-user-993',
    phoneNormalized: '+79990000993',
  },
};

describe('user.phone.link failure output', () => {
  it('keeps the no-channel-binding message without a Telegram/MAX mini-app launch', async () => {
    const writePort: DbWritePort = {
      writeDb: async () => ({
        userPhoneLinkApplied: false,
        phoneLinkReason: 'no_channel_binding',
      }),
    };

    for (const source of SOURCES) {
      const result = await executeAction(action, context(source), { writePort });
      const intent = result.intents?.[0] as OutgoingIntent | undefined;

      expect(result.status).toBe('success');
      expect(result.abortPlan).toBe(true);
      expect(intent?.type).toBe('message.send');
      expect(intent?.payload.message).toEqual({
        text: expect.stringMatching(/\S/),
      });
      expect(intent?.payload.delivery).toEqual({
        channels: [source],
        maxAttempts: 1,
      });
      expect(intent?.payload).not.toHaveProperty('replyMarkup');
    }
  });
});
