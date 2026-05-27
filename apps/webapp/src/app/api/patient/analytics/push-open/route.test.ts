import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetCurrentSession = vi.hoisted(() => vi.fn());
const mockRecordPushOpen = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: mockGetCurrentSession,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    productAnalytics: {
      recordPushOpen: mockRecordPushOpen,
    },
  }),
}));

import { POST } from "./route";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TRACKING_ID = "11111111-2222-4333-8444-555555555555";

describe("POST /api/patient/analytics/push-open", () => {
  beforeEach(() => {
    mockGetCurrentSession.mockReset();
    mockRecordPushOpen.mockReset();
    mockGetCurrentSession.mockResolvedValue(null);
    mockRecordPushOpen.mockResolvedValue({ deduped: false });
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/analytics/push-open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushTrackingId: "not-uuid" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("records open without session user id", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/analytics/push-open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushTrackingId: TRACKING_ID, entryChannel: "pwa" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRecordPushOpen).toHaveBeenCalledWith({
      pushTrackingId: TRACKING_ID,
      userId: null,
      entryChannel: "pwa",
    });
  });

  it("passes session user id when present", async () => {
    mockGetCurrentSession.mockResolvedValue({
      user: { userId: USER_ID, role: "client" },
    });
    const res = await POST(
      new Request("http://localhost/api/patient/analytics/push-open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushTrackingId: TRACKING_ID }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRecordPushOpen).toHaveBeenCalledWith({
      pushTrackingId: TRACKING_ID,
      userId: USER_ID,
      entryChannel: "pwa",
    });
  });

  it("returns deduped flag from service", async () => {
    mockRecordPushOpen.mockResolvedValue({ deduped: true });
    const res = await POST(
      new Request("http://localhost/api/patient/analytics/push-open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushTrackingId: TRACKING_ID }),
      }),
    );
    const body = (await res.json()) as { deduped: boolean };
    expect(body.deduped).toBe(true);
  });
});
