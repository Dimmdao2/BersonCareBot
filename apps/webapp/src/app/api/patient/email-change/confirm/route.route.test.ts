/**
 * Подтверждение новой почты пациентом — вторая половина того же потока: человек уже вошёл, код лишь
 * подтверждает адрес. Дверью это не является, поэтому маршрут спрашивает настроенность почтового
 * канала, а не состав дверей поверхности. Возврат к проверке дверей оставит пациента с 503 там, где
 * кодовая дверь закрыта составом (находка третьего круга аудита С8).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requirePatientApiSession: vi.fn(),
  confirmLatestEmailChallengeCodeForUser: vi.fn(),
  buildAppDeps: vi.fn(),
  isAuthChannelEnabled: vi.fn(
    async (_channel: string, _surface: unknown, use?: string) => use === 'transactional',
  ),
}));

vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiSession: fakes.requirePatientApiSession,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: fakes.isAuthChannelEnabled,
}));
vi.mock('@/modules/auth/emailAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/emailAuth')>();
  return {
    ...actual,
    confirmLatestEmailChallengeCodeForUser: fakes.confirmLatestEmailChallengeCodeForUser,
  };
});
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => 'org-1',
  ensureCorrelationId: () => 'test-correlation-id',
  getCurrentObservabilityContext: () => ({}),
}));

import { POST } from './route';

const confirmRequest = () =>
  new Request('https://app.example.test/api/patient/email-change/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: '123456' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isAuthChannelEnabled.mockImplementation(
    async (_channel: string, _surface: unknown, use?: string) => use === 'transactional',
  );
  fakes.requirePatientApiSession.mockResolvedValue({
    ok: true,
    session: { user: { userId: 'patient-1' } },
  });
  fakes.buildAppDeps.mockReturnValue({});
  fakes.confirmLatestEmailChallengeCodeForUser.mockResolvedValue({ ok: true });
});

describe('POST /api/patient/email-change/confirm', () => {
  it('confirms the code when the email-code login door is closed but transactional email is configured', async () => {
    const response = await POST(confirmRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it('refuses when the email channel itself is not configured', async () => {
    fakes.isAuthChannelEnabled.mockResolvedValue(false);

    const response = await POST(confirmRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'auth_channel_disabled' });
    expect(fakes.confirmLatestEmailChallengeCodeForUser).not.toHaveBeenCalled();
  });
});
