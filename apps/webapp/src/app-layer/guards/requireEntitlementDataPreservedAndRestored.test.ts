// §5a stage 4b.5 — two of the three non-configurable mechanic properties (the third, "refusal is
// always visible", is already covered by `requireEntitlementReadOnlyRefusesWrites.test.ts`):
//   1. data is never deleted at any knob value (disabling a mechanic hides it, it does not purge it);
//   2. re-enabling restores everything exactly as it was, with no extra recovery step.
//
// Both are proven together on the real (unmocked) `courses` API route: the same two stored courses
// come back unchanged after a disabled -> full_access flip, and creating a new course after re-enable
// behaves identically to before the mechanic was ever disabled.
//
// Арбитр (обязателен per `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`):
//  - property 1: temporarily make the GET handler call a `deleteAllCourses` port when the mechanic
//    resolves to `disabled` — the first test below must turn red.
//  - property 2: temporarily hardcode `checkEntitlement` to always return `disabled` regardless of
//    the resolved state (simulating a stale/latched decision) — the second test below must turn red.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(<T>(_ctx: unknown, _source: string, fn: () => T): T => fn()),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { GET as listCourses, POST as createCourse } from '@/app/api/doctor/courses/route';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type { MechanicAccessState, OrgMechanic } from '@/modules/org-entitlements/types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const workspace = { organizationId: ORG_ID, session: { user: { userId: USER_ID } } };

const EXISTING_COURSES = [
  { id: 'course-1', title: 'Курс 1' },
  { id: 'course-2', title: 'Курс 2' },
];

function orgEntitlementsPortReturning(state: MechanicAccessState): OrgEntitlementsPort {
  return {
    resolveMechanicAccess: async (_organizationId: string, mechanic: OrgMechanic) => ({
      mechanic,
      state,
      policySource: 'system',
      warning: null,
    }),
  } as unknown as OrgEntitlementsPort;
}

function getRequest(): Request {
  return new Request('https://app.example.test/api/doctor/courses', { method: 'GET' });
}

function postRequest(title: string): Request {
  return new Request('https://app.example.test/api/doctor/courses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, programTemplateId: '33333333-3333-4333-8333-333333333333' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireDoctorWorkspaceApiContext).mockResolvedValue({
    ok: true,
    ctx: workspace,
  } as never);
});

describe('mechanic-disable non-configurable properties (§5a stage 4b.5)', () => {
  it('never deletes existing data while disabled — re-enabling returns the exact same records', async () => {
    const listCoursesForDoctor = vi.fn().mockResolvedValue(EXISTING_COURSES);
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: orgEntitlementsPortReturning('disabled'),
      courses: { listCoursesForDoctor },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const blockedResponse = await listCourses(getRequest());
    expect(blockedResponse.status).toBe(403);
    // The gate refuses the request BEFORE reaching the store — nothing that could delete or mutate
    // the underlying rows is ever invoked while the mechanic is disabled.
    expect(listCoursesForDoctor).not.toHaveBeenCalled();

    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: orgEntitlementsPortReturning('full_access'),
      courses: { listCoursesForDoctor },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const restoredResponse = await listCourses(getRequest());
    expect(restoredResponse.status).toBe(200);
    await expect(restoredResponse.json()).resolves.toMatchObject({
      ok: true,
      items: EXISTING_COURSES,
    });
  });

  it('restores full read/write behaviour immediately on re-enable, with no separate recovery step', async () => {
    const createCoursePort = vi.fn().mockResolvedValue({ id: 'course-3', title: 'Курс 3' });
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: orgEntitlementsPortReturning('disabled'),
      courses: { createCourse: createCoursePort },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const blocked = await createCourse(postRequest('Курс 3'));
    expect(blocked.status).toBe(403);
    expect(createCoursePort).not.toHaveBeenCalled();

    // Flip the SAME organization's mechanic back to full access — the only thing that changed is
    // the resolved state, nothing was re-provisioned or reset by hand.
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: orgEntitlementsPortReturning('full_access'),
      courses: { createCourse: createCoursePort },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const restored = await createCourse(postRequest('Курс 3'));
    expect(restored.status).toBe(200);
    expect(createCoursePort).toHaveBeenCalledTimes(1);
    await expect(restored.json()).resolves.toMatchObject({
      ok: true,
      item: { id: 'course-3', title: 'Курс 3' },
    });
  });
});
