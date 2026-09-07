import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isHostnameAskAuthorized: vi.fn(),
  transitionBindingStatus: vi.fn(),
}));

vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'test-secret' } }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    customDomainBinding: {
      isHostnameAskAuthorized: fakes.isHostnameAskAuthorized,
      transitionBindingStatus: fakes.transitionBindingStatus,
    },
  }),
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return { ...original, enterWithDbInfraPrincipal: vi.fn() };
});

import { GET as ask } from './ask/route';
import { POST as activate } from './activate/route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isHostnameAskAuthorized.mockResolvedValue(false);
  fakes.transitionBindingStatus.mockResolvedValue({ ok: true });
});

describe('built-in Caddy permission contract', () => {
  it('allows a known hostname through the actual headerless GET ?domain= request', async () => {
    fakes.isHostnameAskAuthorized.mockResolvedValueOnce(true);

    const response = await ask(
      new Request('https://edge.example.test/api/internal/domains/ask?domain=clinic.example.test'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fakes.isHostnameAskAuthorized).toHaveBeenCalledWith('clinic.example.test');
  });

  it('denies an arbitrary hostname without revealing tenant data', async () => {
    const response = await ask(
      new Request('https://edge.example.test/api/internal/domains/ask?domain=arbitrary.example.test'),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_authorized' });
  });
});

describe('custom-domain readiness transition boundary', () => {
  it('does not trust a generic bearer caller to assert mark_active without evidence', async () => {
    const response = await activate(
      new Request('https://app.example.test/api/internal/domains/activate', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          hostname: 'clinic.example.test',
          transition: 'mark_active',
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(fakes.transitionBindingStatus).not.toHaveBeenCalled();
  });
});
