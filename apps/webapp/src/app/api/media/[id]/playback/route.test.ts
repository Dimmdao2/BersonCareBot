/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getConfigBoolMock = vi.fn();
const getConfigValueMock = vi.fn();
const getRowMock = vi.fn();
const presignMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://x/y" },
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => getSessionMock(),
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: (...a: unknown[]) => getConfigBoolMock(...a),
  getConfigValue: (...a: unknown[]) => getConfigValueMock(...a),
}));

vi.mock("@/app-layer/media/videoPresignTtl", () => ({
  getVideoPresignTtlSeconds: vi.fn(() => Promise.resolve(3600)),
}));

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getMediaRowForPlayback: (...a: unknown[]) => getRowMock(...a),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  presignGetUrl: (...a: unknown[]) => presignMock(...a),
}));

vi.mock("@/app-layer/media/playbackStatsHourly", () => ({
  recordPlaybackResolutionStat: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/app-layer/media/playbackUserVideoFirstResolve", () => ({
  recordPlaybackUserVideoFirstResolve: vi.fn(() => Promise.resolve(false)),
}));

import { GET } from "./route";
import { getVideoPresignTtlSeconds } from "@/app-layer/media/videoPresignTtl";

const mid = "00000000-0000-4000-8000-000000000099";
const patientSession = { user: { userId: "u1", role: "client" as const, displayName: "U", bindings: {} } };
const adminSession = { user: { userId: "a1", role: "admin" as const, displayName: "A", bindings: {} } };

function videoRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: mid,
    mime_type: "video/mp4",
    s3_key: `media/${mid}/v.mp4`,
    video_processing_status: "ready",
    hls_master_playlist_s3_key: `media/${mid}/hls/master.m3u8`,
    poster_s3_key: `media/${mid}/poster/poster.jpg`,
    video_duration_seconds: 60,
    available_qualities_json: [{ label: "720p", height: 720, path: "720p/index.m3u8", bandwidth: 2800000 }],
    video_delivery_override: null,
    ...over,
  };
}

describe("GET /api/media/[id]/playback", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getConfigBoolMock.mockReset();
    getConfigValueMock.mockReset();
    getRowMock.mockReset();
    presignMock.mockReset();
    getSessionMock.mockResolvedValue(patientSession);
    getConfigBoolMock.mockResolvedValue(true);
    getConfigValueMock.mockResolvedValue("mp4");
    presignMock.mockResolvedValue("https://signed.example/master");
    vi.mocked(getVideoPresignTtlSeconds).mockResolvedValue(3600);
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/media/${mid}/playback`), {
      params: Promise.resolve({ id: mid }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 503 when video_playback_api_enabled is false", async () => {
    getConfigBoolMock.mockResolvedValue(false);
    const res = await GET(new Request(`http://localhost/api/media/${mid}/playback`), {
      params: Promise.resolve({ id: mid }),
    });
    expect(res.status).toBe(503);
    const b = (await res.json()) as { error?: string };
    expect(b.error).toBe("feature_disabled");
  });

  it("returns 404 when media row missing", async () => {
    getRowMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/media/${mid}/playback`), {
      params: Promise.resolve({ id: mid }),
    });
    expect(res.status).toBe(404);
  });

  it("non-video → delivery file, no presign", async () => {
    getRowMock.mockResolvedValue({
      ...videoRow(),
      mime_type: "image/png",
    });
    const res = await GET(new Request(`http://localhost/api/media/${mid}/playback`), {
      params: Promise.resolve({ id: mid }),
    });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { delivery?: string; hls?: unknown };
    expect(b.delivery).toBe("file");
    expect(b.hls).toBeNull();
    expect(presignMock).not.toHaveBeenCalled();
  });

  it("video HLS not ready → delivery mp4, hls null", async () => {
    getConfigValueMock.mockResolvedValue("hls");
    getRowMock.mockResolvedValue(
      videoRow({
        video_processing_status: "processing",
        hls_master_playlist_s3_key: null,
      }),
    );
    const res = await GET(new Request(`http://localhost/api/media/${mid}/playback`), {
      params: Promise.resolve({ id: mid }),
    });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { delivery?: string; hls?: unknown; fallbackUsed?: boolean };
    expect(b.delivery).toBe("mp4");
    expect(b.hls).toBeNull();
    expect(b.fallbackUsed).toBe(true);
    expect(presignMock).not.toHaveBeenCalled();
  });

  it("video HLS ready + auto default → presigns master and poster", async () => {
    getConfigValueMock.mockResolvedValue("auto");
    getRowMock.mockResolvedValue(videoRow());
    presignMock
      .mockResolvedValueOnce("https://signed.example/master.m3u8")
      .mockResolvedValueOnce("https://signed.example/poster.jpg");
    const res = await GET(new Request(`http://localhost/api/media/${mid}/playback`), {
      params: Promise.resolve({ id: mid }),
    });
    expect(res.status).toBe(200);
    const b = (await res.json()) as {
      delivery?: string;
      hls?: { masterUrl?: string };
      posterUrl?: string;
    };
    expect(b.delivery).toBe("hls");
    expect(b.hls?.masterUrl).toBe("https://signed.example/master.m3u8");
    expect(b.posterUrl).toBe("https://signed.example/poster.jpg");
    expect(presignMock).toHaveBeenCalledTimes(2);
  });

  it("presign uses TTL from getVideoPresignTtlSeconds", async () => {
    vi.mocked(getVideoPresignTtlSeconds).mockResolvedValue(7200);
    getConfigValueMock.mockResolvedValue("auto");
    getRowMock.mockResolvedValue(videoRow());
    presignMock
      .mockResolvedValueOnce("https://signed.example/master.m3u8")
      .mockResolvedValueOnce("https://signed.example/poster.jpg");
    await GET(new Request(`http://localhost/api/media/${mid}/playback`), {
      params: Promise.resolve({ id: mid }),
    });
    expect(presignMock).toHaveBeenCalledWith(expect.stringContaining("master"), 7200);
    expect(presignMock).toHaveBeenCalledWith(expect.stringContaining("poster"), 7200);
  });

  it("presign poster fails but master ok → hls with null posterUrl", async () => {
    getConfigValueMock.mockResolvedValue("auto");
    getRowMock.mockResolvedValue(videoRow());
    presignMock
      .mockResolvedValueOnce("https://signed.example/master.m3u8")
      .mockRejectedValueOnce(new Error("poster_sign_failed"));
    const res = await GET(new Request(`http://localhost/api/media/${mid}/playback`), {
      params: Promise.resolve({ id: mid }),
    });
    expect(res.status).toBe(200);
    const b = (await res.json()) as {
      delivery?: string;
      hls?: { masterUrl?: string };
      posterUrl?: string | null;
    };
    expect(b.delivery).toBe("hls");
    expect(b.hls?.masterUrl).toBe("https://signed.example/master.m3u8");
    expect(b.posterUrl == null).toBe(true);
    expect(presignMock).toHaveBeenCalledTimes(2);
  });

  it("ignores ?prefer= for non-admin", async () => {
    getConfigValueMock.mockResolvedValue("mp4");
    getRowMock.mockResolvedValue(videoRow());
    const res = await GET(
      new Request(`http://localhost/api/media/${mid}/playback?prefer=hls`),
      { params: Promise.resolve({ id: mid }) },
    );
    expect(res.status).toBe(200);
    const b = (await res.json()) as { delivery?: string };
    expect(b.delivery).toBe("mp4");
    expect(presignMock).not.toHaveBeenCalled();
  });

  it("applies ?prefer=hls for admin when HLS ready", async () => {
    getSessionMock.mockResolvedValue(adminSession);
    getConfigValueMock.mockResolvedValue("mp4");
    getRowMock.mockResolvedValue(videoRow());
    presignMock.mockResolvedValueOnce("https://signed.example/m").mockResolvedValueOnce("https://signed.example/p");
    const res = await GET(
      new Request(`http://localhost/api/media/${mid}/playback?prefer=hls`),
      { params: Promise.resolve({ id: mid }) },
    );
    expect(res.status).toBe(200);
    const b = (await res.json()) as { delivery?: string };
    expect(b.delivery).toBe("hls");
  });

  it("presign failure → mp4 fallback", async () => {
    getConfigValueMock.mockResolvedValue("auto");
    getRowMock.mockResolvedValue(videoRow());
    presignMock.mockRejectedValueOnce(new Error("sign failed"));
    const res = await GET(new Request(`http://localhost/api/media/${mid}/playback`), {
      params: Promise.resolve({ id: mid }),
    });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { delivery?: string; fallbackUsed?: boolean; hls?: unknown };
    expect(b.delivery).toBe("mp4");
    expect(b.fallbackUsed).toBe(true);
    expect(b.hls).toBeNull();
  });
});
