import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  ensureMock,
  getClientIdentityForOrganizationMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  buildAppDepsMock,
} = vi.hoisted(() => {
  const ensureMockInner = vi.fn();
  const getClientIdentityForOrganizationMockInner = vi.fn();
  const requireDoctorWorkspaceApiContextMockInner = vi.fn();
  const withDoctorWorkspacePrincipalMockInner = vi.fn(
    (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
      const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
      if (!fn) throw new Error('principal_callback_required');
      return fn();
    },
  );
  return {
    ensureMock: ensureMockInner,
    getClientIdentityForOrganizationMock: getClientIdentityForOrganizationMockInner,
    requireDoctorWorkspaceApiContextMock: requireDoctorWorkspaceApiContextMockInner,
    withDoctorWorkspacePrincipalMock: withDoctorWorkspacePrincipalMockInner,
    buildAppDepsMock: vi.fn(() => ({
      doctorClientsPort: {
        getClientIdentityForOrganization: getClientIdentityForOrganizationMockInner,
      },
      messaging: {
        doctorSupport: {
          listOpenConversations: vi.fn(),
          ensureConversationForPatient: ensureMockInner,
          getMessages: vi.fn(),
          sendAdminReply: vi.fn(),
          markUserMessagesRead: vi.fn(),
          unreadFromUsers: vi.fn(),
        },
      },
    })),
  };
});

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

import { POST } from './route';

const patientUserId = '00000000-0000-4000-8000-000000000111';
const orgId = '10000000-0000-4000-8000-000000000001';
const secondOrgId = '20000000-0000-4000-8000-000000000002';

const patientIdentity = {
  userId: patientUserId,
  displayName: 'Patient',
  phone: null,
  bindings: {},
  createdAt: null,
  isBlocked: false,
  blockedReason: null,
  isArchived: false,
  channelBindingDates: {},
};

function request(body: unknown) {
  return new Request('http://localhost/api/doctor/messages/conversations/ensure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/doctor/messages/conversations/ensure', () => {
  beforeEach(() => {
    ensureMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
        if (!fn) throw new Error('principal_callback_required');
        return fn();
      },
    );
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: orgId,
        session: { user: { userId: 'd1', role: 'doctor', bindings: {} } },
      },
    });
  });

  it('returns workspace gate response', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    });
    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid patientUserId', async () => {
    const res = await POST(request({ patientUserId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when patient is missing', async () => {
    getClientIdentityForOrganizationMock.mockResolvedValue(null);
    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(404);
    expect(ensureMock).not.toHaveBeenCalled();
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(patientUserId, orgId);
  });

  it('returns 500 when ensure conversation fails', async () => {
    getClientIdentityForOrganizationMock.mockResolvedValue(patientIdentity);
    ensureMock.mockRejectedValue(new Error('db failed'));
    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(500);
  });

  it('returns ensured conversation with messages and unread count', async () => {
    getClientIdentityForOrganizationMock.mockResolvedValue(patientIdentity);
    ensureMock.mockResolvedValue({
      conversationId: '00000000-0000-4000-8000-000000000222',
      unreadFromUserCount: 1,
      messages: [
        {
          id: 'm1',
          organizationId: null,
          integratorMessageId: 'x',
          conversationId: '00000000-0000-4000-8000-000000000222',
          senderRole: 'user',
          messageType: 'text',
          text: 'hello',
          source: 'webapp',
          createdAt: '2025-03-01T12:00:00.000Z',
          readAt: null,
          deliveredAt: null,
          mediaUrl: null,
          mediaType: null,
        },
      ],
    });

    const res = await POST(request({ patientUserId }));
    const data = (await res.json()) as {
      ok: boolean;
      messages: unknown[];
      unreadFromUserCount: number;
    };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.messages).toHaveLength(1);
    expect(data.unreadFromUserCount).toBe(1);
    expect(ensureMock).toHaveBeenCalledWith(patientUserId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgId }),
      expect.any(Function),
    );
  });

  it("ensures a shared patient's chat independently inside Clinic A and Clinic B principals", async () => {
    requireDoctorWorkspaceApiContextMock
      .mockResolvedValueOnce({
        ok: true,
        ctx: {
          organizationId: orgId,
          session: { user: { userId: 'doctor-a', role: 'doctor', bindings: {} } },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        ctx: {
          organizationId: secondOrgId,
          session: { user: { userId: 'doctor-b', role: 'doctor', bindings: {} } },
        },
      });
    getClientIdentityForOrganizationMock.mockResolvedValue(patientIdentity);
    ensureMock
      .mockResolvedValueOnce({ conversationId: 'conv-a', messages: [], unreadFromUserCount: 0 })
      .mockResolvedValueOnce({ conversationId: 'conv-b', messages: [], unreadFromUserCount: 0 });

    const clinicAResponse = await POST(request({ patientUserId }));
    const clinicBResponse = await POST(request({ patientUserId }));

    expect(clinicAResponse.status).toBe(200);
    expect(clinicBResponse.status).toBe(200);
    expect(getClientIdentityForOrganizationMock).toHaveBeenNthCalledWith(1, patientUserId, orgId);
    expect(getClientIdentityForOrganizationMock).toHaveBeenNthCalledWith(
      2,
      patientUserId,
      secondOrgId,
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ organizationId: orgId }),
      expect.any(Function),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ organizationId: secondOrgId }),
      expect.any(Function),
    );
  });
});
