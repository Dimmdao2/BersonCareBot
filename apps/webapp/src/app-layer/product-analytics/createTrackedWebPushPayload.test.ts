import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreatePushNotification = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    productAnalytics: {
      createPushNotification: mockCreatePushNotification,
    },
  }),
}));

import {
  createTrackedWebPushPayload,
  productAnalyticsMetadataFromPayload,
} from "./createTrackedWebPushPayload";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("createTrackedWebPushPayload", () => {
  beforeEach(() => {
    mockCreatePushNotification.mockReset();
    mockCreatePushNotification.mockResolvedValue(undefined);
  });

  it("skips tracking for non-platform user id", async () => {
    const payload = await createTrackedWebPushPayload({
      userId: "tg:123",
      title: "T",
      body: "B",
      url: "/app/patient",
    });
    expect(payload.trackingId).toBeUndefined();
    expect(mockCreatePushNotification).not.toHaveBeenCalled();
  });

  it("returns trackingId and registers push fact", async () => {
    const payload = await createTrackedWebPushPayload({
      userId: USER_ID,
      title: "Разминка",
      body: "Пора подвигаться",
      url: "/app/patient/home",
      topicCode: "exercise_reminders",
      pushKind: "warmup",
      warmupSloganKey: "move_now",
      occurrenceId: "not-a-uuid",
    });
    expect(payload.trackingId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(mockCreatePushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        occurrenceId: null,
        warmupSloganText: "Пора подвигаться",
      }),
    );
  });

  it("builds delivery metadata from payload", () => {
    expect(
      productAnalyticsMetadataFromPayload({
        title: "t",
        body: "b",
        url: "/app",
        trackingId: "11111111-2222-4333-8444-555555555555",
        pushKind: "warmup",
        warmupSloganKey: "move_now",
      }),
    ).toEqual({
      trackingId: "11111111-2222-4333-8444-555555555555",
      pushKind: "warmup",
      warmupSloganKey: "move_now",
    });
  });
});
