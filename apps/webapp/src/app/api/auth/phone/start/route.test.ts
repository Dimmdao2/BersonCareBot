import { describe, expect, it, vi, beforeEach } from "vitest";

const startPhoneAuth = vi.fn();
const findByPhone = vi.fn();

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
