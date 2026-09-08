import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  requireDoctorWorkspaceModuleForApi: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
}));
vi.mock('@/app-layer/guards/workspaceModuleAccess', () => ({
  requireDoctorWorkspaceModuleForApi: fakes.requireDoctorWorkspaceModuleForApi,
}));

import { POST } from './route';

const ORGANIZATION_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const SPECIALIST_ID = '44444444-4444-4444-8444-444444444444';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
/** A well-formed appointment id that belongs to some other client/organization. */
const FOREIGN_APPOINTMENT_ID = '55555555-5555-4555-8555-555555555555';

/**
 * ACC-01: the specialist may only create a meeting inside the active organization and only for a
 * client the current workspace lets them open, and the server performs those checks. The optional
 * appointment binding is part of the same row, so it carries the same tenant boundary. The
 * canonical encounter write path already enforces exactly this predicate for its own appointment
 * binding (`createVisit` in `infra/repos/pgPatientClinical.ts` matches `platform_user_id` and
 * `organization_id`, otherwise `clinical_target_not_found`) — that is the independent oracle here.
 */
describe('POST doctor video meeting appointment binding boundary (ACC-01)', () => {
  const createOrResume = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        specialistId: SPECIALIST_ID,
        session: { user: { userId: AUTHOR_ID } },
      },
    });
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      <T>(...args: unknown[]): T => (args.at(-1) as () => T)(),
    );
    fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
    fakes.requireDoctorWorkspaceModuleForApi.mockResolvedValue({ ok: true });
    createOrResume.mockResolvedValue({
      ok: true,
      meetingId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      resumed: false,
      session: {
        renderer: 'embedded_conference',
        endpoint: 'https://meet.example.test',
        roomReference: 'room-ref',
        accessToken: 'token',
        expiresAt: '2099-09-08T02:00:00.000Z',
      },
      guestUrl: 'https://clinic.example.test/live#secret',
    });
  });

  function request(body: Record<string, unknown>) {
    return POST(
      new Request(`https://app.example.test/api/doctor/clients/${CLIENT_ID}/video-meetings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ userId: CLIENT_ID }) },
    );
  }

  it('never persists a caller-supplied appointment id that was not proven to belong to this client and organization', async () => {
    // Failure: the door forwards any well-formed uuid from the request body straight into the
    // stored meeting row, so a specialist can bind their own call to another organization's
    // appointment (and learn, from success versus failure, whether that appointment exists).
    // Impact: a cross-tenant row linkage written through an authenticated door, plus an existence
    // oracle for foreign appointment ids.
    fakes.buildAppDeps.mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: CLIENT_ID }),
      },
      videoMeetings: { createOrResume },
    });

    const response = await request({ appointmentId: FOREIGN_APPOINTMENT_ID });

    // Either the door refuses, or it must not carry the unverified id into the write path.
    const boundAppointmentId = createOrResume.mock.calls[0]?.[0]?.appointmentId ?? null;
    expect({ ok: response.ok, boundAppointmentId }).not.toEqual({
      ok: true,
      boundAppointmentId: FOREIGN_APPOINTMENT_ID,
    });
  });

  it('still starts a meeting with no appointment binding when the caller supplies none', async () => {
    // Guard for the fix: refusing every appointment id is safe, refusing the plain start is not.
    fakes.buildAppDeps.mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: CLIENT_ID }),
      },
      videoMeetings: { createOrResume },
    });

    const response = await request({});

    expect(response.status).toBe(200);
    expect(createOrResume).toHaveBeenCalledTimes(1);
  });
});
