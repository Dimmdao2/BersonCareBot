import { describe, expect, it, vi } from 'vitest';
import type { BaseContext, ContentPort, ContextQueryPort, IncomingEvent } from '../contracts/index.js';
import { buildPlan } from './resolver.js';

type EventInput = {
  source?: string;
  type?: IncomingEvent['type'];
  correlationId?: string;
  userId?: string;
  tenantId?: string;
};

function createEvent(partial?: EventInput): IncomingEvent {
  const meta: Record<string, unknown> = {
    eventId: 'evt-1',
    occurredAt: '2026-03-06T00:00:00.000Z',
    source: partial?.source ?? 'telegram',
  };
  if (typeof partial?.correlationId === 'string') meta.correlationId = partial.correlationId;
  if (typeof partial?.userId === 'string') meta.userId = partial.userId;
  if (typeof partial?.tenantId === 'string') meta.tenantId = partial.tenantId;

  return {
    type: partial?.type ?? 'message.received',
    meta: meta as IncomingEvent['meta'],
    payload: {},
  };
}

const baseContext: BaseContext = {
  actor: { isAdmin: false },
  identityLinks: [],
};

const contextQueryPort: ContextQueryPort = {
  request: vi.fn().mockResolvedValue({}),
};

describe('orchestrator routing', () => {
  it('selects script by source/event match', async () => {
    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'message.received',
          source: 'telegram',
          event: 'message.received',
          steps: [{ action: 'event.log', params: {} }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan({ event: createEvent(), context: baseContext }, { contentPort, contextQueryPort });

    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('telegram');
    expect(plan.length).toBeGreaterThan(0);
  });

  it('uses first matching script on specificity tie', async () => {
    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'first',
          source: 'telegram',
          event: 'message.received',
          match: { input: { action: 'book' } },
          steps: [{ action: 'event.log', params: { selected: 'first' } }],
        },
        {
          id: 'second',
          source: 'telegram',
          event: 'message.received',
          match: { input: { action: 'book' } },
          steps: [{ action: 'event.log', params: {} }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan(
      { event: { ...createEvent(), payload: { action: 'book' } }, context: baseContext },
      { contentPort, contextQueryPort },
    );

    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('telegram');
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]?.payload).toMatchObject({ selected: 'first' });
  });

  it('supports shallow meta matching', async () => {
    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'tenant-a',
          source: 'telegram',
          event: 'message.received',
          match: { meta: { tenantId: 'tenant-a' } },
          steps: [{ action: 'event.log', params: {} }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan(
      { event: createEvent({ tenantId: 'tenant-a' }), context: baseContext },
      { contentPort, contextQueryPort },
    );

    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('telegram');
    expect(plan.length).toBeGreaterThan(0);
  });

  it('supports matching by generic facts container', async () => {
    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'facts-match',
          source: 'telegram',
          event: 'message.received',
          match: { facts: { menu: { target: 'bookings' } } },
          steps: [{ action: 'event.log', params: { matched: true } }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan(
      {
        event: createEvent(),
        context: {
          ...baseContext,
          facts: {
            menu: {
              target: 'bookings',
            },
          },
        },
      },
      { contentPort, contextQueryPort },
    );

    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]?.payload).toMatchObject({ matched: true });
  });

  it('builds plan from business scripts when only source scripts are present', async () => {
    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'legacy',
          source: 'rubitime',
          event: 'webhook.received',
          steps: [{ action: 'event.log', params: {} }],
        },
      ]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan(
      { event: createEvent({ source: 'rubitime', type: 'webhook.received' }), context: baseContext },
      { contentPort, contextQueryPort },
    );

    expect(plan.length).toBeGreaterThan(0);
    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('rubitime');
  });

  it('returns empty plan when no business script matches and does not use legacy key', async () => {
    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan(
      { event: createEvent({ source: 'unknown', type: 'message.received' }), context: baseContext },
      { contentPort, contextQueryPort },
    );

    expect(plan).toEqual([]);
    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('unknown');
  });

  it('calls getScripts with scope (source + audience) when port provides getScripts', async () => {
    const getScripts = vi.fn().mockResolvedValue([
      {
        id: 'user.script',
        source: 'telegram',
        event: 'message.received',
        steps: [{ action: 'event.log', params: {} }],
      },
    ]);
    const contentPort: ContentPort = {
      getScripts,
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    await buildPlan({ event: createEvent(), context: baseContext }, { contentPort, contextQueryPort });

    expect(getScripts).toHaveBeenCalledWith({ source: 'telegram', audience: 'user' });
  });

  it('calls getScripts with admin audience when context.actor.isAdmin is true', async () => {
    const getScripts = vi.fn().mockResolvedValue([
      {
        id: 'admin.script',
        source: 'telegram',
        event: 'message.received',
        steps: [{ action: 'event.log', params: {} }],
      },
    ]);
    const contentPort: ContentPort = {
      getScripts,
      getTemplate: vi.fn().mockResolvedValue(null),
    };
    const adminContext: BaseContext = { ...baseContext, actor: { isAdmin: true } };

    await buildPlan({ event: createEvent(), context: adminContext }, { contentPort, contextQueryPort });

    expect(getScripts).toHaveBeenCalledWith({ source: 'telegram', audience: 'admin' });
  });

  it('selects diary script when context.conversationState is diary.symptom.awaiting_title and user sends text', async () => {
    const getScripts = vi.fn().mockResolvedValue([
      {
        id: 'telegram.menu.default',
        source: 'telegram',
        event: 'message.received',
        match: {
          actor: { isAdmin: false },
          context: { conversationState: { $notIn: ['diary.symptom.awaiting_title', 'diary.lfk.awaiting_title'] } },
          input: { textPresent: true },
        },
        steps: [{ action: 'event.log', params: { selected: 'menu.default' } }],
      },
      {
        id: 'telegram.diary.symptom.awaiting_title',
        source: 'telegram',
        event: 'message.received',
        match: {
          actor: { userState: 'diary.symptom.awaiting_title' },
          input: { textPresent: true },
        },
        steps: [{ action: 'event.log', params: { selected: 'diary.symptom' } }],
      },
    ]);
    const contentPort: ContentPort = {
      getScripts,
      getTemplate: vi.fn().mockResolvedValue(null),
    };
    const plan = await buildPlan(
      {
        event: {
          ...createEvent(),
          payload: {
            incoming: {
              text: 'Головная боль',
              chatId: 123,
              channelUserId: 456,
            },
          },
        },
        context: { ...baseContext, conversationState: 'diary.symptom.awaiting_title' },
      },
      { contentPort, contextQueryPort },
    );
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]?.payload).toMatchObject({ selected: 'diary.symptom' });
  });

  it('selects menu.default when conversationState is idle and user sends text (excludes diary awaiting)', async () => {
    const getScripts = vi.fn().mockResolvedValue([
      {
        id: 'telegram.menu.default',
        source: 'telegram',
        event: 'message.received',
        match: {
          actor: { isAdmin: false },
          context: { conversationState: { $notIn: ['diary.symptom.awaiting_title', 'diary.lfk.awaiting_title'] } },
          input: { textPresent: true },
        },
        steps: [{ action: 'event.log', params: { selected: 'menu.default' } }],
      },
    ]);
    const contentPort: ContentPort = {
      getScripts,
      getTemplate: vi.fn().mockResolvedValue(null),
    };
    const plan = await buildPlan(
      {
        event: {
          ...createEvent(),
          payload: {
            incoming: {
              text: 'просто текст',
              chatId: 123,
              channelUserId: 456,
            },
          },
        },
        context: { ...baseContext, conversationState: 'idle' },
      },
      { contentPort, contextQueryPort },
    );
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]?.payload).toMatchObject({ selected: 'menu.default' });
  });

  it('does not select script with $notIn when conversationState is in the exclusion list', async () => {
    const getScripts = vi.fn().mockResolvedValue([
      {
        id: 'only.when.not.diary',
        source: 'telegram',
        event: 'message.received',
        match: {
          context: { conversationState: { $notIn: ['diary.symptom.awaiting_title'] } },
          input: { textPresent: true },
        },
        steps: [{ action: 'event.log', params: {} }],
      },
    ]);
    const contentPort: ContentPort = {
      getScripts,
      getTemplate: vi.fn().mockResolvedValue(null),
    };
    const plan = await buildPlan(
      {
        event: {
          ...createEvent(),
          payload: { incoming: { text: 'симптом', chatId: 1, channelUserId: 1 } },
        },
        context: { ...baseContext, conversationState: 'diary.symptom.awaiting_title' },
      },
      { contentPort, contextQueryPort },
    );
    expect(plan).toEqual([]);
  });
});
