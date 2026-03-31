import { describe, expect, it, vi, beforeEach } from "vitest";
import * as authService from "@/modules/auth/service";
import * as pinAuth from "@/modules/auth/pinAuth";
import { POST } from "./route";

describe("POST /api/auth/pin/verify", () => {
  beforeEach(() => {
    vi.spyOn(authService, "getCurrentSession").mockResolvedValue({
      user: {
        userId: "u-1",
        role: "client",
        displayName: "Test",
        phone: "+79990001122",
        bindings: {},
      },
      issuedAt: 0,
      expiresAt: 9999999999,
    });
    vi.spyOn(authService, "setDiaryPurgePinReauth").mockResolvedValue(undefined);
    vi.spyOn(pinAuth, "verifyPinForLogin").mockResolvedValue({ ok: true });
  });

  it("returns 400 when body invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/pin/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 and sets reauth when PIN ok", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/pin/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: "1234" }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(authService.setDiaryPurgePinReauth).toHaveBeenCalled();
  });
});
