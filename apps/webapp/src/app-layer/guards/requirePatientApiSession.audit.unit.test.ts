/**
 * Oracle: docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md §5.1 explicitly keeps support
 * reachable while the patient has no confirmed email. The shared session boundary used by that
 * route must also install the patient DB principal; otherwise the following DB reads/write-fallback
 * can silently see no rows or lose the support submission.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  ensureDbPrincipalContext: vi.fn(),
  enterWithDbPatientPrincipal: vi.fn(),
  getCurrentDbPrincipal: vi.fn(),
  getCurrentSession: vi.fn(),
  canAccessPatient: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bersoncare/db-principal')>()),
  ensureDbPrincipalContext: fakes.ensureDbPrincipalContext,
  enterWithDbPatientPrincipal: fakes.enterWithDbPatientPrincipal,
  enterWithDbPlatformPrincipal: vi.fn(),
  enterWithDbStaffPrincipal: vi.fn(),
  getCurrentDbPrincipal: fakes.getCurrentDbPrincipal,
}));
vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: fakes.getCurrentSession,
  getCurrentSessionForIdentitySelf: vi.fn(),
  getCurrentSessionForPasswordChange: vi.fn(),
}));
vi.mock('@/modules/roles/service', () => ({
  canAccessDoctor: vi.fn(),
  canAccessPatient: fakes.canAccessPatient,
}));

import { requirePatientApiSession } from './requireRole';

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';

function patientWithoutEmail(): AppSession {
  return {
    user: {
      userId: PATIENT_ID,
      role: 'client',
      displayName: 'Пациент',
      phone: '+79990000000',
      bindings: {},
    },
    issuedAt: 1,
    expiresAt: 2,
  };
}

describe('requirePatientApiSession support boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getCurrentSession.mockResolvedValue(patientWithoutEmail());
    fakes.canAccessPatient.mockReturnValue(true);
    fakes.getCurrentDbPrincipal.mockReturnValue(null);
  });

  it('accepts a patient without email and installs the patient DB principal', async () => {
    const result = await requirePatientApiSession();

    expect(result).toMatchObject({ ok: true });
    expect(fakes.enterWithDbPatientPrincipal).toHaveBeenCalledWith({
      organizationId: undefined,
      platformUserId: PATIENT_ID,
      source: 'requirePatientApiBusinessAccess',
    });
  });
});
