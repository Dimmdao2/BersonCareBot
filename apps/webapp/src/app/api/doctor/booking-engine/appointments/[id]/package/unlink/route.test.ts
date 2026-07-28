import { describe, expect, it, vi, beforeEach } from 'vitest';

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) =>
    fn(),
  ),
);
const runPackageDetachMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock('@/app/api/booking-engine/packageDetachShared', () => ({
  runPackageDetach: runPackageDetachMock,
}));

import { POST } from './route';

const APPT_ID = '550e8400-e29b-41d4-a716-446655440021';

describe('POST appointments/[id]/package/unlink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: 'org-1', session: { user: { userId: 'u1' } } },
    });
    runPackageDetachMock.mockResolvedValue(Response.json({ ok: true }, { status: 200 }));
  });

  it('calls detach with release_reserve outcome', async () => {
    await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPastTwice: true }),
      }),
      { params: Promise.resolve({ id: APPT_ID }) },
    );
    expect(runPackageDetachMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPT_ID,
        outcome: 'release_reserve',
        confirmPastTwice: true,
      }),
    );
    const [{ runDetachMutation }] = runPackageDetachMock.mock.calls[0] as [
      { runDetachMutation: <T>(fn: () => Promise<T>) => Promise<T> },
    ];
    await runDetachMutation(async () => 'ok');
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      'doctor.booking-engine.package.unlink',
      expect.any(Function),
    );
  });
});
