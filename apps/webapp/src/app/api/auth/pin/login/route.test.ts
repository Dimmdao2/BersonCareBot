import { describe, expect, it, vi } from "vitest";
import * as authService from "@/modules/auth/service";
import { hashPin } from "@/modules/auth/pinHash";
import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";
import { inMemoryUserPinsPort } from "@/infra/repos/inMemoryUserPins";
import { POST } from "./route";

describe("POST /api/auth/pin/login", () => {
  it("returns 400 when body invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/pin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 invalid_credentials for unknown phone", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/pin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79990000001", pin: "1234" }),
      })
    );
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("invalid_credentials");
  });

  it("returns 400 when PIN format invalid (zod)", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/pin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79998887766", pin: "123" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when PIN has 6 digits (only 4 allowed)", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/pin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79998887766", pin: "123456" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 for wrong PIN", async () => {
    const phone = "+79998887766";
    await inMemoryUserByPhonePort.createOrBind(phone, {
      channel: "web",
      chatId: "web-pin-login-1",
      displayName: "P",
    });
    const u = await inMemoryUserByPhonePort.findByPhone(phone);
    const h = await hashPin("1111");
    await inMemoryUserPinsPort.upsertPinHash(u!.userId, h);

    const res = await POST(
      new Request("http://localhost/api/auth/pin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, pin: "2222" }),
      })
    );
    expect(res.status).toBe(401);
    const bad = (await res.json()) as { error?: string; attemptsLeft?: number };
    expect(bad.error).toBe("invalid_credentials");
    expect(bad.attemptsLeft).toBeDefined();
  });

  it("returns 200 and sets session when PIN correct", async () => {
    const spy = vi.spyOn(authService, "setSessionFromUser").mockResolvedValue(undefined);
    const phone = "+79995554433";
    await inMemoryUserByPhonePort.createOrBind(phone, {
      channel: "web",
      chatId: "web-pin-login-2",
      displayName: "Q",
    });
    const u = await inMemoryUserByPhonePort.findByPhone(phone);
    const h = await hashPin("5656");
    await inMemoryUserPinsPort.upsertPinHash(u!.userId, h);

    const res = await POST(
      new Request("http://localhost/api/auth/pin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, pin: "5656" }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; redirectTo: string };
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toMatch(/^\/app\//);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
