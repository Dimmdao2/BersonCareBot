import { describe, expect, it, vi, beforeEach } from "vitest";
import * as authService from "@/modules/auth/service";
import { POST } from "./route";

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: {
      startPhoneAuth: vi.fn().mockResolvedValue({
        ok: true,
        challengeId: "ch-1",
        retryAfterSeconds: 60,
      }),
    },
  }),
}));

describe("POST /api/patient/diary/purge-otp/start", () => {
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
      reauth: { diaryPurgePinVerifiedUntil: Math.floor(Date.now() / 1000) + 600 },
    });
  });

  it("returns 401 without session", async () => {
    vi.spyOn(authService, "getCurrentSession").mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 200 with challengeId when PIN reauth valid", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; challengeId?: string };
    expect(data.ok).toBe(true);
    expect(data.challengeId).toBe("ch-1");
  });

  it("returns 403 when PIN reauth missing", async () => {
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
    const res = await POST();
    expect(res.status).toBe(403);
  });
});
