import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  markUserMessagesReadMock,
  getConversationWithMessagesMock,
  claimLegacyConversationForOrganizationMock,
  getClientIdentityForOrganizationMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  buildAppDepsMock,
} = vi.hoisted(() => {
  const markUserMessagesReadMockInner = vi.fn();
  const getConversationWithMessagesMockInner = vi.fn();
  const claimLegacyConversationForOrganizationMockInner = vi.fn();
  const getClientIdentityForOrganizationMockInner = vi.fn();
  const requireDoctorWorkspaceApiContextMockInner = vi.fn();
  const withDoctorWorkspacePrincipalMockInner = vi.fn((_: unknown, fn: () => unknown) => fn());
  return {
    markUserMessagesReadMock: markUserMessagesReadMockInner,
    getConversationWithMessagesMock: getConversationWithMessagesMockInner,
    claimLegacyConversationForOrganizationMock: claimLegacyConversationForOrganizationMockInner,
    getClientIdentityForOrganizationMock: getClientIdentityForOrganizationMockInner,
    requireDoctorWorkspaceApiContextMock: requireDoctorWorkspaceApiContextMockInner,
    withDoctorWorkspacePrincipalMock: withDoctorWorkspacePrincipalMockInner,
    buildAppDepsMock: vi.fn(() => ({
      doctorClientsPort: {
        getClientIdentityForOrganization: getClientIdentityForOrganizationMockInner,
      },
      supportCommunication: {
        getConversationWithMessages: getConversationWithMessagesMockInner,
        claimLegacyConversationForOrganization: claimLegacyConversationForOrganizationMockInner,
      },
      messaging: {
        doctorSupport: {
          markUserMessagesRead: markUserMessagesReadMockInner,
        },
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, fn),
}));

import { POST } from "./route";

const cid = "00000000-0000-4000-8000-000000000099";
const patientUserId = "00000000-0000-4000-8000-000000000111";
const orgId = "10000000-0000-4000-8000-000000000001";

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: cid,
    organizationId: orgId,
    integratorConversationId: `webapp:platform:${patientUserId}`,
    platformUserId: patientUserId,
    integratorUserId: null,
    source: "webapp",
    adminScope: "support",
    status: "open",
    openedAt: "2026-01-01T00:00:00.000Z",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
    closeReason: null,
    channelCode: null,
    channelExternalId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("POST /api/doctor/messages/[conversationId]/read", () => {
  beforeEach(() => {
    markUserMessagesReadMock.mockReset();
    getConversationWithMessagesMock.mockReset();
    claimLegacyConversationForOrganizationMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation((_: unknown, fn: () => unknown) => fn());
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: orgId, session: { user: { userId: "d1", role: "doctor", bindings: {} } } },
    });
    claimLegacyConversationForOrganizationMock.mockResolvedValue(true);
  });

  it("returns workspace gate response", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const res = await POST(new Request(`http://localhost/api/doctor/messages/${cid}/read`), {
      params: Promise.resolve({ conversationId: cid }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 for another organization conversation", async () => {
    getConversationWithMessagesMock.mockResolvedValue({
      conversation: conversation({ organizationId: "20000000-0000-4000-8000-000000000002" }),
      messages: [],
    });

    const res = await POST(new Request(`http://localhost/api/doctor/messages/${cid}/read`), {
      params: Promise.resolve({ conversationId: cid }),
    });

    expect(res.status).toBe(404);
    expect(markUserMessagesReadMock).not.toHaveBeenCalled();
  });

  it("marks legacy null-org conversation read when patient belongs to workspace", async () => {
    getConversationWithMessagesMock.mockResolvedValue({
      conversation: conversation({ organizationId: null }),
      messages: [],
    });
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: patientUserId });

    const res = await POST(new Request(`http://localhost/api/doctor/messages/${cid}/read`), {
      params: Promise.resolve({ conversationId: cid }),
    });

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(patientUserId, orgId);
    expect(claimLegacyConversationForOrganizationMock).toHaveBeenCalledWith({
      conversationId: cid,
      organizationId: orgId,
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgId }),
      expect.any(Function),
    );
    expect(markUserMessagesReadMock).toHaveBeenCalledWith(cid);
  });

  it("marks legacy unowned channel-only conversation read", async () => {
    getConversationWithMessagesMock.mockResolvedValue({
      conversation: conversation({ organizationId: null, platformUserId: null }),
      messages: [],
    });

    const res = await POST(new Request(`http://localhost/api/doctor/messages/${cid}/read`), {
      params: Promise.resolve({ conversationId: cid }),
    });

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganizationMock).not.toHaveBeenCalled();
    expect(claimLegacyConversationForOrganizationMock).toHaveBeenCalledWith({
      conversationId: cid,
      organizationId: orgId,
    });
    expect(markUserMessagesReadMock).toHaveBeenCalledWith(cid);
  });
});
