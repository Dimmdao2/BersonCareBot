/**
 * DL-MSG-04: messages-snapshot is read-only — empty vs error, no conversations/ensure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import type { ClientIdentity } from '@/modules/doctor-clients/ports';

type AppDeps = ReturnType<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>;
type RequireDoctorWorkspace =
  typeof import('@/app-layer/guards/requireRole').requireDoctorWorkspaceApiContext;

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>(),
  requireDoctorWorkspace: vi.fn<RequireDoctorWorkspace>(),
  withDoctorWorkspacePrincipal: vi.fn(),
  getClientIdentity: vi.fn<AppDeps['doctorClientsPort']['getClientIdentityForOrganization']>(),
  listConversationsByUser: vi.fn(),
  listMessagesSince: vi.fn(),
  countUnreadUserMessagesForAdminByConversation: vi.fn(),
  ensureConversation: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspace,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { GET } from './route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001201';
const DOCTOR_ID = '00000000-0000-4000-8000-000000002201';
const PATIENT_ID = '00000000-0000-4000-8000-000000003201';

const doctorContext: DoctorWorkspaceAccessContext = {
  session: {
    user: { userId: DOCTOR_ID, role: 'doctor', displayName: 'Messages doctor', bindings: {} },
    issuedAt: 1_790_000_000,
    expiresAt: 1_790_043_200,
  },
  organizationId: ORGANIZATION_ID,
  membershipId: 'membership-1201',
  membershipRole: 'doctor',
  specialistId: 'specialist-1201',
  canManageOrganization: false,
  canManageAllSpecialists: false,
  canAccessClinicalWorkspace: true,
  doctorScreensDisabled: false,
  capabilities: ['clinical.workspace'],
};

const clientIdentity: ClientIdentity = {
  userId: PATIENT_ID,
  displayName: 'Messages patient',
  phone: null,
  bindings: {},
  createdAt: '2026-08-05T00:00:00.000Z',
  isBlocked: false,
  blockedReason: null,
  isArchived: false,
  channelBindingDates: {},
};

function webappConversation(organizationId: string | null) {
  return {
    id: 'conv-1',
    organizationId,
    integratorConversationId: 'int-conv-1',
    platformUserId: PATIENT_ID,
    integratorUserId: null,
    source: 'webapp' as const,
    adminScope: 'org',
    status: 'open' as const,
    openedAt: '2026-08-05T11:00:00.000Z',
    lastMessageAt: '2026-08-05T12:00:00.000Z',
    closedAt: null,
    closeReason: null,
    channelCode: null,
    channelExternalId: null,
    createdAt: '2026-08-05T11:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
  };
}

describe('GET /api/doctor/patients/[userId]/messages-snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspace.mockResolvedValue({ ok: true, ctx: doctorContext });
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      (_ctx: unknown, fn: () => unknown) => fn(),
    );
    fakes.getClientIdentity.mockResolvedValue(clientIdentity);
    fakes.buildAppDeps.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization: fakes.getClientIdentity },
      supportCommunication: {
        listConversationsByUser: fakes.listConversationsByUser,
        listMessagesSince: fakes.listMessagesSince,
        countUnreadUserMessagesForAdminByConversation:
          fakes.countUnreadUserMessagesForAdminByConversation,
        ensureConversation: fakes.ensureConversation,
      },
    } as unknown as AppDeps);
  });

  it('returns empty ok snapshot without calling ensure when no conversation exists', async () => {
    fakes.listConversationsByUser.mockResolvedValue([]);

    const response = await GET(new Request('http://test/messages-snapshot'), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      conversationId: undefined,
      messages: [],
      unreadFromUserCount: 0,
    });
    expect(fakes.listConversationsByUser).toHaveBeenCalledWith(PATIENT_ID);
    expect(fakes.ensureConversation).not.toHaveBeenCalled();
    expect(fakes.listMessagesSince).not.toHaveBeenCalled();
  });

  it('returns 404 when patient is outside the doctor organization', async () => {
    fakes.getClientIdentity.mockResolvedValue(null);

    const response = await GET(new Request('http://test/messages-snapshot'), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_found' });
    expect(fakes.listConversationsByUser).not.toHaveBeenCalled();
    expect(fakes.ensureConversation).not.toHaveBeenCalled();
  });

  it('returns existing messages without ensure when a webapp conversation is present', async () => {
    fakes.listConversationsByUser.mockResolvedValue([webappConversation(ORGANIZATION_ID)]);
    fakes.listMessagesSince.mockResolvedValue([
      {
        id: 'msg-1',
        integratorMessageId: 'int-msg-1',
        conversationId: 'conv-1',
        senderRole: 'user',
        messageType: 'text',
        text: 'hello',
        source: 'webapp',
        externalChatId: null,
        externalMessageId: null,
        deliveryStatus: null,
        createdAt: '2026-08-05T12:00:00.000Z',
        readAt: null,
        deliveredAt: null,
        mediaUrl: null,
        mediaType: null,
      },
    ]);
    fakes.countUnreadUserMessagesForAdminByConversation.mockResolvedValue(1);

    const response = await GET(new Request('http://test/messages-snapshot'), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.conversationId).toBe('conv-1');
    expect(json.unreadFromUserCount).toBe(1);
    expect(json.messages).toHaveLength(1);
    expect(fakes.ensureConversation).not.toHaveBeenCalled();
  });

  it('does not expose a legacy conversation without exact organization ownership', async () => {
    fakes.listConversationsByUser.mockResolvedValue([webappConversation(null)]);
    fakes.listMessagesSince.mockResolvedValue([]);
    fakes.countUnreadUserMessagesForAdminByConversation.mockResolvedValue(0);

    const response = await GET(new Request('http://test/messages-snapshot'), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      conversationId: undefined,
      messages: [],
      unreadFromUserCount: 0,
    });
    expect(fakes.listMessagesSince).not.toHaveBeenCalled();
    expect(fakes.countUnreadUserMessagesForAdminByConversation).not.toHaveBeenCalled();
  });
});
