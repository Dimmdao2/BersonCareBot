import { beforeEach, describe, expect, it, vi } from 'vitest';

const envState = vi.hoisted(() => ({ INTERNAL_JOB_SECRET: 'control-secret' as string | undefined }));
const principal = vi.hoisted(() => ({ enter: vi.fn<(input: { source: string }) => void>() }));
const control = vi.hoisted(() => ({
  assertMediaWorkerControlReady: vi.fn(), claimMediaWorkerControlJob: vi.fn(),
  completeMediaWorkerHlsJob: vi.fn(), completeMediaWorkerProgramJob: vi.fn(),
  failMediaWorkerJob: vi.fn(), loadMediaWorkerControlMedia: vi.fn(), markMediaWorkerProcessing: vi.fn(),
  readMediaWorkerErrorTrackingConfig: vi.fn(async () => ({ enabled: false, dsn: null })),
  readMediaWorkerWatermarkEnabled: vi.fn(), reportMediaWorkerIsolationFailure: vi.fn(), retryMediaWorkerJob: vi.fn(),
}));
vi.mock('@/config/env', () => ({ env: envState }));
vi.mock('@/app-layer/media/mediaWorkerControl', () => control);
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bersoncare/db-principal')>();
  principal.enter.mockImplementation(actual.enterWithDbInfraPrincipal);
  return { ...actual, enterWithDbInfraPrincipal: principal.enter };
});
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));
const dbPrincipal = await import('@bersoncare/db-principal');
const { POST } = await import('./route');

describe('POST /api/internal/media-worker/control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.INTERNAL_JOB_SECRET = 'control-secret';
  });

  it('fails closed with 503 when the shared internal secret is not configured', async () => {
    envState.INTERNAL_JOB_SECRET = undefined;
    const response = await POST(new Request('http://test/api/internal/media-worker/control', {
      method: 'POST', body: JSON.stringify({ type: 'ready' }),
    }));

    expect(response.status).toBe(503);
    expect(principal.enter).not.toHaveBeenCalled();
    expect(control.assertMediaWorkerControlReady).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized request before parsing its body, setting a principal, or calling DB', async () => {
    const json = vi.fn(async () => ({ type: 'ready' }));
    const request = {
      headers: new Headers({ authorization: 'Bearer wrong' }),
      json,
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(principal.enter).not.toHaveBeenCalled();
    expect(control.assertMediaWorkerControlReady).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed authenticated JSON without calling the DB control seam', async () => {
    const response = await POST(new Request('http://test/api/internal/media-worker/control', {
      method: 'POST',
      headers: { authorization: 'Bearer control-secret', 'content-type': 'application/json' },
      body: '{',
    }));

    expect(response.status).toBe(400);
    expect(principal.enter).toHaveBeenCalledWith({ source: 'api/internal/media-worker/control:POST' });
    expect(control.assertMediaWorkerControlReady).not.toHaveBeenCalled();
  });

  it('dispatches the authenticated narrow ready command', async () => {
    const response = await POST(new Request('http://test/api/internal/media-worker/control', {
      method: 'POST', headers: { authorization: 'Bearer control-secret' }, body: JSON.stringify({ type: 'ready' }),
    }));
    expect(response.status).toBe(200);
    expect(control.assertMediaWorkerControlReady).toHaveBeenCalledOnce();
  });

  it('maps its authenticated infra source to an allowed locked-mode webapp DB checkout', async () => {
    const statements: string[] = [];
    control.assertMediaWorkerControlReady.mockImplementationOnce(async () => {
      const principalOptions = { mode: 'locked', signer: { secret: 'route-acceptance-secret' } } as const;
      const currentPrincipal = dbPrincipal.getCurrentDbPrincipal();
      dbPrincipal.assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(
        currentPrincipal,
        principalOptions,
      );
      const applied = await dbPrincipal.applyDbPrincipalToTransaction(
        {
          query: vi.fn(async (statement: string) => {
            statements.push(statement);
            return { rows: [] };
          }),
        },
        currentPrincipal,
        principalOptions,
      );
      expect(applied).toBe(true);
    });

    const response = await POST(new Request('http://test/api/internal/media-worker/control', {
      method: 'POST', headers: { authorization: 'Bearer control-secret' }, body: JSON.stringify({ type: 'ready' }),
    }));

    expect(response.status).toBe(200);
    expect(statements).toContain('SET ROLE app_operational_media_worker');
    expect(statements).not.toContain('SET ROLE app_staff');
  });

  it('rejects an unallowlisted media source or caller-supplied organization before a locked checkout', () => {
    const options = { mode: 'locked', signer: { secret: 'route-acceptance-secret' } } as const;
    expect(() => dbPrincipal.assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(
      { kind: 'infra', source: 'api/internal/media-worker/other:POST' }, options,
    )).toThrow(/not allowed/);
    expect(() => dbPrincipal.assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(
      { kind: 'infra', source: 'api/internal/media-worker/control:POST', organizationId: '00000000-0000-4000-8000-000000000000' }, options,
    )).toThrow(/not allowed/);
  });

  it('does not accept caller-supplied organization or an arbitrary telemetry write command', async () => {
    const forgedJob = await POST(new Request('http://test/api/internal/media-worker/control', {
      method: 'POST', headers: { authorization: 'Bearer control-secret' },
      body: JSON.stringify({ type: 'load', lockedBy: 'worker-a', job: {
        id: '00000000-0000-4000-8000-000000000001', mediaId: '00000000-0000-4000-8000-000000000002',
        organizationId: '00000000-0000-4000-8000-000000000003',
      } }),
    }));
    expect(forgedJob.status).toBe(400);
    const arbitrary = await POST(new Request('http://test/api/internal/media-worker/control', {
      method: 'POST', headers: { authorization: 'Bearer control-secret' },
      body: JSON.stringify({ type: 'write_sql', query: 'SELECT secret' }),
    }));
    expect(arbitrary.status).toBe(400);
    expect(control.reportMediaWorkerIsolationFailure).not.toHaveBeenCalled();
  });

  it('writes only the fixed media telemetry signal on the webapp side', async () => {
    const response = await POST(new Request('http://test/api/internal/media-worker/control', {
      method: 'POST', headers: { authorization: 'Bearer control-secret' },
      body: JSON.stringify({ type: 'isolation_failure', eventClass: 'rls_denial' }),
    }));
    expect(response.status).toBe(200);
    expect(control.reportMediaWorkerIsolationFailure).toHaveBeenCalledWith('rls_denial');
  });
});
