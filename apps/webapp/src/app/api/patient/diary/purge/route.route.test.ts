import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmPhoneAuthResult } from '@/modules/auth/phoneAuth';

const PATIENT_ID = '00000000-0000-4000-8000-000000000301';
const OTHER_PATIENT_ID = '00000000-0000-4000-8000-000000000302';

const fakes = vi.hoisted(() => ({
  requirePatientApiBusinessAccess: vi.fn(),
  checkAuthConfirmRateLimit: vi.fn(),
  confirmPhoneAuth: vi.fn<() => Promise<ConfirmPhoneAuthResult>>(),
  purgeAllDiaryDataForUser: vi.fn(),
  clearDiaryPurgeReauth: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: fakes.checkAuthConfirmRateLimit,
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    auth: { confirmPhoneAuth: fakes.confirmPhoneAuth },
    diaries: { purgeAllDiaryDataForUser: fakes.purgeAllDiaryDataForUser },
  }),
}));
vi.mock('@/modules/auth/service', () => ({ clearDiaryPurgeReauth: fakes.clearDiaryPurgeReauth }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { POST } from './route';

function request(): Request {
  return new Request('https://app.example.test/api/patient/diary/purge', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.31' },
    body: JSON.stringify({ challengeId: 'challenge-301', code: '123456' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.checkAuthConfirmRateLimit.mockResolvedValue({ limited: false });
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: PATIENT_ID, phone: '+79991234567' } },
  });
  fakes.purgeAllDiaryDataForUser.mockResolvedValue(undefined);
  fakes.clearDiaryPurgeReauth.mockResolvedValue(undefined);
});

describe('patient diary resource purge identity boundary', () => {
  it('refuses an OTP challenge resolved to another patient without deleting diary data', async () => {
    fakes.confirmPhoneAuth.mockResolvedValue({
      ok: true,
      user: {
        userId: OTHER_PATIENT_ID,
        phone: '+79991234567',
        role: 'client',
        displayName: 'Other patient',
        bindings: {},
        sessionEpoch: 1,
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'identity_mismatch' });
    expect(fakes.purgeAllDiaryDataForUser).not.toHaveBeenCalled();
  });
});
