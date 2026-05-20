import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
const mockBuildAppDeps = vi.hoisted(() => vi.fn());
const mockGetWebPushVapidKeyPair = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: mockBuildAppDeps,
}));

vi.mock("@/modules/system-settings/webPushVapidRuntime", () => ({
  getWebPushVapidKeyPair: mockGetWebPushVapidKeyPair,
}));

import { GET } from "./route";

const PATIENT_SESSION = {
  user: { userId: "platform-user-1", role: "client" as const, phone: "+79990001122" },
};

describe("GET /api/patient/web-push/status", () => {
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
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: PATIENT_SESSION });
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

  it("returns 200 with publicKey when VAPID configured", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: PATIENT_SESSION });
    mockGetWebPushVapidKeyPair.mockResolvedValue({ publicKey: "pub-k", privateKey: "priv-k" });
    const hasAny = vi.fn().mockResolvedValue(true);
    mockBuildAppDeps.mockReturnValue({
      systemSettings: {},
      webPushSubscriptions: { hasAnyForUserId: hasAny },
      channelPreferencesPort: {
        getPreferences: vi.fn().mockResolvedValue([
          { channelCode: "web_push", isEnabledForNotifications: true },
        ]),
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      vapidConfigured: true,
      publicKey: "pub-k",
      hasSubscription: true,
    });
    expect(hasAny).toHaveBeenCalledWith("platform-user-1");
  });

  it("returns 401 when gate denies", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
