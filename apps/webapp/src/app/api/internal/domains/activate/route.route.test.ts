import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  transitionBindingStatus: vi.fn(),
}));

vi.mock('@/config/env', () => ({ env: { INTERNAL_JOB_SECRET: 'test-secret' } }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    customDomainBinding: {
      transitionBindingStatus: fakes.transitionBindingStatus,
    },
  }),
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return { ...original, enterWithDbInfraPrincipal: vi.fn() };
});

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.transitionBindingStatus.mockResolvedValue({ ok: true });
});

describe('custom-domain readiness transition boundary', () => {
  it('does not trust a generic bearer caller to assert mark_active without evidence', async () => {
    const response = await POST(
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
