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
const courseId = '22222222-2222-4222-8222-222222222222';

describe('GET /api/doctor/courses/[id]/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({ ok: true, ctx: { organizationId } });
  });

  it('refuses course usage when courses are disabled', async () => {
    const getCourseUsage = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'disabled', warning: null }) },
      courses: { getCourseUsage },
    });

    const response = await GET(new Request('http://test'), { params: Promise.resolve({ id: courseId }) });

    expect(response.status).toBe(403);
    expect(getCourseUsage).not.toHaveBeenCalled();
  });

  it('keeps course usage readable when courses are read-only', async () => {
    const getCourseUsage = vi.fn().mockResolvedValue({ enrolled: 2 });
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      async (_context: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }) },
      courses: { getCourseUsage },
    });

    const response = await GET(new Request('http://test'), { params: Promise.resolve({ id: courseId }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, usage: { enrolled: 2 } });
    expect(getCourseUsage).toHaveBeenCalledWith(courseId);
  });
});
