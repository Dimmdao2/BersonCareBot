// Добор §5a/3.1a-b: state=read_only обязано отказывать ЗАПИСИ. Гейт для чтения покрыт
// `org-entitlements/service.test.ts`; здесь — реальный (немокнутый) `requireEntitlement*`
// прогнан через настоящие обработчики трёх разных механик, чтобы доказать, что отказ
// доходит до HTTP/Server Action ответа и порт записи не вызывается.
//
// Арбитр (обязателен per `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`): снять в
// `requireEntitlement.ts` ветку `if (resolution.state === 'read_only' && access === 'mutation')`
// — каждый тест ниже обязан покраснеть.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  requireDoctorWorkspaceContext: vi.fn(),
  requireClinicManagementApiContext: vi.fn(),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(<T>(_ctx: unknown, _source: string, fn: () => T): T => fn()),
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(<T>(...args: unknown[]): T => (args.at(-1) as () => T)()),
}));
vi.mock('@/infra/integrations/email/integratorEmailAdapter', () => ({
  sendEmailSetupLinkViaIntegrator: vi.fn().mockResolvedValue({ ok: true }),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireClinicManagementApiContext,
  requireDoctorWorkspaceApiContext,
  requireDoctorWorkspaceContext,
} from '@/app-layer/guards/requireRole';
import { POST as createCourse } from '@/app/api/doctor/courses/route';
import { PATCH as updateCourse } from '@/app/api/doctor/courses/[id]/route';
import { DELETE as revokeClinicInvite } from '@/app/api/clinic/invites/[id]/route';
import { POST as createClinicInvite } from '@/app/api/clinic/invites/route';
import { POST as startExternalCalendar } from '@/app/api/admin/google-calendar/start/route';
import { togglePatientHomeBlockVisibility } from '@/app/app/settings/patient-home/actions';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type { MechanicAccessState, OrgMechanic } from '@/modules/org-entitlements/types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const workspace = { organizationId: ORG_ID, session: { user: { userId: USER_ID } } };

/** Real (unmocked) `resolveMechanicAccess` port stub — the only knob under test is its `state`. */
function readOnlyOrgEntitlementsPort(state: MechanicAccessState): OrgEntitlementsPort {
  return {
    resolveMechanicAccess: async (_organizationId: string, mechanic: OrgMechanic) => ({
      mechanic,
      state,
      policySource: 'system',
      warning: null,
    }),
  } as unknown as OrgEntitlementsPort;
}

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireDoctorWorkspaceApiContext).mockResolvedValue({
    ok: true,
    ctx: workspace,
  } as never);
  vi.mocked(requireDoctorWorkspaceContext).mockResolvedValue(workspace as never);
  vi.mocked(requireClinicManagementApiContext).mockResolvedValue({
    ok: true,
    ctx: workspace,
  } as never);
});

describe('read-only access state refuses writes across mechanics (§5a 3.1a/3.1b)', () => {
  it('refuses course creation and never calls the write port', async () => {
    const createCoursePort = vi.fn();
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: readOnlyOrgEntitlementsPort('read_only'),
      courses: { createCourse: createCoursePort },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await createCourse(
      request('https://app.example.test/api/doctor/courses', {
        title: 'Курс',
        programTemplateId: '33333333-3333-4333-8333-333333333333',
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'commercial_read_only' });
    expect(createCoursePort).not.toHaveBeenCalled();
  });

  it('refuses direct course updates before they reach the write port', async () => {
    const updateCoursePort = vi.fn();
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: readOnlyOrgEntitlementsPort('read_only'),
      courses: { updateCourse: updateCoursePort },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await updateCourse(
      request('https://app.example.test/api/doctor/courses/33333333-3333-4333-8333-333333333333', {
        status: 'archived',
      }),
      { params: Promise.resolve({ id: '33333333-3333-4333-8333-333333333333' }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'commercial_read_only' });
    expect(updateCoursePort).not.toHaveBeenCalled();
  });

  it('refuses clinic-team invite creation and never calls the write port', async () => {
    const createInvitePort = vi.fn().mockResolvedValue({
      ok: true,
      token: 'invite-token',
      invite: { id: 'invite-1', invitedEmail: 'new@example.test', organizationTitle: 'Клиника' },
    });
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: readOnlyOrgEntitlementsPort('read_only'),
      organizationInvites: { createInvite: createInvitePort },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await createClinicInvite(
      request('https://app.example.test/api/clinic/invites', {
        email: 'new@example.test',
        role: 'doctor',
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'commercial_read_only' });
    expect(createInvitePort).not.toHaveBeenCalled();
  });

  it('refuses clinic-team invite revocation and never calls the write port', async () => {
    const revokeInvitePort = vi.fn();
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: readOnlyOrgEntitlementsPort('read_only'),
      organizationInvites: { revokeInvite: revokeInvitePort },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await revokeClinicInvite(
      new Request(
        'https://app.example.test/api/clinic/invites/33333333-3333-4333-8333-333333333333',
        {
          method: 'DELETE',
        },
      ),
      { params: Promise.resolve({ id: '33333333-3333-4333-8333-333333333333' }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'commercial_read_only' });
    expect(revokeInvitePort).not.toHaveBeenCalled();
  });

  it('refuses connecting an external calendar and never reaches the OAuth config', async () => {
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: readOnlyOrgEntitlementsPort('read_only'),
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await startExternalCalendar();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'entitlement_required',
      mechanic: 'external_calendar',
      message:
        'Невозможно подключить внешний календарь: этот раздел не входит в ваш тариф. Чтобы выполнить действие, включите этот раздел в тарифе клиники.',
    });
  });

  it('refuses toggling a patient-home block and never calls the write port', async () => {
    const setBlockVisibilityPort = vi.fn();
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: readOnlyOrgEntitlementsPort('read_only'),
      patientHomeBlocks: { setBlockVisibility: setBlockVisibilityPort },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const result = await togglePatientHomeBlockVisibility('situations', false);

    expect(result).toMatchObject({ ok: false });
    expect(setBlockVisibilityPort).not.toHaveBeenCalled();
  });

  it.each([['full_access' as const], ['grace' as const]])(
    'does NOT block course creation for control state %s (sanity: the refusal is state-specific)',
    async (state) => {
      const createCoursePort = vi.fn().mockResolvedValue({ id: 'course-1' });
      vi.mocked(buildAppDeps).mockReturnValue({
        orgEntitlements: readOnlyOrgEntitlementsPort(state),
        courses: { createCourse: createCoursePort },
      } as unknown as ReturnType<typeof buildAppDeps>);

      const response = await createCourse(
        request('https://app.example.test/api/doctor/courses', {
          title: 'Курс',
          programTemplateId: '33333333-3333-4333-8333-333333333333',
        }),
      );

      expect(response.status).toBe(200);
      expect(createCoursePort).toHaveBeenCalledTimes(1);
    },
  );
});
