/**
 * Смена почты пациента запускается на сотрудничьей поверхности, у которой почтового кода в наборе
 * дверей нет. Дверью этот поток не является: клинический администратор уже вошёл и уже выбран
 * пациент, код лишь подтверждает новый адрес. Поэтому маршрут обязан спрашивать настроенность
 * почтового канала, а не состав дверей, — возврат к проверке дверей оставит администратора с 503
 * на живом стенде (находка третьего круга аудита С8).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  buildAppDeps: vi.fn(),
  startEmailChallenge: vi.fn(),
  getClientIdentityForOrganization: vi.fn(),
  // Живая политика на сотрудничьей поверхности: дверь входа по коду закрыта составом, а почтовый
  // канал настроен. Безусловное `true` здесь сделало бы выбор маршрута ненаблюдаемым.
  isAuthChannelEnabled: vi.fn(
    async (_channel: string, _surface: unknown, use?: string) => use === 'transactional',
  ),
}));

vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: <T>(_ctx: unknown, callback: () => T): T => callback(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: fakes.isAuthChannelEnabled,
}));
vi.mock('@/modules/auth/emailAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/emailAuth')>();
  return { ...actual, startEmailChallenge: fakes.startEmailChallenge };
});

import { POST } from './route';

const PATIENT_ID = '00000000-0000-4000-8000-000000000501';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isAuthChannelEnabled.mockImplementation(
    async (_channel: string, _surface: unknown, use?: string) => use === 'transactional',
  );
  fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
    ok: true,
    ctx: { organizationId: 'org-1', session: { user: { userId: 'admin-1', role: 'admin' } } },
  });
  fakes.getClientIdentityForOrganization.mockResolvedValue({ userId: PATIENT_ID });
  fakes.buildAppDeps.mockReturnValue({
    doctorClientsPort: { getClientIdentityForOrganization: fakes.getClientIdentityForOrganization },
  });
  fakes.startEmailChallenge.mockResolvedValue({
    ok: true,
    challengeId: 'challenge-1',
    retryAfterSeconds: 60,
  });
});

describe('POST /api/doctor/patients/[userId]/email-change', () => {
  it('sends the code when the email-code login door is closed but transactional email is configured', async () => {
    const response = await POST(
      new Request('https://therapysto.example.test/api/doctor/patients/x/email-change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.test' }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it('refuses when the email channel itself is not configured', async () => {
    fakes.isAuthChannelEnabled.mockResolvedValue(false);

    const response = await POST(
      new Request('https://therapysto.example.test/api/doctor/patients/x/email-change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.test' }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'auth_channel_disabled' });
    expect(fakes.startEmailChallenge).not.toHaveBeenCalled();
  });
});
