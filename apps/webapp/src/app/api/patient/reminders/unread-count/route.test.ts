import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: mockGetSession,
}));

const mockCanAccessPatient = vi.hoisted(() => vi.fn());
vi.mock("@/modules/roles/service", () => ({
  canAccessPatient: mockCanAccessPatient,
}));

const mockGetUnseenCount = vi.hoisted(() => vi.fn().mockResolvedValue(3));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminderProjection: {
      getUnseenCount: mockGetUnseenCount,
    },
  }),
}));

import { GET } from "./route";

const PATIENT_SESSION = {
  user: { userId: "platform-user-1", role: "patient" as const },
};

describe("GET /api/patient/reminders/unread-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccessPatient.mockReturnValue(true);
  });

  it("returns count for authenticated patient", async () => {
    mockGetSession.mockResolvedValue(PATIENT_SESSION);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, count: 3 });
    expect(mockGetUnseenCount).toHaveBeenCalledWith("platform-user-1");
  });

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "unauthorized" });
    expect(mockGetUnseenCount).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not patient", async () => {
    mockGetSession.mockResolvedValue(PATIENT_SESSION);
    mockCanAccessPatient.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockGetUnseenCount).not.toHaveBeenCalled();
  });

  it("returns count 0 if getUnseenCount throws (graceful)", async () => {
    mockGetSession.mockResolvedValue(PATIENT_SESSION);
    mockGetUnseenCount.mockRejectedValueOnce(new Error("column seen_at does not exist"));
    const res = await GET();
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, count: 0 });
  });
});
