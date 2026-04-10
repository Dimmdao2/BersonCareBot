import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
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
  user: { userId: "platform-user-1", role: "client" as const, phone: "+79990001122" },
};

describe("GET /api/patient/reminders/unread-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns count for authenticated patient with phone", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: PATIENT_SESSION });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, count: 3 });
    expect(mockGetUnseenCount).toHaveBeenCalledWith("platform-user-1");
  });

  it("returns 401 when no session", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "unauthorized" });
    expect(mockGetUnseenCount).not.toHaveBeenCalled();
  });

  it("returns 403 when patient has no phone", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "phone_required" }, { status: 403 }),
    });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockGetUnseenCount).not.toHaveBeenCalled();
  });

  it("returns count 0 if getUnseenCount throws (graceful)", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: PATIENT_SESSION });
    mockGetUnseenCount.mockRejectedValueOnce(new Error("column seen_at does not exist"));
    const res = await GET();
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, count: 0 });
  });
});
