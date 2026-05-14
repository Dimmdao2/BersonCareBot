/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const routeLoggerHoisted = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: {
    warn: routeLoggerHoisted.loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const getSessionMock = vi.fn();
const getConfigBoolMock = vi.fn();
const handleMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => getSessionMock(),
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: (...a: unknown[]) => getConfigBoolMock(...a),
}));

vi.mock("@/app-layer/media/hlsDeliveryProxy", () => ({
  handleHlsDeliveryProxyRequest: (...a: unknown[]) => handleMock(...a),
}));

import { GET } from "./route";

const mid = "00000000-0000-4000-8000-000000000099";
const patientSession = { user: { userId: "u1", role: "client" as const, displayName: "U", bindings: {} } };

describe("GET /api/media/[id]/hls/[[...path]]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getConfigBoolMock.mockReset();
    handleMock.mockReset();
    routeLoggerHoisted.loggerWarn.mockReset();
    getSessionMock.mockResolvedValue(patientSession);
    getConfigBoolMock.mockResolvedValue(true);
    handleMock.mockResolvedValue(new Response("ok", { status: 200 }));
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/media/${mid}/hls/master.m3u8`), {
      params: Promise.resolve({ id: mid, path: ["master.m3u8"] }),
    });
    expect(res.status).toBe(401);
    expect(handleMock).not.toHaveBeenCalled();
    expect(routeLoggerHoisted.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: mid,
        reasonCode: "session_unauthorized",
        httpStatus: 401,
      }),
      "hls_proxy_error",
    );
  });

  it("returns 503 when video_playback_api_enabled is false", async () => {
    getConfigBoolMock.mockResolvedValue(false);
    const res = await GET(new Request(`http://localhost/api/media/${mid}/hls/master.m3u8`), {
      params: Promise.resolve({ id: mid, path: ["master.m3u8"] }),
    });
    expect(res.status).toBe(503);
    expect(handleMock).not.toHaveBeenCalled();
  });

  it("returns 404 on invalid UUID", async () => {
    const res = await GET(new Request(`http://localhost/api/media/not-a-uuid/hls/x`), {
      params: Promise.resolve({ id: "not-a-uuid", path: ["x"] }),
    });
    expect(res.status).toBe(404);
    expect(handleMock).not.toHaveBeenCalled();
  });

  it("delegates to handleHlsDeliveryProxyRequest with Range header", async () => {
    await GET(
      new Request(`http://localhost/api/media/${mid}/hls/720p/seg.ts`, {
        headers: { Range: "bytes=0-1" },
      }),
      { params: Promise.resolve({ id: mid, path: ["720p", "seg.ts"] }) },
    );
    expect(handleMock).toHaveBeenCalledWith({
      mediaId: mid,
      pathSegments: ["720p", "seg.ts"],
      rangeHeader: "bytes=0-1",
      userId: "u1",
    });
  });
});
