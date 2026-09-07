import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isHostnameAskAuthorized: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    customDomainBinding: {
      isHostnameAskAuthorized: fakes.isHostnameAskAuthorized,
    },
  }),
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return { ...original, enterWithDbInfraPrincipal: vi.fn() };
});

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isHostnameAskAuthorized.mockResolvedValue(false);
});

describe('built-in Caddy permission contract', () => {
  it('allows a registered eligible hostname through headerless GET ?domain=', async () => {
    fakes.isHostnameAskAuthorized.mockResolvedValueOnce(true);

    const response = await GET(
      new Request('https://therapysto.test/api/public/domains/ask?domain=clinic.example.test'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('denies an arbitrary hostname without revealing tenant data', async () => {
    const response = await GET(
      new Request('https://therapysto.test/api/public/domains/ask?domain=arbitrary.example.test'),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_authorized' });
  });
});
