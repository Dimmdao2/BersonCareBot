import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
const mockRecordEventsBatch = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    productAnalytics: {
      recordEventsBatch: mockRecordEventsBatch,
    },
  }),
}));

import { POST } from "./route";

const SESSION = {
  user: { userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "client" as const, phone: "+79990001122" },
};
const SESSION_ID = "11111111-2222-4333-8444-555555555555";

describe("POST /api/patient/analytics/events", () => {
  beforeEach(() => {
    mockRequirePatientApiBusinessAccess.mockReset();
    mockRecordEventsBatch.mockReset();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockRecordEventsBatch.mockResolvedValue(undefined);
  });

  it("returns 401 when business access denied", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(
      new Request("http://localhost/api/patient/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              eventType: "app_open",
              entryChannel: "pwa",
              clientSessionId: SESSION_ID,
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("records app_open with user id", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              eventType: "app_open",
              entryChannel: "telegram",
              clientSessionId: SESSION_ID,
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRecordEventsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: "app_open",
        entryChannel: "telegram",
        userId: SESSION.user.userId,
        clientSessionId: SESSION_ID,
      }),
    ]);
  });

  it("normalizes page_view pathname", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              eventType: "page_view",
              entryChannel: "browser",
              clientSessionId: SESSION_ID,
              pathname: "/app/patient/content/my-article",
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRecordEventsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: "page_view",
        pageKey: "/app/patient/content/page",
      }),
    ]);
  });

  it("drops page_view outside patient app", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              eventType: "page_view",
              entryChannel: "browser",
              clientSessionId: SESSION_ID,
              pathname: "/app/doctor/clients",
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRecordEventsBatch).not.toHaveBeenCalled();
  });
});
