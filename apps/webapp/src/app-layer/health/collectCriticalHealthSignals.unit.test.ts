import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  curated: vi.fn(async () => ({
    config: { pipelineEnabled: true, reconcileEnabled: true },
    videoTranscode: {
      pendingCount: 0,
      oldestPendingAgeSeconds: null,
      failedLastHour: 0,
      failedLast24h: 0,
    },
    operatorJobs: [
      {
        jobFamily: 'backup',
        jobKey: 'daily',
        lastStatus: 'success',
        safeMeta: {},
      },
      {
        jobFamily: 'operator_health',
        jobKey: 'outbound_probe',
        lastStatus: 'success',
        safeMeta: { consecutiveFailRuns: 0 },
      },
      {
        jobFamily: 'media',
        jobKey: 'transcode_reconcile',
        lastStatus: 'success',
        safeMeta: {},
      },
    ],
    outgoingDelivery: {
      deadTotal: 0,
      dueBacklog: 0,
      confirmedSentLast24h: 4,
      lastSentAt: '2026-08-16T00:00:00.000Z',
      oldestDueAgeSeconds: null,
    },
    integratorPushOutbox: {
      dueBacklog: 0,
      deadTotal: 0,
      oldestDueAgeSeconds: null,
      dueByKind: {},
      deadByKind: {},
      processingCount: 0,
      oldestProcessingAgeSeconds: null,
      lastQueueActivityAt: null,
    },
  })),
  listWebhookBurstSignals: vi.fn(async () => []),
  listOpenIncidents: vi.fn(async () => []),
  getTenantIsolationCanarySnapshot: vi.fn(async () => null),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(() => ({
    health: { checkDbHealth: vi.fn(async () => true) },
    operatorHealthRead: {
      listWebhookBurstSignals: mocks.listWebhookBurstSignals,
      listOpenIncidents: mocks.listOpenIncidents,
      getTenantIsolationCanarySnapshot: mocks.getTenantIsolationCanarySnapshot,
    },
    saasIsolationDiagnostics: { readHealth: vi.fn(async () => null) },
  })),
}));
vi.mock('@/infra/repos/pgCuratedSystemHealthDiagnostics', () => ({
  loadCuratedSystemHealthSnapshot: mocks.curated,
}));
vi.mock('@/app-layer/health/proxyIntegratorProjectionHealth', () => ({
  proxyIntegratorProjectionHealth: vi.fn(async () =>
    Response.json({ deadCount: 0, retriesOverThreshold: 0 })),
}));
vi.mock('@/app-layer/health/deliveryHeartbeatObserver', () => ({
  readOperatorHeartbeatVerdicts: vi.fn(async () => []),
  readEmptyAudienceSignal: vi.fn(async () => undefined),
}));
vi.mock('@/infra/db/client', () => ({
  getCurrentWebappPoolRoutingMetrics: vi.fn(() => ({
    missingPrincipalCount: 0,
    rejectedPrincipalCount: 0,
  })),
}));
vi.mock('@/config/env', () => ({
  env: { INTEGRATOR_API_URL: 'http://integrator.test' },
}));

import { collectCriticalHealthSignals } from './collectCriticalHealthSignals';

describe('collectCriticalHealthSignals scheduler DB boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })));
  });

  it('reads cross-tenant queue, job and video aggregates only from the curated snapshot', async () => {
    const result = await collectCriticalHealthSignals();

    expect(mocks.curated).toHaveBeenCalledTimes(1);
    expect(result.outgoingDelivery).toEqual({ deadTotal: 0, dueBacklog: 0 });
    expect(result.integratorPushOutbox.deadTotal).toBe(0);
    expect(result.backupJobs).toEqual({ daily: { lastStatus: 'success' } });
    expect(result.videoTranscodeStatus).toBe('ok');
  });
});
