import { beforeEach, describe, expect, it, vi } from 'vitest';

type HandleIntegratorEvent = typeof import('@/modules/integrator/events').handleIntegratorEvent;

type CachedEntry = {
  requestHash: string;
  status: number;
  body: Record<string, unknown>;
};

const fakes = vi.hoisted(() => ({
  cache: new Map<string, CachedEntry>(),
  handleIntegratorEvent: vi.fn<HandleIntegratorEvent>(),
  enterVerifiedIntegratorOrganizationPrincipal: vi.fn(() => true),
}));

vi.mock('@/app-layer/admin/auditLog', () => ({
  computeConflictKeyFromCandidateIds: vi.fn(),
  upsertOpenConflictLog: vi.fn(),
  writeAuditLog: vi.fn(),
}));
vi.mock('@/modules/admin-incidents/integratorAutoMergeAnomalyDedup', () => ({
  integratorAutoMergeAnomalyDedupKey: vi.fn(),
}));
vi.mock('@/modules/admin-incidents/sendAdminIncidentAlerts', () => ({
  sendAdminIncidentRelayAlert: vi.fn(),
}));
vi.mock('@/app-layer/db/client', () => ({ getPool: () => ({}) }));
vi.mock('@/infra/logging/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/modules/integrator/events', () => ({
  handleIntegratorEvent: fakes.handleIntegratorEvent,
}));
vi.mock('@/app-layer/platform-user/canonicalPlatformUser', () => ({
  resolveCanonicalUserId: vi.fn(),
}));
vi.mock('@/app-layer/integrator/verifyIntegratorSignature', () => ({
  verifyIntegratorSignature: () => true,
}));
vi.mock('@/app-layer/principal/integratorOrganizationPrincipal', () => ({
  enterVerifiedIntegratorOrganizationPrincipal: fakes.enterVerifiedIntegratorOrganizationPrincipal,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    diaries: {},
    userProjection: {},
    userByPhone: {},
    supportCommunication: {},
    reminderProjection: {},
    subscriptionMailingProjection: {},
  }),
}));
vi.mock('@/app-layer/idempotency/idempotencyStore', () => ({
  isKeyValid: (key: string) => key.length > 0 && key.length <= 256,
  getCachedResponse: (key: string, requestHash: string) => {
    const cached = fakes.cache.get(key);
    if (!cached) return Promise.resolve({ hit: false });
    if (cached.requestHash !== requestHash) {
      return Promise.resolve({
        hit: true,
        mismatch: true,
        storedRequestHash: cached.requestHash,
      });
    }
    return Promise.resolve({ hit: true, status: cached.status, body: cached.body });
  },
  setCachedResponse: (
    key: string,
    requestHash: string,
    status: number,
    body: Record<string, unknown>,
  ) => {
    if (!fakes.cache.has(key)) fakes.cache.set(key, { requestHash, status, body });
    return Promise.resolve(true);
  },
}));

import { POST } from '@/app/api/integrator/events/route';

function eventRequest(
  idempotencyKey: string,
  payload: Record<string, unknown>,
  eventType = 'patient.profile.updated',
): Request {
  return new Request('https://app.example.test/api/integrator/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bersoncare-timestamp': '1785369600',
      'x-bersoncare-signature': 'route-test-signature',
      'x-bersoncare-idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      eventType,
      eventId: 'event-1',
      occurredAt: '2026-07-30T00:00:00.000Z',
      payload,
    }),
  });
}

beforeEach(() => {
  fakes.cache.clear();
  fakes.handleIntegratorEvent.mockReset();
  fakes.enterVerifiedIntegratorOrganizationPrincipal.mockReset();
  fakes.enterVerifiedIntegratorOrganizationPrincipal.mockReturnValue(true);
});

describe('POST /api/integrator/events semantic idempotency', () => {
  it('returns conflict when one key is reused for a different semantic payload', async () => {
    const key = 'semantic-conflict-key';
    fakes.handleIntegratorEvent.mockResolvedValue({ accepted: true });

    const accepted = await POST(
      eventRequest(key, { userId: 'patient-1', displayName: 'Ada Lovelace' }),
    );
    const conflict = await POST(
      eventRequest(key, { userId: 'patient-1', displayName: 'Grace Hopper' }),
    );

    expect(accepted.status).toBe(202);
    await expect(accepted.json()).resolves.toEqual({
      ok: true,
      accepted: true,
      idempotencyKey: key,
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({
      ok: false,
      error: 'idempotency key reused with different payload',
    });
  });

  it('does not cache a transient handler failure as the response to its retry', async () => {
    const key = 'transient-retry-key';
    fakes.handleIntegratorEvent
      .mockResolvedValueOnce({
        accepted: false,
        reason: 'temporary dependency unavailable',
        retryable: true,
      })
      .mockResolvedValueOnce({ accepted: true });

    const failed = await POST(eventRequest(key, { userId: 'patient-1' }));
    const retried = await POST(eventRequest(key, { userId: 'patient-1' }));

    expect(failed.status).toBe(503);
    await expect(failed.json()).resolves.toEqual({
      ok: false,
      accepted: false,
      error: 'temporary dependency unavailable',
      idempotencyKey: key,
    });
    expect(retried.status).toBe(202);
    await expect(retried.json()).resolves.toEqual({
      ok: true,
      accepted: true,
      idempotencyKey: key,
    });
  });

  it('requires and installs the signed organization principal for finalized reminder events', async () => {
    const organizationId = 'a0000000-0000-4000-8000-000000000001';
    fakes.handleIntegratorEvent.mockResolvedValue({ accepted: true });

    const missing = await POST(eventRequest(
      'reminder-finalized-missing-org',
      { integratorOccurrenceId: 'occurrence-1' },
      'reminder.occurrence.finalized',
    ));
    expect(missing.status).toBe(400);
    expect(fakes.handleIntegratorEvent).not.toHaveBeenCalled();

    const accepted = await POST(eventRequest(
      'reminder-finalized-with-org',
      { organizationId },
      'reminder.occurrence.finalized',
    ));
    expect(accepted.status).toBe(202);
    expect(fakes.enterVerifiedIntegratorOrganizationPrincipal).toHaveBeenLastCalledWith(
      organizationId,
      'integrator-reminder-occurrence-finalized-event',
    );
    expect(fakes.handleIntegratorEvent).toHaveBeenCalledOnce();
  });
});
