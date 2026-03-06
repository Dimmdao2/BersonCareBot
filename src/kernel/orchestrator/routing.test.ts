import { describe, expect, it, vi } from 'vitest';
import type { BaseContext, ContentPort, ContextQueryPort, IncomingEvent } from '../contracts/index.js';
import { buildPlan } from './resolver.js';

type RouteRule = {
  id: string;
  enabled?: boolean;
  priority?: number;
  match: {
    source: string;
    eventType: string;
    meta?: Record<string, unknown>;
  };
  scriptId?: string;
};

type RoutedContentPort = ContentPort & {
  getRoutes: (scope: string) => Promise<RouteRule[]>;
};

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
  it('selects script by routes match', async () => {
    const contentPort: RoutedContentPort = {
      getRoutes: vi.fn().mockResolvedValue([
        {
          id: 'r1',
          match: { source: 'telegram', eventType: 'message.received' },
          scriptId: 'telegram:message.received',
        },
      ]),
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

    expect(contentPort.getRoutes).toHaveBeenCalledWith('telegram');
    expect(contentPort.getScriptsBySource).toHaveBeenCalledWith('telegram');
    expect(plan.length).toBeGreaterThan(0);
  });

  it('uses highest priority route, and file order on priority tie', async () => {
    const contentPort: RoutedContentPort = {
      getRoutes: vi.fn().mockResolvedValue([
        {
          id: 'low',
          priority: 10,
          match: { source: 'telegram', eventType: 'message.received' },
          scriptId: 'telegram:low',
        },
        {
          id: 'high-first',
          priority: 100,
          match: { source: 'telegram', eventType: 'message.received' },
          scriptId: 'telegram:high-first',
        },
        {
          id: 'high-second',
          priority: 100,
          match: { source: 'telegram', eventType: 'message.received' },
          scriptId: 'telegram:high-second',
        },
      ]),
      getScriptsBySource: vi.fn().mockResolvedValue([
        {
          id: 'high-first',
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

  it('supports shallow meta matching', async () => {
    const contentPort: RoutedContentPort = {
      getRoutes: vi.fn().mockResolvedValue([
        {
          id: 'meta-route',
          match: {
            source: 'telegram',
            eventType: 'message.received',
            meta: { tenantId: 'tenant-a' },
          },
          scriptId: 'telegram:tenant-a',
        },
      ]),
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

  it('builds plan from business scripts when routes are missing', async () => {
    const contentPort: RoutedContentPort = {
      getRoutes: vi.fn().mockResolvedValue([]),
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

  it('returns empty plan on no route match and does not use legacy key', async () => {
    const contentPort: RoutedContentPort = {
      getRoutes: vi.fn().mockResolvedValue([
        {
          id: 'telegram-only',
          match: { source: 'telegram', eventType: 'message.received' },
          scriptId: 'telegram:any',
        },
      ]),
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
    expect(contentPort.getScriptsBySource).not.toHaveBeenCalled();
  });
});
