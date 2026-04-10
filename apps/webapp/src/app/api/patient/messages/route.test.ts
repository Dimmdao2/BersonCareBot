import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { gateMock, buildAppDepsMock, bootstrapMock, pollNewMock, sendTextMock, unreadMock } = vi.hoisted(() => {
  const gateMockInner = vi.fn();
  const bootstrapMockInner = vi.fn();
  const pollNewMockInner = vi.fn();
  const sendTextMockInner = vi.fn();
  const unreadMockInner = vi.fn();
  return {
    gateMock: gateMockInner,
    bootstrapMock: bootstrapMockInner,
    pollNewMock: pollNewMockInner,
    sendTextMock: sendTextMockInner,
    unreadMock: unreadMockInner,
    buildAppDepsMock: vi.fn(() => ({
      messaging: {
        patient: {
          bootstrap: bootstrapMockInner,
          pollNew: pollNewMockInner,
          sendText: sendTextMockInner,
          unreadCount: unreadMockInner,
          markInboundRead: vi.fn(),
        },
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiSessionWithPhone: gateMock,
}));

import { GET, POST } from "./route";

function okClient(userId: string, phone = "+79990001122") {
  return {
    ok: true as const,
    session: { user: { userId, role: "client" as const, phone, bindings: {} } },
  };
}

describe("GET /api/patient/messages", () => {
  beforeEach(() => {
    gateMock.mockReset();
    bootstrapMock.mockReset();
    pollNewMock.mockReset();
    unreadMock.mockReset();
  });

  it("returns 401 without session", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/patient/messages"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when not patient", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/patient/messages"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when polling foreign conversation", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    pollNewMock.mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/patient/messages?conversationId=00000000-0000-4000-8000-000000000001&since=2025-01-01T00:00:00.000Z",
      ),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 bootstrap with messages", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    bootstrapMock.mockResolvedValue({
      conversationId: "00000000-0000-4000-8000-000000000002",
      messages: [
        {
          id: "m1",
          integratorMessageId: "x",
          conversationId: "00000000-0000-4000-8000-000000000002",
          senderRole: "user",
          messageType: "text",
          text: "hi",
          source: "webapp",
          createdAt: "2025-03-01T12:00:00.000Z",
          readAt: null,
          deliveredAt: null,
          mediaUrl: null,
          mediaType: null,
        },
      ],
    });
    unreadMock.mockResolvedValue(1);
    const res = await GET(new Request("http://localhost/api/patient/messages"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; conversationId: string; unreadCount: number };
    expect(data.ok).toBe(true);
    expect(data.conversationId).toBe("00000000-0000-4000-8000-000000000002");
    expect(data.unreadCount).toBe(1);
  });

  it("returns 400 for invalid conversationId uuid", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    const res = await GET(new Request("http://localhost/api/patient/messages?conversationId=not-a-uuid"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/patient/messages", () => {
  beforeEach(() => {
    gateMock.mockReset();
    sendTextMock.mockReset();
  });

  it("returns 401 without session", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(
      new Request("http://localhost/api/patient/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hi", conversationId: "00000000-0000-4000-8000-000000000002" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when send fails not_found", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    sendTextMock.mockResolvedValue({ ok: false, error: "not_found" });
    const res = await POST(
      new Request("http://localhost/api/patient/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hi", conversationId: "00000000-0000-4000-8000-000000000002" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 on success", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    sendTextMock.mockResolvedValue({ ok: true });
    const res = await POST(
      new Request("http://localhost/api/patient/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hi", conversationId: "00000000-0000-4000-8000-000000000002" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it("returns 403 when messaging is blocked for user", async () => {
    gateMock.mockResolvedValue(okClient("u1"));
    sendTextMock.mockResolvedValue({ ok: false, error: "blocked" });
    const res = await POST(
      new Request("http://localhost/api/patient/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hi", conversationId: "00000000-0000-4000-8000-000000000002" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
