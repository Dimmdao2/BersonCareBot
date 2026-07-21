import { describe, expect, it, vi, beforeEach } from "vitest";

const startPhoneAuth = vi.fn();
const findByPhone = vi.fn();
const getPublicRuntimeBool = vi.hoisted(() => vi.fn());
const getCurrentSession = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationId = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getPublicRuntimeBool,
}));

vi.mock("@/modules/auth/service", () => ({ getCurrentSession }));

vi.mock("@bersoncare/db-principal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bersoncare/db-principal")>()),
  getCurrentDbPrincipalOrganizationId,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: {
      startPhoneAuth,
    },
    userByPhone: {
      findByPhone,
      getVerifiedEmailForUser: vi.fn().mockResolvedValue(null),
    },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/phone/start", () => {
  beforeEach(() => {
    startPhoneAuth.mockReset();
    findByPhone.mockReset();
    getPublicRuntimeBool.mockReset();
    getPublicRuntimeBool.mockResolvedValue(true);
    getCurrentSession.mockReset();
    getCurrentSession.mockResolvedValue(null);
    getCurrentDbPrincipalOrganizationId.mockReset();
    getCurrentDbPrincipalOrganizationId.mockReturnValue("00000000-0000-4000-8000-000000000001");
    findByPhone.mockResolvedValue(null);
    startPhoneAuth.mockResolvedValue({
      ok: true as const,
      challengeId: "test-challenge-id",
      retryAfterSeconds: 60,
    });
  });

  it("returns 400 when phone is not valid E.164", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "!!!" }),
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_phone");
  });

  it("returns 400 when phone is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("phone_required");
  });

  it("returns 400 sms_disabled_web when SMS requested for web channel", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79991234567", deliveryChannel: "sms" }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
    expect(data.ok).toBe(false);
    expect(data.error).toBe("sms_disabled_web");
    expect(startPhoneAuth).not.toHaveBeenCalled();
  });

  it("uses auth_sms_enabled independently of the legacy SMS fallback flag", async () => {
    getPublicRuntimeBool.mockImplementation(async (key: string) => key === "auth_sms_enabled");
    findByPhone.mockResolvedValue({
      userId: "sms-user",
      bindings: { telegramId: null, maxId: null },
    });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: "+79991234567",
          channel: "telegram",
          chatId: "tg-1",
          deliveryChannel: "sms",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(getPublicRuntimeBool).toHaveBeenCalledWith("auth_sms_enabled", "public_auth_config");
    expect(getPublicRuntimeBool).not.toHaveBeenCalledWith("public_sms_fallback_enabled");
    expect(startPhoneAuth).toHaveBeenCalledWith(
      "+79991234567",
      expect.objectContaining({ channel: "telegram", chatId: "tg-1" }),
      expect.objectContaining({ delivery: { channel: "sms" } }),
    );
  });

  it("rejects SMS when the platform auth SMS channel is disabled", async () => {
    getPublicRuntimeBool.mockImplementation(async (key: string) => key !== "auth_sms_enabled");
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: "+79991234567",
          channel: "telegram",
          chatId: "tg-1",
          deliveryChannel: "sms",
        }),
      }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
    expect(findByPhone).not.toHaveBeenCalled();
    expect(startPhoneAuth).not.toHaveBeenCalled();
  });

  it("rejects a disabled auth channel before user lookup or challenge creation", async () => {
    getPublicRuntimeBool.mockImplementation(async (key: string) => key !== "auth_telegram_enabled");
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79991234567", deliveryChannel: "telegram" }),
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
    expect(findByPhone).not.toHaveBeenCalled();
    expect(startPhoneAuth).not.toHaveBeenCalled();
  });

  it("returns 400 sms_disabled_web when deliveryChannel omitted on web (implicit sms)", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79991234567" }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { ok: boolean; error?: string };
    expect(data.error).toBe("sms_disabled_web");
    expect(startPhoneAuth).not.toHaveBeenCalled();
  });

  it("returns 200 with challengeId for valid phone and telegram delivery", async () => {
    findByPhone.mockResolvedValue({
      userId: "u-web-1",
      bindings: { telegramId: "tg-1", maxId: null },
    });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79991234567", deliveryChannel: "telegram" }),
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.challengeId).toBe("string");
    expect(data.challengeId.length).toBeGreaterThan(0);
    expect(data.retryAfterSeconds).toBe(60);
  });

  it("binds an existing phone to the authenticated profile instead of starting a login", async () => {
    findByPhone.mockResolvedValue({
      userId: "phone-owner",
      bindings: { telegramId: "tg-1", maxId: null },
    });
    getCurrentSession.mockResolvedValue({
      user: { userId: "profile-user", role: "client" },
    });

    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: "+79991234567",
          deliveryChannel: "telegram",
          purpose: "profile_bind",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(startPhoneAuth).toHaveBeenCalledWith(
      "+79991234567",
      expect.objectContaining({ channel: "web" }),
      expect.objectContaining({
        delivery: { channel: "telegram", recipientId: "tg-1" },
        profileBindUserId: "profile-user",
        profileBindOrganizationId: "00000000-0000-4000-8000-000000000001",
      }),
    );
  });

  it("fails closed when profile bind has no unambiguous organization scope", async () => {
    findByPhone.mockResolvedValue({
      userId: "phone-owner",
      bindings: { telegramId: "tg-1", maxId: null },
    });
    getCurrentSession.mockResolvedValue({
      user: { userId: "profile-user", role: "client" },
    });
    getCurrentDbPrincipalOrganizationId.mockReturnValue(undefined);

    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: "+79991234567",
          deliveryChannel: "telegram",
          purpose: "profile_bind",
        }),
      }),
    );

    expect(res.status).toBe(409);
    expect(startPhoneAuth).not.toHaveBeenCalled();
  });

  it("returns 503 with user message when delivery_failed", async () => {
    findByPhone.mockResolvedValue({
      userId: "u-web-1",
      bindings: { telegramId: "tg-1", maxId: null },
    });
    startPhoneAuth.mockResolvedValueOnce({
      ok: false as const,
      code: "delivery_failed",
    });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79991234567", deliveryChannel: "telegram" }),
      })
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("delivery_failed");
    expect(data.message).toBe("Не удалось отправить код. Попробуйте позже.");
  });
});
