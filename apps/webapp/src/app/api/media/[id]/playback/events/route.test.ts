/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const recordPlaybackClientEventMock = vi.fn();
const getMediaAccessRowMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => getSessionMock(),
}));

vi.mock("@/app-layer/media/playbackClientEvents", () => ({
  recordPlaybackClientEvent: (...args: unknown[]) => recordPlaybackClientEventMock(...args),
}));

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getMediaAccessRow: (...args: unknown[]) => getMediaAccessRowMock(...args),
}));

import { POST } from "./route";

const mid = "00000000-0000-4000-8000-000000000099";
const patientSession = { user: { userId: "u1", role: "client" as const, displayName: "U", bindings: {} } };

describe("POST /api/media/[id]/playback/events", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    recordPlaybackClientEventMock.mockReset();
    getMediaAccessRowMock.mockReset();
    getSessionMock.mockResolvedValue(patientSession);
    recordPlaybackClientEventMock.mockResolvedValue(undefined);
    getMediaAccessRowMock.mockResolvedValue({
      usage_purpose: "lfk_exercise",
      uploaded_by: "u1",
      mime_type: "video/mp4",
    });
  });

  it("returns 401 for anonymous", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request(`http://localhost/api/media/${mid}/playback/events`, {
        method: "POST",
        body: JSON.stringify({ eventClass: "hls_fatal" }),
      }),
      { params: Promise.resolve({ id: mid }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for unknown event class", async () => {
    const res = await POST(
      new Request(`http://localhost/api/media/${mid}/playback/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventClass: "unknown" }),
      }),
      { params: Promise.resolve({ id: mid }) },
    );
    expect(res.status).toBe(400);
    expect(recordPlaybackClientEventMock).not.toHaveBeenCalled();
  });

  it("writes client playback event", async () => {
    const res = await POST(
      new Request(`http://localhost/api/media/${mid}/playback/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Vitest UA" },
        body: JSON.stringify({
          eventClass: "hls_fatal",
          delivery: "hls",
          errorDetail: "network_error",
        }),
      }),
      { params: Promise.resolve({ id: mid }) },
    );
    expect(res.status).toBe(200);
    expect(recordPlaybackClientEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: mid,
        userId: "u1",
        eventClass: "hls_fatal",
        delivery: "hls",
        errorDetail: "network_error",
      }),
    );
  });

  it("skips telemetry for program_item_submission media", async () => {
    getMediaAccessRowMock.mockResolvedValue({
      usage_purpose: "program_item_submission",
      uploaded_by: "u1",
      mime_type: "video/mp4",
    });
    const res = await POST(
      new Request(`http://localhost/api/media/${mid}/playback/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventClass: "video_error", delivery: "mp4" }),
      }),
      { params: Promise.resolve({ id: mid }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(recordPlaybackClientEventMock).not.toHaveBeenCalled();
  });
});
