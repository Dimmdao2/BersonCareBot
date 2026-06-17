import { describe, expect, it, vi, beforeEach } from "vitest";

const sessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: sessionMock,
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
    sessionMock.mockResolvedValue(null);
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });
  });

  it("returns 401 when not authenticated", async () => {
    const res = await POST(jsonReq({ to: "a@b.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    sessionMock.mockResolvedValue({ user: { role: "doctor", userId: "u1" } });
    const res = await POST(jsonReq({ to: "a@b.com" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid email", async () => {
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "u1" } });
    const res = await POST(jsonReq({ to: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 and relays email channel with subject metadata", async () => {
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "u1" } });

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
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "u1" } });
    relayOutboundMock.mockResolvedValue({ ok: false, reason: "no_integrator_url" });
    const res = await POST(jsonReq({ to: "test@example.com" }));
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string; message?: string };
    expect(data.error).toBe("send_failed");
    expect(data.message).toBe("no_integrator_url");
  });
});
