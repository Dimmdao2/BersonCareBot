import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.fn();
const clearStaffAccountEmailMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userProjection: {
      clearStaffAccountEmail: clearStaffAccountEmailMock,
    },
  }),
}));

import { DELETE } from "./route";

describe("DELETE /api/doctor/account/email", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    clearStaffAccountEmailMock.mockReset();
  });

  it("returns 401 when session is missing", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({ user: { userId: "c1", role: "client" } });
    const res = await DELETE();
    expect(res.status).toBe(403);
  });

  it("clears email for doctor", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({ user: { userId: "d1", role: "doctor" } });
    clearStaffAccountEmailMock.mockResolvedValueOnce({ ok: true });

    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(clearStaffAccountEmailMock).toHaveBeenCalledWith("d1");
  });

  it("returns 400 when email already empty", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({ user: { userId: "a1", role: "admin" } });
    clearStaffAccountEmailMock.mockResolvedValueOnce({ ok: false, reason: "already_empty" });

    const res = await DELETE();
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("already_empty");
  });
});
