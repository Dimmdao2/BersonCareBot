/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "postgres://x/y",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_PRIVATE_BUCKET: "private",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY: "k",
    S3_SECRET_KEY: "s",
    S3_FORCE_PATH_STYLE: true,
  },
}));

const hoisted = vi.hoisted(() => ({
  recordMock: vi.fn(() => Promise.resolve()),
  getRowMock: vi.fn(),
  s3BufMock: vi.fn(),
  s3StreamMock: vi.fn(),
}));

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getMediaRowForPlayback: (...a: unknown[]) => hoisted.getRowMock(...a),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  s3GetPrivateObjectBuffer: (...a: unknown[]) => hoisted.s3BufMock(...a),
  s3GetObjectStream: (...a: unknown[]) => hoisted.s3StreamMock(...a),
}));

vi.mock("@/app-layer/media/hlsProxyErrorEvents", async () => {
  const actual = await vi.importActual<typeof import("@/app-layer/media/hlsProxyErrorEvents")>(
    "@/app-layer/media/hlsProxyErrorEvents",
  );
  return {
    ...actual,
    recordMediaHlsProxyErrorEventIfNeeded: hoisted.recordMock,
  };
});

vi.mock("@/app-layer/logging/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { handleHlsDeliveryProxyRequest } from "@/app-layer/media/hlsDeliveryProxy";
import * as rewriteMod from "@/app-layer/media/hlsPlaylistRewrite";

const mid = "00000000-0000-4000-8000-000000000099";
const uid = "11111111-1111-4111-8111-111111111111";

function tinyStream(chunk: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("handleHlsDeliveryProxyRequest", () => {
  beforeEach(() => {
    hoisted.getRowMock.mockReset();
    hoisted.s3BufMock.mockReset();
    hoisted.s3StreamMock.mockReset();
    hoisted.recordMock.mockReset();
    hoisted.recordMock.mockResolvedValue(undefined);
    hoisted.getRowMock.mockResolvedValue({ id: mid });
    hoisted.s3BufMock.mockResolvedValue({ ok: true, buf: Buffer.from("#EXTM3U\n720p/index.m3u8\n") });
    hoisted.s3StreamMock.mockResolvedValue({
      ok: true,
      httpStatus: 200,
      stream: tinyStream(new Uint8Array([97, 98])),
      contentType: "video/mp2t",
      contentLength: 2,
    });
  });

  it("returns 404 forbidden_path when path missing", async () => {
    const res = await handleHlsDeliveryProxyRequest({
      mediaId: mid,
      pathSegments: undefined,
      rangeHeader: null,
      userId: uid,
    });
    expect(res.status).toBe(404);
    expect((await res.json()) as { error?: string }).toMatchObject({ error: "not found" });
  });

  it("returns 404 forbidden_path on traversal-like segment", async () => {
    const res = await handleHlsDeliveryProxyRequest({
      mediaId: mid,
      pathSegments: ["..", "master.m3u8"],
      rangeHeader: null,
      userId: uid,
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 media_not_readable when row missing", async () => {
    hoisted.getRowMock.mockResolvedValue(null);
    const res = await handleHlsDeliveryProxyRequest({
      mediaId: mid,
      pathSegments: ["master.m3u8"],
      rangeHeader: null,
      userId: uid,
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 playlist body from S3 buffer", async () => {
    const res = await handleHlsDeliveryProxyRequest({
      mediaId: mid,
      pathSegments: ["master.m3u8"],
      rangeHeader: null,
      userId: uid,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("#EXTM3U");
    expect(res.headers.get("Content-Type")).toContain("mpegurl");
  });

  it("returns 416 on invalid Range for playlist", async () => {
    const res = await handleHlsDeliveryProxyRequest({
      mediaId: mid,
      pathSegments: ["master.m3u8"],
      rangeHeader: "bytes=abc",
      userId: uid,
    });
    expect(res.status).toBe(416);
  });

  it("streams segment with 206 when Range requested", async () => {
    hoisted.s3StreamMock.mockResolvedValue({
      ok: true,
      httpStatus: 206,
      stream: tinyStream(new Uint8Array([120])),
      contentType: "video/mp2t",
      contentLength: 1,
      contentRange: "bytes 0-0/10",
    });
    const res = await handleHlsDeliveryProxyRequest({
      mediaId: mid,
      pathSegments: ["720p", "seg.ts"],
      rangeHeader: "bytes=0-0",
      userId: uid,
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-0/10");
    expect(hoisted.s3StreamMock).toHaveBeenCalledWith(expect.objectContaining({ range: "bytes=0-0" }));
  });

  it("maps missing_object from segment stream failure", async () => {
    hoisted.s3StreamMock.mockResolvedValue({ ok: false, reason: "missing_object" });
    const res = await handleHlsDeliveryProxyRequest({
      mediaId: mid,
      pathSegments: ["720p", "seg.ts"],
      rangeHeader: null,
      userId: uid,
    });
    expect(res.status).toBe(404);
  });

  it("returns playlist_rewrite_failed when rewrite throws", async () => {
    const spy = vi.spyOn(rewriteMod, "rewriteM3u8AbsoluteUrls").mockImplementationOnce(() => {
      throw new Error("rewrite boom");
    });
    try {
      const res = await handleHlsDeliveryProxyRequest({
        mediaId: mid,
        pathSegments: ["master.m3u8"],
        rangeHeader: null,
        userId: uid,
      });
      expect(res.status).toBe(502);
      expect((await res.json()) as { error?: string }).toMatchObject({ error: "bad_gateway" });
      expect(hoisted.recordMock).toHaveBeenCalledWith(
        expect.objectContaining({ reasonCode: "playlist_rewrite_failed", mediaId: mid }),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("returns internal_error when getMediaRowForPlayback throws", async () => {
    hoisted.getRowMock.mockRejectedValueOnce(new Error("db down"));
    const res = await handleHlsDeliveryProxyRequest({
      mediaId: mid,
      pathSegments: ["master.m3u8"],
      rangeHeader: null,
      userId: uid,
    });
    expect(res.status).toBe(502);
    expect(hoisted.recordMock).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "internal_error", mediaId: mid }),
    );
  });
});
