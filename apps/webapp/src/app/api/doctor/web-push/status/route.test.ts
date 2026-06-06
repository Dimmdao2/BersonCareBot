import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireDoctorApiSession = vi.hoisted(() => vi.fn());
const mockBuildAppDeps = vi.hoisted(() => vi.fn());
const mockGetWebPushVapidKeyPair = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorApiSession: mockRequireDoctorApiSession,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: mockBuildAppDeps,
}));

vi.mock("@/modules/system-settings/webPushVapidRuntime", () => ({
  getWebPushVapidKeyPair: mockGetWebPushVapidKeyPair,
}));

import { GET } from "./route";

const DOCTOR_SESSION = {
  user: { userId: "doctor-1", role: "doctor" as const, bindings: {} },
};

describe("GET /api/doctor/web-push/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAppDeps.mockReturnValue({
      systemSettings: {},
      webPushSubscriptions: {
        hasAnyForUserId: vi.fn().mockResolvedValue(false),
      },
      channelPreferencesPort: {
        getPreferences: vi.fn().mockResolvedValue([]),
      },
    });
    mockGetWebPushVapidKeyPair.mockResolvedValue(null);
  });

  it("returns 200 with vapidConfigured false when keys missing", async () => {
    mockRequireDoctorApiSession.mockResolvedValue({ ok: true, session: DOCTOR_SESSION });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      vapidConfigured: false,
      publicKey: null,
      hasSubscription: false,
      globalWebPushEnabled: true,
    });
  });

  it("returns 401 when gate denies", async () => {
    mockRequireDoctorApiSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
