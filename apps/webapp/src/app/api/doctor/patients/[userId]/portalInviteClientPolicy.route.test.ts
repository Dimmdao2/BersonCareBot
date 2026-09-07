/**
 * C3M-10 blind acceptance oracle — the invite door itself, not the button that hides it.
 * Oracle: roadmap §C3M.7 C3M-10 («Gate invite issue и linked org-private patient routes/APIs client
 * policy»), §C3M.6 («`client_portal=OFF` не удаляет … invite history. Pending invite можно отозвать»)
 * and the C3M-01 frozen typed `403 workspace_module_disabled` refusal.
 *
 * WHAT BREAKS WITHOUT THIS:
 * 1. The specialist card stops rendering the invite controls while `POST …/portal-invite` still
 *    mints a working activation link — a client the organization removed from the portal receives
 *    a live invite by direct request.
 * 2. A per-client `deny` is honoured only in the card and not at the route, with the same outcome.
 * 3. The gate is applied too widely: reading the invite state or revoking a pending invite starts
 *    refusing too, so a link that is already out can no longer be withdrawn.
 *
 * Runs the real route handlers together with the real workspace-module guard; only the session,
 * the DB principal wrapper and the ports are doubled.
 */
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
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import {
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
  defaultDoctorWorkspaceComposition,
} from '@/modules/system-settings/doctorWorkspaceComposition';
import { createSystemSettingsService } from '@/modules/system-settings/service';
import {
  DELETE as revokePortalInvite,
  GET as readPortalInvite,
  POST as issuePortalInvite,
} from './portal-invite/route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001098';
const PATIENT_ID = '00000000-0000-4000-8000-000000003098';
const INVITE_ID = '00000000-0000-4000-8000-000000004098';

/** Every mechanic this organization could buy is available; only the preference varies here. */
const fullMechanicAccess = {
  resolveMechanicAccess: vi.fn(async (_organizationId: string, mechanic: string) => ({
    mechanic,
    state: 'full_access' as const,
    policySource: 'critical' as const,
    warning: null,
  })),
};

async function depsFor(options: { clientPortal: boolean; portalAllowed: boolean }) {
  const port = createInMemorySystemSettingsPort();
  const composition = defaultDoctorWorkspaceComposition();
  await port.upsert(
    DOCTOR_WORKSPACE_COMPOSITION_KEY,
    'doctor',
    {
      value: {
        ...composition,
        modules: { ...composition.modules, client_portal: options.clientPortal },
      },
    },
    'c3m-10-audit',
    { organizationId: ORGANIZATION_ID },
  );

  return {
    orgEntitlements: fullMechanicAccess,
    systemSettings: createSystemSettingsService(port),
    doctorClientsPort: {
      getClientIdentityForOrganization: vi
        .fn()
        .mockResolvedValue({ userId: PATIENT_ID, email: 'client@example.test' }),
    },
    doctorClients: {
      getClientChannelPolicy: vi.fn().mockResolvedValue({
        portalAllowed: options.portalAllowed,
        directChatAllowed: true,
        commentsAllowed: true,
        mediaAllowed: true,
      }),
    },
    patientInvites: {
      issue: vi.fn().mockResolvedValue({
        ok: true,
        invite: { id: INVITE_ID, expiresAt: '2026-09-14T00:00:00.000Z' },
        relativeUrl: `/join/${INVITE_ID}`,
      }),
      revoke: vi.fn().mockResolvedValue(true),
      getPortalStatus: vi
        .fn()
        .mockResolvedValue({ status: 'invited', inviteId: INVITE_ID, expiresAt: null }),
    },
  };
}

const params = { params: Promise.resolve({ userId: PATIENT_ID }) };

function revokeRequest(): Request {
  return new Request(`https://app.example.test/api/doctor/patients/${PATIENT_ID}/portal-invite`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inviteId: INVITE_ID }),
  });
}

describe('C3M-10 portal invite door', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        canAccessClinicalWorkspace: true,
        session: { user: { userId: '00000000-0000-4000-8000-000000005098' } },
      },
    });
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      <T>(...args: unknown[]): T => (args.at(-1) as () => T)(),
    );
  });

  it('issues the invite while the portal is on and the client is not denied', async () => {
    const deps = await depsFor({ clientPortal: true, portalAllowed: true });
    fakes.buildAppDeps.mockReturnValue(deps);

    const response = await issuePortalInvite(new Request('https://app.example.test'), params);

    expect(response.status).toBe(200);
    expect(deps.patientInvites.issue).toHaveBeenCalledTimes(1);
  });

  it('refuses to issue an invite when the organization turned the portal off', async () => {
    const deps = await depsFor({ clientPortal: false, portalAllowed: true });
    fakes.buildAppDeps.mockReturnValue(deps);

    const response = await issuePortalInvite(new Request('https://app.example.test'), params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'workspace_module_disabled',
      module: 'client_portal',
    });
    expect(deps.patientInvites.issue).not.toHaveBeenCalled();
  });

  it('refuses to issue an invite for a client denied individually', async () => {
    const deps = await depsFor({ clientPortal: true, portalAllowed: false });
    fakes.buildAppDeps.mockReturnValue(deps);

    const response = await issuePortalInvite(new Request('https://app.example.test'), params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'workspace_module_disabled',
      module: 'client_portal',
    });
    expect(deps.patientInvites.issue).not.toHaveBeenCalled();
  });

  it('still reads the invite state and revokes a pending invite while the portal is off', async () => {
    const deps = await depsFor({ clientPortal: false, portalAllowed: false });
    fakes.buildAppDeps.mockReturnValue(deps);

    const state = await readPortalInvite(new Request('https://app.example.test'), params);
    const revoked = await revokePortalInvite(revokeRequest(), params);

    expect(state.status).toBe(200);
    expect(revoked.status).toBe(200);
    expect(deps.patientInvites.revoke).toHaveBeenCalledTimes(1);
  });
});
