import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  patientClientBusinessGate: vi.fn(),
  patientEmailGateForProtectedData: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: fakes.redirect }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: fakes.getCurrentSession,
  getCurrentSessionForIdentitySelf: vi.fn(),
  getCurrentSessionForPasswordChange: vi.fn(),
}));
vi.mock('@/app-layer/platform-access', () => ({
  patientClientBusinessGate: fakes.patientClientBusinessGate,
  patientEmailGateForProtectedData: fakes.patientEmailGateForProtectedData,
  resolvePlatformAccessContext: vi.fn(),
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureDbPrincipalContext: vi.fn(),
  enterWithDbPatientPrincipal: vi.fn(),
  enterWithDbPlatformPrincipal: vi.fn(),
  enterWithDbStaffPrincipal: vi.fn(),
  getCurrentDbPrincipal: vi.fn(),
}));

import {
  requirePatientAccessWithPhone,
  requirePatientApiBusinessAccess,
} from './requireRole';

const patientSession: AppSession = {
  user: {
    userId: '00000000-0000-4000-8000-0000000005a0',
    role: 'client',
    displayName: 'Patient',
    bindings: {},
    sessionEpoch: 1,
  },
  issuedAt: 1_790_000_000,
  expiresAt: 1_790_043_200,
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getCurrentSession.mockResolvedValue(patientSession);
  fakes.patientClientBusinessGate.mockResolvedValue('allow');
  fakes.patientEmailGateForProtectedData.mockResolvedValue({
    decision: 'request',
    shouldMarkFirstRequest: false,
    blocksProtectedData: false,
    emailVerified: false,
    shouldPromptNow: false,
  });
  fakes.redirect.mockImplementation((target: string) => {
    throw new Error(`redirect:${target}`);
  });
});

describe('patient email requirement at protected data doors', () => {
  it('returns a distinct API refusal with the email escape route after day fourteen', async () => {
    fakes.patientEmailGateForProtectedData.mockResolvedValue({
      decision: 'requirement',
      shouldMarkFirstRequest: false,
      blocksProtectedData: true,
      emailVerified: false,
      shouldPromptNow: true,
    });

    const result = await requirePatientApiBusinessAccess({
      returnPath: '/app/patient/messages',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected patient email refusal');
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      error: 'patient_email_required',
      redirectTo: '/app/patient/bind-email?next=%2Fapp%2Fpatient%2Fmessages',
    });
  });

  it('redirects a protected server action to the same email escape route', async () => {
    fakes.patientEmailGateForProtectedData.mockResolvedValue({
      decision: 'requirement',
      shouldMarkFirstRequest: false,
      blocksProtectedData: true,
      emailVerified: false,
      shouldPromptNow: true,
    });

    await expect(requirePatientAccessWithPhone('/app/patient/diary')).rejects.toThrow(
      'redirect:/app/patient/bind-email?next=%2Fapp%2Fpatient%2Fdiary',
    );
  });

  it('does not close either data door during the soft request period', async () => {
    await expect(requirePatientAccessWithPhone('/app/patient/diary')).resolves.toBe(
      patientSession,
    );
    await expect(
      requirePatientApiBusinessAccess({ returnPath: '/app/patient/messages' }),
    ).resolves.toEqual({ ok: true, session: patientSession });
  });

  it('keeps the email door on activation-pending aggregate reads', async () => {
    fakes.patientClientBusinessGate.mockResolvedValue('need_activation');

    await expect(
      requirePatientApiBusinessAccess({
        returnPath: '/app/patient',
        businessAccess: 'optional',
      }),
    ).resolves.toEqual({
      ok: true,
      session: patientSession,
      hasBusinessAccess: false,
    });

    fakes.patientEmailGateForProtectedData.mockResolvedValue({
      decision: 'requirement',
      shouldMarkFirstRequest: false,
      blocksProtectedData: true,
      emailVerified: false,
      shouldPromptNow: true,
    });

    const result = await requirePatientApiBusinessAccess({
      returnPath: '/app/patient',
      businessAccess: 'optional',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected patient email refusal');
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      error: 'patient_email_required',
    });
  });
});
