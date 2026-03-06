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
      getScript: vi.fn().mockResolvedValue(null),
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
      getScript: vi.fn().mockResolvedValue(null),
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
      getScript: vi.fn().mockResolvedValue(null),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan(
      { event: createEvent({ tenantId: 'tenant-a' }), context: baseContext },
      { contentPort, contextQueryPort },
    );

    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('telegram');
    expect(plan.length).toBeGreaterThan(0);
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
      getScript: vi.fn().mockResolvedValue({ id: 'legacy', steps: [] }),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan(
      { event: createEvent({ source: 'rubitime', type: 'webhook.received' }), context: baseContext },
      { contentPort, contextQueryPort },
    );

    expect(plan.length).toBeGreaterThan(0);
    expect(contentPort.getScript).not.toHaveBeenCalled();
    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('rubitime');
  });

  it('returns empty plan when no business script matches and does not use legacy key', async () => {
    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([]),
      getScript: vi.fn().mockResolvedValue(null),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan(
      { event: createEvent({ source: 'unknown', type: 'message.received' }), context: baseContext },
      { contentPort, contextQueryPort },
    );

    expect(plan).toEqual([]);
    expect(contentPort.getScript).not.toHaveBeenCalled();
    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('unknown');
  });
});
