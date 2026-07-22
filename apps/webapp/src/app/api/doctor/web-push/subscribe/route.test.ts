import { beforeEach, describe, expect, it, vi } from "vitest";

const guardMock = vi.hoisted(() => vi.fn());
const buildDepsMock = vi.hoisted(() => vi.fn());
const enableDefaultsMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app-layer/guards/requireRole", () => ({ requireStaffWebPushSelfApiSession: guardMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildDepsMock }));
vi.mock("@/modules/doctor-notifications/enableStaffWebPushNotificationDefaults", () => ({
  enableStaffWebPushNotificationDefaults: enableDefaultsMock,
}));
vi.mock("@/infra/logging/logger", () => ({ logger: { info: vi.fn() } }));

import { POST } from "./route";

const globalAdmin = {
  user: {
    userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    role: "admin" as const,
    bindings: {},
  },
  adminMode: true,
};

describe("POST /api/doctor/web-push/subscribe", () => {
  const saveSubscription = vi.fn();
  const getChannelCards = vi.fn();
  const updatePreference = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    guardMock.mockResolvedValue({ ok: true, session: globalAdmin });
    saveSubscription.mockResolvedValue(undefined);
    getChannelCards.mockResolvedValue([]);
    updatePreference.mockResolvedValue(undefined);
    enableDefaultsMock.mockResolvedValue([]);
    buildDepsMock.mockReturnValue({
      webPushSubscriptions: { saveSubscription },
      channelPreferences: { getChannelCards, updatePreference },
      topicChannelPrefs: {},
    });
  });

  it("writes a global admin subscription only for the authenticated platform user", async () => {
    const res = await POST(
      new Request("http://test/api/doctor/web-push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: "https://push.example.test/subscription",
          keys: { p256dh: "public-key", auth: "auth-key" },
          platform: "pwa",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(saveSubscription).toHaveBeenCalledWith(
      globalAdmin.user.userId,
      expect.objectContaining({ endpoint: "https://push.example.test/subscription" }),
      expect.anything(),
    );
    expect(updatePreference).toHaveBeenCalledWith(globalAdmin.user.userId, "web_push", {
      isEnabledForMessages: false,
      isEnabledForNotifications: true,
    });
    expect(enableDefaultsMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: globalAdmin.user.userId }),
    );
  });
});
