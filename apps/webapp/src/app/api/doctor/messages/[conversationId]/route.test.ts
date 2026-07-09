import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getMessagesMock,
  sendMock,
  getConversationWithMessagesMock,
  claimLegacyConversationForOrganizationMock,
  getClientIdentityForOrganizationMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  buildAppDepsMock,
} = vi.hoisted(() => {
  const getSessionMockInner = vi.fn();
  const getMessagesMockInner = vi.fn();
  const sendMockInner = vi.fn();
  const getConversationWithMessagesMockInner = vi.fn();
  const claimLegacyConversationForOrganizationMockInner = vi.fn();
  const getClientIdentityForOrganizationMockInner = vi.fn();
  const requireDoctorWorkspaceApiContextMockInner = vi.fn();
  const withDoctorWorkspacePrincipalMockInner = vi.fn((_: unknown, fn: () => unknown) => fn());
  return {
    getSessionMock: getSessionMockInner,
    getMessagesMock: getMessagesMockInner,
    sendMock: sendMockInner,
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
          listOpenConversations: vi.fn(),
          getMessages: getMessagesMockInner,
          sendAdminReply: sendMockInner,
          markUserMessagesRead: vi.fn(),
          unreadFromUsers: vi.fn(),
        },
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, fn),
}));

import { GET, POST } from "./route";

const cid = "00000000-0000-4000-8000-000000000099";
const orgId = "10000000-0000-4000-8000-000000000001";

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: cid,
    organizationId: orgId,
    integratorConversationId: `webapp:platform:00000000-0000-4000-8000-000000000111`,
    platformUserId: "00000000-0000-4000-8000-000000000111",
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

describe("GET /api/doctor/messages/[conversationId]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getMessagesMock.mockReset();
    getConversationWithMessagesMock.mockReset();
    claimLegacyConversationForOrganizationMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    claimLegacyConversationForOrganizationMock.mockResolvedValue(true);
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: orgId, session: { user: { userId: "d1", role: "doctor", bindings: {} } } },
    });
  });

  it("returns workspace gate response", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET(new Request(`http://localhost/api/doctor/messages/${cid}`), {
      params: Promise.resolve({ conversationId: cid }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when conversation missing", async () => {
    getConversationWithMessagesMock.mockResolvedValue(null);
    getMessagesMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/doctor/messages/${cid}`), {
      params: Promise.resolve({ conversationId: cid }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for another organization conversation", async () => {
    getConversationWithMessagesMock.mockResolvedValue({
      conversation: conversation({ organizationId: "20000000-0000-4000-8000-000000000002" }),
      messages: [],
    });
    const res = await GET(new Request(`http://localhost/api/doctor/messages/${cid}`), {
      params: Promise.resolve({ conversationId: cid }),
    });
    expect(res.status).toBe(404);
    expect(getMessagesMock).not.toHaveBeenCalled();
  });

  it("returns 200 with messages", async () => {
    getConversationWithMessagesMock.mockResolvedValue({ conversation: conversation(), messages: [] });
    getMessagesMock.mockResolvedValue({
      messages: [
        {
          id: "m1",
          organizationId: null,
          integratorMessageId: "x",
          conversationId: cid,
          senderRole: "user",
          messageType: "text",
          text: "hello",
          source: "webapp",
          createdAt: "2025-03-01T12:00:00.000Z",
          readAt: null,
          deliveredAt: null,
          mediaUrl: null,
          mediaType: null,
        },
      ],
    });
    const res = await GET(new Request(`http://localhost/api/doctor/messages/${cid}`), {
      params: Promise.resolve({ conversationId: cid }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; messages: unknown[] };
    expect(data.ok).toBe(true);
    expect(data.messages).toHaveLength(1);
  });

  it("allows legacy unowned channel-only conversation read", async () => {
    getConversationWithMessagesMock.mockResolvedValue({
      conversation: conversation({ organizationId: null, platformUserId: null }),
      messages: [],
    });
    getMessagesMock.mockResolvedValue({ messages: [] });

    const res = await GET(new Request(`http://localhost/api/doctor/messages/${cid}`), {
      params: Promise.resolve({ conversationId: cid }),
    });

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganizationMock).not.toHaveBeenCalled();
    expect(claimLegacyConversationForOrganizationMock).toHaveBeenCalledWith({
      conversationId: cid,
      organizationId: orgId,
    });
  });
});

describe("POST /api/doctor/messages/[conversationId]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    sendMock.mockReset();
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
    const res = await POST(
      new Request(`http://localhost/api/doctor/messages/${cid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "reply" }),
      }),
      { params: Promise.resolve({ conversationId: cid }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 on success", async () => {
    getConversationWithMessagesMock.mockResolvedValue({ conversation: conversation(), messages: [] });
    sendMock.mockResolvedValue({ ok: true });
    const res = await POST(
      new Request(`http://localhost/api/doctor/messages/${cid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "reply" }),
      }),
      { params: Promise.resolve({ conversationId: cid }) }
    );
    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgId }),
      expect.any(Function),
    );
  });

  it("returns 404 for conversation from another organization", async () => {
    getConversationWithMessagesMock.mockResolvedValue({
      conversation: conversation({ organizationId: "20000000-0000-4000-8000-000000000002" }),
      messages: [],
    });
    const res = await POST(
      new Request(`http://localhost/api/doctor/messages/${cid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "reply" }),
      }),
      { params: Promise.resolve({ conversationId: cid }) }
    );
    expect(res.status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("allows legacy null-org conversation only when patient belongs to workspace", async () => {
    getConversationWithMessagesMock.mockResolvedValue({
      conversation: conversation({ organizationId: null }),
      messages: [],
    });
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000111" });
    sendMock.mockResolvedValue({ ok: true });

    const res = await POST(
      new Request(`http://localhost/api/doctor/messages/${cid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "reply" }),
      }),
      { params: Promise.resolve({ conversationId: cid }) }
    );

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000111",
      orgId,
    );
    expect(claimLegacyConversationForOrganizationMock).toHaveBeenCalledWith({
      conversationId: cid,
      organizationId: orgId,
    });
  });

  it("allows legacy unowned channel-only conversation reply", async () => {
    getConversationWithMessagesMock.mockResolvedValue({
      conversation: conversation({ organizationId: null, platformUserId: null }),
      messages: [],
    });
    sendMock.mockResolvedValue({ ok: true });

    const res = await POST(
      new Request(`http://localhost/api/doctor/messages/${cid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "reply" }),
      }),
      { params: Promise.resolve({ conversationId: cid }) }
    );

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganizationMock).not.toHaveBeenCalled();
    expect(claimLegacyConversationForOrganizationMock).toHaveBeenCalledWith({
      conversationId: cid,
      organizationId: orgId,
    });
  });
});
