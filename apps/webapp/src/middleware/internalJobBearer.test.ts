import { beforeEach, describe, expect, it, vi } from 'vitest';

const envState = vi.hoisted(() => ({ INTERNAL_JOB_SECRET: 'shared-secret' as string | undefined }));
vi.mock('@/config/env', () => ({ env: envState }));

import { verifyInternalJobBearer } from './internalJobBearer';

function request(headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/internal/example', {
    method: 'POST',
    headers,
  });
}

describe('verifyInternalJobBearer', () => {
  beforeEach(() => {
    envState.INTERNAL_JOB_SECRET = 'shared-secret';
  });

  it('fails closed with 503 not_configured when the secret is unset', async () => {
    envState.INTERNAL_JOB_SECRET = undefined;
    const result = verifyInternalJobBearer(request({ Authorization: 'Bearer anything' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
    await expect(result.response.json()).resolves.toEqual({ ok: false, error: 'not_configured' });
  });

  it('honors an overridden not_configured status for the reconcile outlier', async () => {
    envState.INTERNAL_JOB_SECRET = undefined;
    const result = verifyInternalJobBearer(request(), { notConfiguredStatus: 500 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(500);
  });

  it('rejects a missing Authorization header with 401', async () => {
    const result = verifyInternalJobBearer(request());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
  });

  it('rejects a non-Bearer Authorization header with 401', async () => {
    const result = verifyInternalJobBearer(request({ Authorization: 'Basic shared-secret' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a wrong-length token with 401 without throwing on timingSafeEqual', () => {
    const result = verifyInternalJobBearer(request({ Authorization: 'Bearer short' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a same-length but wrong token with 401', () => {
    // Same length as 'shared-secret' (13 chars) so the comparison exercises timingSafeEqual itself,
    // not just the length pre-check that guards it.
    const result = verifyInternalJobBearer(request({ Authorization: 'Bearer shareD-secret' }));
    expect(result.ok).toBe(false);
  });

  it('accepts the exact configured secret', () => {
    const result = verifyInternalJobBearer(request({ Authorization: 'Bearer shared-secret' }));
    expect(result).toEqual({ ok: true });
  });
});
