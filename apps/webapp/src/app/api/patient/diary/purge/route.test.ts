import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

import * as authService from "@/modules/auth/service";
import { POST } from "./route";

const purgeMock = vi.fn().mockResolvedValue(undefined);
const confirmPhoneAuthMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: {
      confirmPhoneAuth: (...args: unknown[]) => confirmPhoneAuthMock(...args),
    },
    diaries: {
      purgeAllDiaryDataForUser: (uid: string) => purgeMock(uid),
    },
  }),
}));

describe("POST /api/patient/diary/purge", () => {
  beforeEach(() => {
    purgeMock.mockClear();
    confirmPhoneAuthMock.mockReset();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: true,
      session: {
        user: {
          userId: "u-1",
          role: "client",
          displayName: "Test",
          phone: "+79990001122",
          bindings: {},
        },
        issuedAt: 0,
        expiresAt: 9999999999,
      },
    });
    vi.spyOn(authService, "clearDiaryPurgeReauth").mockResolvedValue(undefined);
    confirmPhoneAuthMock.mockResolvedValue({
      ok: true,
      user: {
        userId: "u-1",
        role: "client" as const,
        displayName: "Test",
        phone: "+79990001122",
        bindings: {},
      },
      redirectTo: "/app/patient",
    });
  });

  it("returns 400 when body invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/diary/purge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("purges when OTP confirms same user", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/diary/purge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "c1", code: "123456" }),
      })
    );
    expect(res.status).toBe(200);
    expect(purgeMock).toHaveBeenCalledWith("u-1");
    expect(authService.clearDiaryPurgeReauth).toHaveBeenCalled();
  });

  it("returns 403 when user id mismatch after OTP", async () => {
    confirmPhoneAuthMock.mockResolvedValue({
      ok: true,
      user: {
        userId: "other",
        role: "client" as const,
        displayName: "X",
        phone: "+79990001122",
        bindings: {},
      },
      redirectTo: "/app/patient",
    });
    const res = await POST(
      new Request("http://localhost/api/patient/diary/purge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "c1", code: "123456" }),
      })
    );
    expect(res.status).toBe(403);
    expect(purgeMock).not.toHaveBeenCalled();
  });
});
