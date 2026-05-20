import { describe, expect, it, vi, beforeEach } from "vitest";

const getStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    phoneMessengerBind: { getStatus: (...args: unknown[]) => getStatusMock(...args) },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/phone/messenger-bind/status", () => {
  beforeEach(() => {
    getStatusMock.mockReset();
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns pending_contact", async () => {
    getStatusMock.mockResolvedValue({ ok: true, status: "pending_contact" });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status?: string };
    expect(data.status).toBe("pending_contact");
  });

  it("returns otp_ready with challengeId", async () => {
    getStatusMock.mockResolvedValue({
      ok: true,
      status: "otp_ready",
      challengeId: "ch-1",
      retryAfterSeconds: 60,
    });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc" }),
      }),
    );
    const data = (await res.json()) as { challengeId?: string; status?: string };
    expect(data.status).toBe("otp_ready");
    expect(data.challengeId).toBe("ch-1");
  });

  it("returns 404 when not_found", async () => {
    getStatusMock.mockResolvedValue({ ok: false, code: "not_found" });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_missing" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns failed status with error", async () => {
    getStatusMock.mockResolvedValue({ ok: true, status: "failed", error: "phone_mismatch" });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc" }),
      }),
    );
    const data = (await res.json()) as { status?: string; error?: string };
    expect(data.status).toBe("failed");
    expect(data.error).toBe("phone_mismatch");
  });

  it("returns expired status", async () => {
    getStatusMock.mockResolvedValue({ ok: true, status: "expired" });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc" }),
      }),
    );
    const data = (await res.json()) as { status?: string };
    expect(res.status).toBe(200);
    expect(data.status).toBe("expired");
  });
});
