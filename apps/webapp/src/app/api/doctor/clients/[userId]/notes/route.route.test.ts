import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  resolveDoctorCalendarDate: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/app-layer/booking/resolveDoctorCalendarIana', () => ({
  resolveDoctorCalendarDate: fakes.resolveDoctorCalendarDate,
}));

import { POST } from './route';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';

describe('POST doctor daily notes tenant boundary (NOTE-01/06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: '33333333-3333-4333-8333-333333333333',
        session: { user: { userId: AUTHOR_ID } },
      },
    });
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      <T>(...args: unknown[]): T => (args.at(-1) as () => T)(),
    );
  });

  it('refuses to save when the requested client is absent from the active organization', async () => {
    const saveDaily = vi.fn().mockResolvedValue({
      kind: 'saved',
      note: {
        id: 'note-1',
        noteDate: '2026-09-08',
        text: 'чужая заметка',
        revision: 1,
      },
    });
    fakes.buildAppDeps.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization: vi.fn().mockResolvedValue(null) },
      doctorNotes: { saveDaily },
    });

    const response = await POST(
      new Request(`https://app.example.test/api/doctor/clients/${CLIENT_ID}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ noteDate: '2026-09-08', text: 'чужая заметка', expectedRevision: 0 }),
      }),
      { params: Promise.resolve({ userId: CLIENT_ID }) },
    );

    expect(response.status).toBe(404);
    expect(saveDaily).not.toHaveBeenCalled();
  });
});
