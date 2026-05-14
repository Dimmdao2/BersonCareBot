import { describe, expect, it } from "vitest";
import {
  hlsArtifactObjectKey,
  hlsArtifactSupportsHttpRange,
  inferHlsArtifactKind,
  normalizeHlsUrlPathSegments,
} from "@/app-layer/media/hlsProxyPath";

const mid = "22222222-2222-4222-8222-222222222222";

describe("normalizeHlsUrlPathSegments", () => {
  it("rejects traversal", () => {
    expect(normalizeHlsUrlPathSegments(["..", "x"]).ok).toBe(false);
    expect(normalizeHlsUrlPathSegments(["a%2Fb"]).ok).toBe(false);
  });

  it("accepts decoded segments", () => {
    const r = normalizeHlsUrlPathSegments(["720p", "seg_001.ts"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.segments).toEqual(["720p", "seg_001.ts"]);
  });
});

describe("hlsArtifactObjectKey", () => {
  it("joins under media root", () => {
    expect(hlsArtifactObjectKey(mid, ["720p", "index.m3u8"])).toBe(`media/${mid}/hls/720p/index.m3u8`);
  });
});

describe("inferHlsArtifactKind", () => {
  it("classifies master", () => {
    expect(inferHlsArtifactKind(["master.m3u8"])).toBe("master");
  });
  it("classifies variant", () => {
    expect(inferHlsArtifactKind(["720p", "index.m3u8"])).toBe("variant");
  });
  it("classifies segment", () => {
    expect(inferHlsArtifactKind(["720p", "a.ts"])).toBe("segment");
  });
});

describe("hlsArtifactSupportsHttpRange", () => {
  it("true for ts", () => {
    expect(hlsArtifactSupportsHttpRange(["720p", "a.ts"])).toBe(true);
  });
  it("false for playlists", () => {
    expect(hlsArtifactSupportsHttpRange(["720p", "index.m3u8"])).toBe(false);
  });
});
