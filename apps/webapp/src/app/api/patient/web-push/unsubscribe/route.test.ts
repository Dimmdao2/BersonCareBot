import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
const mockBuildAppDeps = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: mockBuildAppDeps,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { POST } from "./route";

const PATIENT_SESSION = {
  user: { userId: "platform-user-1", role: "client" as const, phone: "+79990001122", bindings: {} },
};

describe("POST /api/patient/web-push/unsubscribe", () => {
  const removeByEndpoint = vi.fn();
  const removeAll = vi.fn();
  const hasAny = vi.fn();
  const updatePreference = vi.fn();
  const getChannelCards = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: PATIENT_SESSION });
    hasAny.mockResolvedValue(false);
    getChannelCards.mockResolvedValue([{ code: "web_push", isEnabledForMessages: true }]);
    mockBuildAppDeps.mockReturnValue({
      webPushSubscriptions: {
        removeSubscriptionByEndpoint: removeByEndpoint,
        removeSubscriptionsForUser: removeAll,
        hasAnyForUserId: hasAny,
      },
      channelPreferences: {
        getChannelCards,
        updatePreference,
      },
    });
  });

  it("removes all subscriptions when body.all is true", async () => {
    const req = new Request("http://localhost/api/patient/web-push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(removeAll).toHaveBeenCalledWith("platform-user-1");
    expect(removeByEndpoint).not.toHaveBeenCalled();
    expect(updatePreference).toHaveBeenCalledWith(
      "platform-user-1",
      "web_push",
      expect.objectContaining({ isEnabledForNotifications: false }),
    );
  });

  it("removes by endpoint when endpoint provided", async () => {
    const req = new Request("http://localhost/api/patient/web-push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example/abc1234567" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(removeByEndpoint).toHaveBeenCalledWith(
      "platform-user-1",
      "https://push.example/abc1234567",
    );
    expect(removeAll).not.toHaveBeenCalled();
  });

  it("returns 401 when gate denies", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 401 }),
    });
    const req = new Request("http://localhost/api/patient/web-push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ all: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
