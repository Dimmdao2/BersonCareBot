import { describe, expect, it, vi, beforeEach } from "vitest";

const sessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: sessionMock,
}));

const getSettingMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() =>
  vi.fn(() => ({
    systemSettings: { getSetting: getSettingMock },
  })),
);
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

const sendTransactionalSmtpEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/outbound-email/sendTransactionalSmtp", () => ({
  sendTransactionalSmtpEmail: sendTransactionalSmtpEmailMock,
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
    getSettingMock.mockResolvedValue(null);
    sendTransactionalSmtpEmailMock.mockResolvedValue({ ok: true });
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

  it("returns 200 and calls send with stored smtp", async () => {
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "u1" } });
    const vj = { value: { host: "h", port: 587, secure: false, user: "u", password: "p", from: "f@x.com" } };
    getSettingMock.mockResolvedValue({ key: "smtp_outbound", valueJson: vj });

    const res = await POST(jsonReq({ to: "test@example.com" }));
    expect(res.status).toBe(200);
    expect(sendTransactionalSmtpEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        smtpValueJson: vj,
        to: "test@example.com",
        subject: expect.stringContaining("Тест SMTP"),
      }),
    );
  });

  it("returns 400 when send reports smtp_not_configured", async () => {
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "u1" } });
    sendTransactionalSmtpEmailMock.mockResolvedValue({ ok: false, error: "smtp_not_configured" });
    const res = await POST(jsonReq({ to: "test@example.com" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("smtp_not_configured");
  });

  it("returns 502 when send reports transport error", async () => {
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "u1" } });
    sendTransactionalSmtpEmailMock.mockResolvedValue({ ok: false, error: "ECONNREFUSED" });
    const res = await POST(jsonReq({ to: "test@example.com" }));
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string; message?: string };
    expect(data.error).toBe("send_failed");
    expect(data.message).toBe("ECONNREFUSED");
  });
});
