import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryProductAnalyticsPort } from '@/infra/repos/inMemoryProductAnalytics';

const { requirePlatformOperationsApiContextMock, listRegistrationEventsMock } = vi.hoisted(() => ({
  requirePlatformOperationsApiContextMock: vi.fn(),
  listRegistrationEventsMock: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: requirePlatformOperationsApiContextMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    productAnalytics: {
      listRegistrationEvents: listRegistrationEventsMock,
    },
  }),
}));

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => 'Europe/Moscow'),
}));

import { GET } from './route';

describe('GET /api/admin/auth-registration-events', () => {
  beforeEach(() => {
    requirePlatformOperationsApiContextMock.mockReset();
    listRegistrationEventsMock.mockReset();
    requirePlatformOperationsApiContextMock.mockResolvedValue({
      ok: true,
      session: {
        user: { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin' },
        adminMode: true,
      },
    });
  });

  it('keeps a clinic staff member out of the platform registration journal', async () => {
    requirePlatformOperationsApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
    });
    const res = await GET(new Request('http://localhost/api/admin/auth-registration-events'));
    expect(res.status).toBe(403);
    expect(listRegistrationEventsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when custom preset without from/to', async () => {
    const res = await GET(
      new Request('http://localhost/api/admin/auth-registration-events?preset=custom'),
    );
    expect(res.status).toBe(400);
  });

  it('returns the platform-wide list for a global admin', async () => {
    listRegistrationEventsMock.mockResolvedValue({
      items: [
        {
          id: 'e1',
          occurredAt: '2026-05-28T10:00:00.000Z',
          eventType: 'auth_register_failure',
          entryChannel: 'browser',
          userId: null,
          metadata: { attemptId: 'a1', errorClass: 'system', authMethod: 'email_password' },
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    const res = await GET(
      new Request(
        'http://localhost/api/admin/auth-registration-events?preset=week&eventType=auth_register_failure&errorClass=system',
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; total: number; items: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.total).toBe(1);
    expect(requirePlatformOperationsApiContextMock).toHaveBeenCalledOnce();
    expect(listRegistrationEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'auth_register_failure',
        errorClass: 'system',
        page: 1,
        limit: 50,
      }),
    );
  });

  it('pins the narrow platform DB contract used by the registration list', async () => {
    const { readFileSync } = await import('node:fs');
    const migration = readFileSync(
      'db/drizzle-migrations/0261_platform_registration_events_read.sql',
      'utf8',
    );
    const repository = readFileSync('src/infra/repos/pgProductAnalytics.ts', 'utf8');

    expect(migration).toContain('product_analytics_registration_platform_operations_select');
    expect(migration).toContain('event_type IN (');
    expect(migration).toContain('auth_register_attempt');
    expect(migration).toContain('auth_register_success');
    expect(migration).toContain('auth_register_failure');
    expect(migration).toContain('NOT has_table_privilege');
    expect(repository).toContain('app.is_platform_registration_analytics_user_excluded');
  });
});

describe('listRegistrationEvents port', () => {
  it('filters registration events by type and errorClass', async () => {
    const port = createInMemoryProductAnalyticsPort();
    await port.recordEventsBatch([
      {
        eventType: 'auth_register_failure',
        entryChannel: 'browser',
        metadata: {
          attemptId: 'a1',
          authMethod: 'email_password',
          errorCode: 'server_error',
          errorClass: 'system',
        },
      },
      {
        eventType: 'auth_register_failure',
        entryChannel: 'browser',
        metadata: {
          attemptId: 'a2',
          authMethod: 'email_password',
          errorCode: 'duplicate_email',
          errorClass: 'user',
        },
      },
    ]);

    const result = await port.listRegistrationEvents({
      startIso: new Date(Date.now() - 3600_000).toISOString(),
      endExclusiveIso: new Date(Date.now() + 3600_000).toISOString(),
      eventType: 'auth_register_failure',
      errorClass: 'system',
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.metadata.attemptId).toBe('a1');
  });
});
