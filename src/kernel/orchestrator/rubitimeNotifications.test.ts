import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createContentPort } from '../../infra/adapters/contentPort.js';
import type { BaseContext, ContextQueryPort, IncomingEvent } from '../contracts/index.js';
import { buildPlan } from './resolver.js';

const rootDir = fileURLToPath(new URL('../../../', import.meta.url));

type RubitimeCase = {
  name: string;
  incoming: Record<string, unknown>;
  templateKey: string;
};

const rubitimeCases: RubitimeCase[] = [
  {
    name: 'created',
    incoming: {
      entity: 'record',
      action: 'created',
      phone: '89643805480',
      recordId: 'rec-1',
      recordAt: '2026-03-05 12:00:00',
      recordAtFormatted: '05.03.2026 в 12:00',
      statusCode: '0',
      record: {},
    },
    templateKey: 'rubitime:bookingRecorded',
  },
  {
    name: 'updated recorded',
    incoming: {
      entity: 'record',
      action: 'updated',
      status: 'recorded',
      phone: '89643805480',
      recordId: 'rec-2',
      recordAt: '2026-03-05 12:00:00',
      recordAtFormatted: '05.03.2026 в 12:00',
      statusCode: '0',
      record: {},
    },
    templateKey: 'rubitime:bookingRecorded',
  },
  {
    name: 'updated canceled',
    incoming: {
      entity: 'record',
      action: 'updated',
      status: 'canceled',
      phone: '89643805480',
      recordId: 'rec-3',
      recordAt: '2026-03-05 12:00:00',
      recordAtFormatted: '05.03.2026 в 12:00',
      statusCode: '4',
      record: {},
    },
    templateKey: 'rubitime:bookingCanceled',
  },
  {
    name: 'updated awaiting confirmation',
    incoming: {
      entity: 'record',
      action: 'updated',
      status: 'awaiting_confirmation',
      phone: '89643805480',
      recordId: 'rec-4',
      recordAt: '2026-03-05 12:00:00',
      recordAtFormatted: '05.03.2026 в 12:00',
      statusCode: 'pending',
      record: {},
    },
    templateKey: 'rubitime:bookingAwaitingConfirmation',
  },
  {
    name: 'updated moved awaiting',
    incoming: {
      entity: 'record',
      action: 'updated',
      status: 'moved_awaiting',
      phone: '89643805480',
      recordId: 'rec-5',
      recordAt: '2026-03-05 12:00:00',
      statusCode: 'moved',
      record: {},
    },
    templateKey: 'rubitime:bookingMovedAwaiting',
  },
  {
    name: 'canceled',
    incoming: {
      entity: 'record',
      action: 'canceled',
      phone: '89643805480',
      recordId: 'rec-6',
      recordAt: '2026-03-05 12:00:00',
      recordAtFormatted: '05.03.2026 в 12:00',
      statusCode: '4',
      record: {},
    },
    templateKey: 'rubitime:bookingCanceled',
  },
];

function buildEvent(incoming: Record<string, unknown>): IncomingEvent {
  return {
    type: 'webhook.received',
    meta: {
      eventId: 'evt-rubitime',
      occurredAt: '2026-03-05T12:00:00.000Z',
      source: 'rubitime',
    },
    payload: {
      incoming,
    },
  };
}

const baseContext: BaseContext = {
  actor: { isAdmin: false },
  identityLinks: [],
};

describe('rubitime notification routing', () => {
  it.each(rubitimeCases)('routes $name notification to telegram when linked user exists', async ({ incoming, templateKey }) => {
    const contentPort = createContentPort({ rootDir });
    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({
        type: 'channel.lookupByPhone',
        item: { chatId: 555, channelId: '555', username: 'user' },
      }),
    };

    const plan = await buildPlan({ event: buildEvent(incoming), context: baseContext }, { contentPort, contextQueryPort });
    const sendSteps = plan.filter((step) => step.kind === 'message.send');

    expect(sendSteps).toHaveLength(1);
    expect(sendSteps[0]).toMatchObject({
      payload: {
        recipient: { chatId: 555 },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
        templateKey,
      },
    });
  });

  it.each(rubitimeCases)('routes $name notification to smsc when telegram user is absent', async ({ incoming, templateKey }) => {
    const contentPort = createContentPort({ rootDir });
    const contextQueryPort: ContextQueryPort = {
      request: vi.fn().mockResolvedValue({
        type: 'channel.lookupByPhone',
        item: null,
      }),
    };

    const plan = await buildPlan({ event: buildEvent(incoming), context: baseContext }, { contentPort, contextQueryPort });
    const sendSteps = plan.filter((step) => step.kind === 'message.send');

    expect(sendSteps).toHaveLength(1);
    expect(sendSteps[0]).toMatchObject({
      payload: {
        recipient: { phoneNormalized: '89643805480' },
        delivery: { channels: ['smsc'], maxAttempts: 1 },
        templateKey,
      },
    });
  });
});
