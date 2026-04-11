import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const patientGateMock = vi.hoisted(() => vi.fn());
const requestMessengerMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/modules/platform-access", () => ({
  patientClientBusinessGate: patientGateMock,
}));

vi.mock("@/modules/messaging/requestMessengerContact", () => ({
  requestMessengerContactViaIntegrator: requestMessengerMock,
}));

import { POST } from "./route";

function sessionWithId(userId: string, bindings: { telegramId?: string; maxId?: string } = {}) {
  return {
    user: {
      userId,
      role: "client" as const,
      phone: "",
      bindings: { telegramId: bindings.telegramId ?? "", maxId: bindings.maxId ?? "" },
    },
  };
}

describe("POST /api/patient/messenger/request-contact", () => {
  it("returns 401 when there is no session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await POST(new NextRequest("http://localhost/api/patient/messenger/request-contact", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 not_required when gate is not need_activation", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: {
        userId: "user-gate",
        role: "client" as const,
        phone: "+79990001122",
        bindings: { telegramId: "", maxId: "" },
      },
    });
    patientGateMock.mockResolvedValue("allow");
    const res = await POST(new NextRequest("http://localhost/api/patient/messenger/request-contact", { method: "POST" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("not_required");
  });

  it("returns 400 contact_channel_required when both bindings exist without X-Bersoncare-Contact-Channel", async () => {
    getCurrentSessionMock.mockResolvedValue(
      sessionWithId("user-dual", { telegramId: "tg-99", maxId: "max-88" }),
    );
    patientGateMock.mockResolvedValue("need_activation");
    const res = await POST(new NextRequest("http://localhost/api/patient/messenger/request-contact", { method: "POST" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("contact_channel_required");
    expect(requestMessengerMock).not.toHaveBeenCalled();
  });

  it("dispatches telegram when both bindings exist and header is telegram", async () => {
    getCurrentSessionMock.mockResolvedValue(
      sessionWithId("user-tg-header", { telegramId: "tg-99", maxId: "max-88" }),
    );
    patientGateMock.mockResolvedValue("need_activation");
    requestMessengerMock.mockResolvedValue({ ok: true, status: "accepted" });
    const res = await POST(
      new NextRequest("http://localhost/api/patient/messenger/request-contact", {
        method: "POST",
        headers: { "X-Bersoncare-Contact-Channel": "telegram" },
      }),
    );
    expect(res.status).toBe(200);
    expect(requestMessengerMock).toHaveBeenCalledWith({ channel: "telegram", recipientId: "tg-99" });
  });

  it("dispatches max when header asks max and binding exists", async () => {
    getCurrentSessionMock.mockResolvedValue(
      sessionWithId("user-max-hint", { telegramId: "tg-99", maxId: "max-88" }),
    );
    patientGateMock.mockResolvedValue("need_activation");
    requestMessengerMock.mockResolvedValue({ ok: true, status: "accepted" });
    const res = await POST(
      new NextRequest("http://localhost/api/patient/messenger/request-contact", {
        method: "POST",
        headers: { "X-Bersoncare-Contact-Channel": "max" },
      }),
    );
    expect(res.status).toBe(200);
    expect(requestMessengerMock).toHaveBeenCalledWith({ channel: "max", recipientId: "max-88" });
  });

  it("returns 429 rate_limited on rapid repeat for same user after successful integrator call", async () => {
    getCurrentSessionMock.mockResolvedValue(
      sessionWithId("user-rate-limit", { telegramId: "tg-rate", maxId: "" }),
    );
    patientGateMock.mockResolvedValue("need_activation");
    requestMessengerMock.mockResolvedValue({ ok: true, status: "accepted" });
    const r1 = await POST(new NextRequest("http://localhost/api/patient/messenger/request-contact", { method: "POST" }));
    expect(r1.status).toBe(200);
    const r2 = await POST(new NextRequest("http://localhost/api/patient/messenger/request-contact", { method: "POST" }));
    expect(r2.status).toBe(429);
    const body = (await r2.json()) as { error?: string };
    expect(body.error).toBe("rate_limited");
  });

  it("does not apply rate limit timestamp when integrator returns error", async () => {
    getCurrentSessionMock.mockResolvedValue(
      sessionWithId("user-rate-after-fail", { telegramId: "tg-fail", maxId: "" }),
    );
    patientGateMock.mockResolvedValue("need_activation");
    requestMessengerMock
      .mockResolvedValueOnce({ ok: false, reason: "dispatch_failed" })
      .mockResolvedValue({ ok: true, status: "accepted" });
    const r1 = await POST(new NextRequest("http://localhost/api/patient/messenger/request-contact", { method: "POST" }));
    expect(r1.status).toBe(502);
    const r2 = await POST(new NextRequest("http://localhost/api/patient/messenger/request-contact", { method: "POST" }));
    expect(r2.status).toBe(200);
  });

  it("applies rate limit after duplicate integrator response", async () => {
    getCurrentSessionMock.mockResolvedValue(
      sessionWithId("user-rate-dup", { telegramId: "tg-dup", maxId: "" }),
    );
    patientGateMock.mockResolvedValue("need_activation");
    requestMessengerMock.mockResolvedValue({ ok: true, status: "duplicate" });
    const r1 = await POST(new NextRequest("http://localhost/api/patient/messenger/request-contact", { method: "POST" }));
    expect(r1.status).toBe(200);
    const r2 = await POST(new NextRequest("http://localhost/api/patient/messenger/request-contact", { method: "POST" }));
    expect(r2.status).toBe(429);
  });
});
