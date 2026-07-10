import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const patientGateMock = vi.hoisted(() => vi.fn());
const relayOutboundMock = vi.hoisted(() => vi.fn());
const envForTest = vi.hoisted(() => ({ ADMIN_TELEGRAM_ID: 424242 as number | undefined }));
const headerMap = vi.hoisted(() => ({
  entries: [["user-agent", "VitestUA/1"]] as [string, string][],
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/platform-access", () => ({
  patientClientBusinessGate: patientGateMock,
}));

// S7: relay-outbound is now the send path instead of raw Telegram fetch
vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(headerMap.entries)),
}));

vi.mock("@/config/env", () => ({
  env: envForTest,
}));

import { POST } from "./route";

function baseSession(overrides?: Partial<{ userId: string; phone: string; telegramId: string }>) {
  const o = overrides ?? {};
  return {
    user: {
      userId: o.userId !== undefined ? o.userId : "user-support-1",
      role: "client" as const,
      displayName: "Тест",
      phone: o.phone !== undefined ? o.phone : "+79990001122",
      bindings: {
        telegramId: o.telegramId ?? "",
        maxId: "",
        vkId: "",
      },
    },
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  };
}

const jsonBody = (email: string, message: string, opts?: { surface?: string; from?: string }) =>
  JSON.stringify({
    email,
    message,
    ...(opts?.surface ? { surface: opts.surface } : {}),
    ...(opts?.from !== undefined ? { from: opts.from } : {}),
  });

describe("POST /api/patient/support", () => {
  beforeEach(() => {
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });
    patientGateMock.mockResolvedValue("allow");
    envForTest.ADMIN_TELEGRAM_ID = 424242;
    headerMap.entries = [["user-agent", "VitestUA/1"]];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("a@b.co", "hi"),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when gate is stale_session", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession());
    patientGateMock.mockResolvedValue("stale_session");
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("a@b.co", "hi"),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for non-client role", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: {
        userId: "doc-1",
        role: "doctor",
        displayName: "Dr",
        phone: "",
        bindings: {},
      },
      issuedAt: 0,
      expiresAt: 9_999_999_999,
    });
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("a@b.co", "hi"),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid email", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession());
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("not-an-email", "hi"),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_email");
  });

  it("returns 200 when gate is need_activation and emits relay with correct recipient and text", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "onb-1", phone: "" }));
    patientGateMock.mockResolvedValue("need_activation");
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("user@example.com", "Помогите"),
      }),
    );
    expect(res.status).toBe(200);
    expect(relayOutboundMock).toHaveBeenCalledTimes(1);
    const [params] = relayOutboundMock.mock.calls[0] as [{ channel: string; recipient: string; text: string; messageId: string }];
    expect(params.channel).toBe("telegram");
    expect(params.recipient).toBe("424242");
    expect(params.text).toContain("user@example.com");
    expect(params.text).toContain("onb-1");
  });

  it("includes sanitized from path in Telegram text when under /app", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "support-from-ok" }));
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("a@b.co", "hi", { from: "/app/patient/bind-phone" }),
      }),
    );
    expect(res.status).toBe(200);
    const [params] = relayOutboundMock.mock.calls[0] as [{ text: string }];
    expect(params.text).toContain("Страница: /app/patient/bind-phone");
  });

  it("ignores from path outside /app", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "support-from-bad" }));
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("a@b.co", "hi", { from: "/login?next=/evil" }),
      }),
    );
    expect(res.status).toBe(200);
    const [params] = relayOutboundMock.mock.calls[0] as [{ text: string }];
    expect(params.text).not.toContain("Страница:");
  });

  it("allows messenger bindings (no messenger_only)", async () => {
    getCurrentSessionMock.mockResolvedValue(
      baseSession({ userId: "tg-user", telegramId: "12345" }),
    );
    patientGateMock.mockResolvedValue("allow");
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("x@y.z", "msg"),
      }),
    );
    expect(res.status).toBe(200);
    const [params] = relayOutboundMock.mock.calls[0] as [{ text: string }];
    expect(params.text).toContain("telegram=да");
    expect(params.text).toContain("12345");
  });

  it("returns 429 on rapid repeat after success", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "rate-u" }));
    const req = () =>
      POST(
        new Request("http://localhost/api/patient/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("r@r.r", "one"),
        }),
      );
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(429);
  });

  it("rate-limits by phone when userId is empty", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "", phone: "+79991112233" }));
    const req = () =>
      POST(
        new Request("http://localhost/api/patient/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("p@p.p", "m"),
        }),
      );
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(429);
  });

  it("rate-limits by X-Forwarded-For when userId and phone empty", async () => {
    headerMap.entries = [
      ["user-agent", "VitestUA/1"],
      ["x-forwarded-for", "203.0.113.9, 10.0.0.1"],
    ];
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "", phone: "" }));
    const req = () =>
      POST(
        new Request("http://localhost/api/patient/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("i@i.i", "m"),
        }),
      );
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(429);
  });

  it("does not rate-limit after failed relay send (relay non-ok → 502)", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "fail-u" }));
    relayOutboundMock.mockResolvedValueOnce({ ok: false, reason: "relay_error" });
    const req = () =>
      POST(
        new Request("http://localhost/api/patient/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("f@f.f", "m"),
        }),
      );
    expect((await req()).status).toBe(502);
    expect((await req()).status).toBe(200);
  });

  it("returns 503 when ADMIN_TELEGRAM_ID is missing", async () => {
    envForTest.ADMIN_TELEGRAM_ID = undefined;
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "support-no-admin-id" }));
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("a@b.co", "x"),
      }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 503 when ADMIN_TELEGRAM_ID is 0", async () => {
    envForTest.ADMIN_TELEGRAM_ID = 0;
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "support-admin-zero" }));
    const res = await POST(
      new Request("http://localhost/api/patient/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("a@b.co", "x"),
      }),
    );
    expect(res.status).toBe(503);
  });

  describe("relay-outbound chokepoint (S7 / P24)", () => {
    it("calls relayOutbound with channel=telegram and recipient=ADMIN_TELEGRAM_ID", async () => {
      getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "relay-check-u" }));
      const res = await POST(
        new Request("http://localhost/api/patient/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("a@b.co", "test message"),
        }),
      );
      expect(res.status).toBe(200);
      expect(relayOutboundMock).toHaveBeenCalledTimes(1);
      const [params] = relayOutboundMock.mock.calls[0] as [{ channel: string; recipient: string; messageId: string; text: string }];
      expect(params.channel).toBe("telegram");
      expect(params.recipient).toBe("424242");
      expect(params.messageId).toMatch(/^support:patient:/);
    });

    it("returns 502 when relayOutbound fails", async () => {
      getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "relay-fail-u" }));
      relayOutboundMock.mockResolvedValue({ ok: false, reason: "no_integrator_url" });
      const res = await POST(
        new Request("http://localhost/api/patient/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("a@b.co", "test message"),
        }),
      );
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("send_failed");
    });
  });
});
