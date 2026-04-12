import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const patientGateMock = vi.hoisted(() => vi.fn());
const getTelegramBotTokenMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
const envForTest = vi.hoisted(() => ({ ADMIN_TELEGRAM_ID: 424242 as number | undefined }));
const headerMap = vi.hoisted(() => ({
  entries: [["user-agent", "VitestUA/1"]] as [string, string][],
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/modules/platform-access", () => ({
  patientClientBusinessGate: patientGateMock,
}));

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getTelegramBotToken: getTelegramBotTokenMock,
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
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true, text: async () => "{}" });
    getTelegramBotTokenMock.mockResolvedValue("token");
    patientGateMock.mockResolvedValue("allow");
    envForTest.ADMIN_TELEGRAM_ID = 424242;
    headerMap.entries = [["user-agent", "VitestUA/1"]];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("returns 200 when gate is need_activation", async () => {
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
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { chat_id: number; text: string };
    expect(payload.chat_id).toBe(424242);
    expect(payload.text).toContain("user@example.com");
    expect(payload.text).toContain("onb-1");
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
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { text: string };
    expect(payload.text).toContain("Страница: /app/patient/bind-phone");
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
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { text: string };
    expect(payload.text).not.toContain("Страница:");
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
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { text: string };
    expect(payload.text).toContain("telegram=да");
    expect(payload.text).toContain("12345");
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

  it("does not rate-limit after failed Telegram send", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "fail-u" }));
    fetchMock.mockResolvedValueOnce({ ok: false, text: async () => "err" });
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

  it("returns 503 when bot token missing", async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: "support-no-token" }));
    getTelegramBotTokenMock.mockResolvedValue("");
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
});
