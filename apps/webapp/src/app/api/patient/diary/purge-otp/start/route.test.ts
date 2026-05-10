import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "./route";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

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

const validSession = {
  user: {
    userId: "u-1",
    role: "client" as const,
    displayName: "Test",
    phone: "+79990001122",
    bindings: {},
  },
  issuedAt: 0,
  expiresAt: 9999999999,
};

describe("POST /api/patient/diary/purge-otp/start", () => {
  beforeEach(() => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: validSession });
  });

  it("returns 401 without session", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 200 with challengeId for valid session", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; challengeId?: string };
    expect(data.ok).toBe(true);
    expect(data.challengeId).toBe("ch-1");
  });
});
