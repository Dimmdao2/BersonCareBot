import { beforeEach, describe, expect, it, vi } from "vitest";

const guardMock = vi.hoisted(() => vi.fn());
const buildDepsMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app-layer/guards/requireRole", () => ({ requireStaffWebPushSelfApiSession: guardMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildDepsMock }));

import { POST } from "./route";

const globalAdmin = {
  user: {
    userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    role: "admin" as const,
    bindings: {},
  },
  adminMode: true,
};

describe("POST /api/doctor/web-push/unsubscribe", () => {
  const removeSubscriptionsForUser = vi.fn();
  const hasAnyForUserId = vi.fn();
  const getChannelCards = vi.fn();
  const updatePreference = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    guardMock.mockResolvedValue({ ok: true, session: globalAdmin });
    removeSubscriptionsForUser.mockResolvedValue(undefined);
    hasAnyForUserId.mockResolvedValue(false);
    getChannelCards.mockResolvedValue([]);
    updatePreference.mockResolvedValue(undefined);
    buildDepsMock.mockReturnValue({
      webPushSubscriptions: { removeSubscriptionsForUser, hasAnyForUserId },
      channelPreferences: { getChannelCards, updatePreference },
    });
  });

  it("removes only the authenticated global admin's subscriptions", async () => {
    const res = await POST(
      new Request("http://test/api/doctor/web-push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      }),
    );

    expect(res.status).toBe(200);
    expect(removeSubscriptionsForUser).toHaveBeenCalledWith(globalAdmin.user.userId);
    expect(hasAnyForUserId).toHaveBeenCalledWith(globalAdmin.user.userId);
    expect(updatePreference).toHaveBeenCalledWith(globalAdmin.user.userId, "web_push", {
      isEnabledForMessages: false,
      isEnabledForNotifications: false,
    });
  });
});
