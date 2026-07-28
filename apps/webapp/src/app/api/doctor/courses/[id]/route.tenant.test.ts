import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());
const getCourseForDoctorMock = vi.hoisted(() => vi.fn());
const updateCourseMock = vi.hoisted(() => vi.fn());
const getCourseUsageMock = vi.hoisted(() => vi.fn());
const principalContexts = vi.hoisted(() => [] as { organizationId: string; source: string }[]);

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForRead: requireEntitlementMock,
  requireEntitlementForMutation: requireEntitlementMock,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (
    ctx: { organizationId: string },
    source: string,
    fn: () => unknown,
  ) => {
    principalContexts.push({ organizationId: ctx.organizationId, source });
    return fn();
  },
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    courses: {
      getCourseForDoctor: getCourseForDoctorMock,
      updateCourse: updateCourseMock,
      getCourseUsage: getCourseUsageMock,
    },
  }),
}));

import { CourseArchiveNotFoundError } from '@/modules/courses/errors';
import { GET, PATCH } from './route';
import { GET as getUsage } from './usage/route';

const COURSE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspaceA = { organizationId: 'org-a', session: { user: { userId: 'doctor-a' } } };
const workspaceB = { organizationId: 'org-b', session: { user: { userId: 'doctor-b' } } };

describe('doctor course direct and usage tenant boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalContexts.length = 0;
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceA });
    requireEntitlementMock.mockResolvedValue({ ok: true });
    getCourseForDoctorMock.mockResolvedValue({ id: COURSE_ID, title: 'Owner course' });
    updateCourseMock.mockResolvedValue({ id: COURSE_ID, title: 'Owner course' });
    getCourseUsageMock.mockResolvedValue({ programTemplateId: 'template-a' });
  });

  it('returns non-enumerating not_found for a cross-organization direct id', async () => {
    getCourseForDoctorMock.mockResolvedValueOnce(null);
    const response = await GET(new Request('http://localhost/api/doctor/courses/foreign'), {
      params: Promise.resolve({ id: COURSE_ID }),
    });
    expect(response.status).toBe(404);
    expect(principalContexts).toEqual([{ organizationId: 'org-a', source: 'doctor.courses.get' }]);
  });

  it('uses only the authenticated workspace when a different organization has the same direct path', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({ ok: true, ctx: workspaceB });
    await GET(new Request('http://localhost/api/doctor/courses/foreign?organizationId=org-a'), {
      params: Promise.resolve({ id: COURSE_ID }),
    });
    expect(principalContexts).toEqual([{ organizationId: 'org-b', source: 'doctor.courses.get' }]);
    expect(requireEntitlementMock).toHaveBeenCalledWith(workspaceB, 'courses');
  });

  it('denies entitlement-off update before it can touch a course', async () => {
    requireEntitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'entitlement_required' }, { status: 403 }),
    });
    const response = await PATCH(
      new Request('http://localhost/api/doctor/courses/foreign', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Nope', organizationId: 'org-b' }),
      }),
      { params: Promise.resolve({ id: COURSE_ID }) },
    );
    expect(response.status).toBe(403);
    expect(updateCourseMock).not.toHaveBeenCalled();
  });

  it('maps an owner-scoped archive miss to not_found', async () => {
    updateCourseMock.mockRejectedValueOnce(new CourseArchiveNotFoundError());
    const response = await PATCH(
      new Request('http://localhost/api/doctor/courses/foreign', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived', acknowledgeUsageWarning: true }),
      }),
      { params: Promise.resolve({ id: COURSE_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns non-enumerating not_found for usage outside the workspace organization', async () => {
    getCourseUsageMock.mockRejectedValueOnce(new Error('Курс не найден'));
    const response = await getUsage(
      new Request('http://localhost/api/doctor/courses/foreign/usage'),
      {
        params: Promise.resolve({ id: COURSE_ID }),
      },
    );
    expect(response.status).toBe(404);
    expect(principalContexts).toEqual([
      { organizationId: 'org-a', source: 'doctor.courses.usage' },
    ]);
  });
});
