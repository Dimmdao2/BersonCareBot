import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) =>
    fn(),
  ),
);
const runPackageDetachMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../_requireAdminBookingEngine', () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock('@/app/api/booking-engine/packageDetachShared', () => ({
  runPackageDetach: runPackageDetachMock,
}));

import { POST } from './route';

const APPT_ID = '550e8400-e29b-41d4-a716-446655440121';

describe('POST admin appointments/[id]/package/refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: 'org-1', session: { user: { userId: 'admin-1' } } },
    });
    runPackageDetachMock.mockResolvedValue(Response.json({ ok: true }, { status: 200 }));
  });

  it('passes admin refund principal wrapper to shared detach helper', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ id: APPT_ID }),
    });
    expect(runPackageDetachMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPT_ID,
        outcome: 'refund_consumed',
      }),
    );
    const [{ runDetachMutation }] = runPackageDetachMock.mock.calls[0] as [
      { runDetachMutation: <T>(fn: () => Promise<T>) => Promise<T> },
    ];
    await runDetachMutation(async () => 'ok');
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      'admin.booking-engine.package.refund',
      expect.any(Function),
    );
  });
});
