import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { GET } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';

describe('GET /api/doctor/courses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({ ok: true, ctx: { organizationId } });
  });

  it('refuses the course list when courses are disabled', async () => {
    const listCoursesForDoctor = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'disabled', warning: null }) },
      courses: { listCoursesForDoctor },
    });

    const response = await GET(new Request('http://test/api/doctor/courses'));

    expect(response.status).toBe(403);
    expect(listCoursesForDoctor).not.toHaveBeenCalled();
  });

  it('keeps the course list readable when courses are read-only', async () => {
    const listCoursesForDoctor = vi.fn().mockResolvedValue([{ id: 'course-1' }]);
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      async (_context: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }) },
      courses: { listCoursesForDoctor },
    });

    const response = await GET(new Request('http://test/api/doctor/courses'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, items: [{ id: 'course-1' }] });
    expect(listCoursesForDoctor).toHaveBeenCalledWith({ includeArchived: false, status: null });
  });
});
