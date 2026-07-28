import { describe, expect, it, vi, beforeEach } from "vitest";

const platformGateMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePlatformOperationsApiContext: platformGateMock,
}));

// S10: smtp-test now uses relayOutbound (channel:'email') instead of direct sendTransactionalSmtpEmail.
const relayOutboundMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

import { POST } from "./route";

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/admin/smtp-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/smtp-test", () => {
  beforeEach(() => {
    platformGateMock.mockReset().mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });
  });

  it("returns 401 when not authenticated", async () => {
    const res = await POST(jsonReq({ to: "a@b.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the platform guard rejects a foreign audience", async () => {
    platformGateMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await POST(jsonReq({ to: "a@b.com" }));
    expect(res.status).toBe(403);
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid email", async () => {
    platformGateMock.mockResolvedValue({
      ok: true,
      session: { user: { role: "admin", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, adminMode: true },
    });
    const res = await POST(jsonReq({ to: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 and relays email channel with subject metadata", async () => {
    platformGateMock.mockResolvedValue({
      ok: true,
      session: { user: { role: "admin", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, adminMode: true },
    });

    const res = await POST(jsonReq({ to: "test@example.com" }));
    expect(res.status).toBe(200);
    expect(relayOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        recipient: "test@example.com",
        metadata: expect.objectContaining({ subject: expect.stringContaining("Тест SMTP") }),
      }),
    );
  });

  it("returns 502 when relay fails", async () => {
    platformGateMock.mockResolvedValue({
      ok: true,
      session: { user: { role: "admin", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, adminMode: true },
    });
    relayOutboundMock.mockResolvedValue({ ok: false, reason: "no_integrator_url" });
    const res = await POST(jsonReq({ to: "test@example.com" }));
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string; message?: string };
    expect(data.error).toBe("send_failed");
    expect(data.message).toBe("no_integrator_url");
  });
});
