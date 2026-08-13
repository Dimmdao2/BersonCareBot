/**
 * D29 (owner, 31.07, `IDENTITY_AND_MERGE_SCHEME.md` §6): ФИО принимается только кириллицей.
 * Proves the rejection is real at the actual write boundary a doctor uses to edit a patient's
 * name — not just that the shared `isCyrillicFioInput` predicate exists.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import type { ClientIdentity } from '@/modules/doctor-clients/ports';

type AppDeps = ReturnType<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>;
type RequireDoctorWorkspace =
  typeof import('@/app-layer/guards/requireRole').requireDoctorWorkspaceApiContext;

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>(),
  requireDoctorWorkspace: vi.fn<RequireDoctorWorkspace>(),
  getClientIdentity: vi.fn<AppDeps['doctorClientsPort']['getClientIdentityForOrganization']>(),
  setPatientNames: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspace,
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => ({
    kind: 'staff',
    organizationId: '00000000-0000-4000-8000-0000000d0029',
    platformUserId: '00000000-0000-4000-8000-0000000d0129',
    source: 'fio-route-test',
  }),
  runWithDbOrganizationPrincipal: <T>(_organizationId: string, callback: () => T): T => callback(),
  runWithDbStaffPrincipal: <T>(_ctx: unknown, callback: () => T): T => callback(),
}));

import { FIO_LATIN_REJECTED_TEXT } from '@/shared/lib/fio';
import { PATCH as updateFioRoute } from './route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-0000000d0029';
const DOCTOR_ID = '00000000-0000-4000-8000-0000000d0129';
const PATIENT_ID = '00000000-0000-4000-8000-0000000d0229';

const doctorContext: DoctorWorkspaceAccessContext = {
  session: {
    user: { userId: DOCTOR_ID, role: 'doctor', displayName: 'D29 doctor', bindings: {} },
    issuedAt: 1_790_000_000,
    expiresAt: 1_790_043_200,
  },
  organizationId: ORGANIZATION_ID,
  membershipId: 'membership-d29',
  membershipRole: 'doctor',
  specialistId: 'specialist-d29',
  canManageOrganization: false,
  canManageAllSpecialists: false,
  canAccessClinicalWorkspace: true,
  doctorScreensDisabled: false,
  capabilities: ['clinical.workspace'],
};

const clientIdentity: ClientIdentity = {
  userId: PATIENT_ID,
  displayName: 'D29 patient',
  phone: null,
  bindings: {},
  createdAt: '2026-07-31T00:00:00.000Z',
  isBlocked: false,
  blockedReason: null,
  isArchived: false,
  channelBindingDates: {},
};

const fakeDeps = {
  doctorClientsPort: { getClientIdentityForOrganization: fakes.getClientIdentity },
  doctorClients: { setPatientNames: fakes.setPatientNames },
} as unknown as AppDeps;

function patchRequest(body: unknown): Request {
  return new Request(`https://app.example.test/api/doctor/patients/${PATIENT_ID}/fio`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.buildAppDeps.mockReturnValue(fakeDeps);
  fakes.requireDoctorWorkspace.mockResolvedValue({ ok: true, ctx: doctorContext });
  fakes.getClientIdentity.mockResolvedValue(clientIdentity);
  fakes.setPatientNames.mockResolvedValue(undefined);
});

describe('PATCH /api/doctor/patients/[userId]/fio — D29 Cyrillic-only', () => {
  it('rejects a Latin first name — no write happens, and the screen gets a human RU sentence, not the bare error code', async () => {
    const res = await updateFioRoute(patchRequest({ firstName: 'Ivan' }), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; error: string; message?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('validation_error');
    expect(body.message).toBe(FIO_LATIN_REJECTED_TEXT);
    expect(fakes.setPatientNames).not.toHaveBeenCalled();
  });

  it('rejects a mixed Cyrillic/Latin last name — no write happens', async () => {
    const res = await updateFioRoute(patchRequest({ lastName: 'Ивaнов' /* Latin "a" */ }), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(422);
    expect(fakes.setPatientNames).not.toHaveBeenCalled();
  });

  it('accepts a Cyrillic name and writes it', async () => {
    const res = await updateFioRoute(
      patchRequest({ firstName: 'Иван', lastName: 'Петров', patronymic: 'Сергеевич' }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );
    expect(res.status).toBe(200);
    expect(fakes.setPatientNames).toHaveBeenCalledWith(PATIENT_ID, {
      firstName: 'Иван',
      lastName: 'Петров',
      patronymic: 'Сергеевич',
    });
  });

  it('clearing a name field with an empty string is still allowed (not a Latin-rejection false positive)', async () => {
    const res = await updateFioRoute(patchRequest({ patronymic: '' }), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(200);
    expect(fakes.setPatientNames).toHaveBeenCalledWith(PATIENT_ID, { patronymic: null });
  });
});
