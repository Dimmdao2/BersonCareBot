import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerRoutes } from './routes.js';
import type { AppDeps, ProjectionHealthSnapshot } from './di.js';

const apps: Array<ReturnType<typeof Fastify>> = [];

function createDeps(getProjectionHealth: AppDeps['getProjectionHealth']): AppDeps {
  return {
    healthCheckDb: vi.fn().mockResolvedValue(true),
    getProjectionHealth,
    smsClient: {} as AppDeps['smsClient'],
    dbWritePort: {} as AppDeps['dbWritePort'],
    dispatchPort: {} as AppDeps['dispatchPort'],
    unifiedSender: {} as AppDeps['unifiedSender'],
    contentPort: {} as AppDeps['contentPort'],
    sendMenuOnButtonPress: false,
    templatePort: {} as AppDeps['templatePort'],
    contentCatalogPort: {} as AppDeps['contentCatalogPort'],
    contextQueryPort: {} as AppDeps['contextQueryPort'],
    eventGateway: {} as AppDeps['eventGateway'],
    webappEventsPort: {} as AppDeps['webappEventsPort'],
  };
}

async function createApp(getProjectionHealth: AppDeps['getProjectionHealth']) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerRoutes(app, createDeps(getProjectionHealth));
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('/health/projection', () => {
  it('returns the projection health snapshot provided by the shared HTTP dependency', async () => {
    const snapshot: ProjectionHealthSnapshot = {
      pendingCount: 2,
      deadCount: 0,
      cancelledCount: 1,
      oldestPendingAt: '2026-03-19T10:00:00Z',
      processingCount: 1,
      retryDistribution: { 0: 2, 1: 1 },
      lastSuccessAt: '2026-03-19T09:00:00Z',
      retriesOverThreshold: 0,
    };
    const getProjectionHealth = vi.fn().mockResolvedValue(snapshot);
    const app = await createApp(getProjectionHealth);

    const response = await app.inject({ method: 'GET', url: '/health/projection' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(snapshot);
    expect(getProjectionHealth).toHaveBeenCalledTimes(1);
  });

  it('preserves the 503 fallback shape when projection health dependency fails', async () => {
    const app = await createApp(vi.fn().mockRejectedValue(new Error('db unavailable')));

    const response = await app.inject({ method: 'GET', url: '/health/projection' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      pendingCount: 0,
      deadCount: 0,
      cancelledCount: 0,
      oldestPendingAt: null,
      processingCount: 0,
      retryDistribution: {},
      lastSuccessAt: null,
      retriesOverThreshold: 0,
    });
  });
});
