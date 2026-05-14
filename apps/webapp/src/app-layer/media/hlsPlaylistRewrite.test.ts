import { describe, expect, it } from "vitest";
import { rewriteAbsoluteUriToProxy, rewriteM3u8AbsoluteUrls } from "@/app-layer/media/hlsPlaylistRewrite";

const mid = "11111111-1111-4111-8111-111111111111";

describe("rewriteM3u8AbsoluteUrls", () => {
  it("rewrites path-style absolute URLs on trusted endpoint+bucket prefix", () => {
    const prefixes = ["http://127.0.0.1:9000/private/"];
    const body = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000
http://127.0.0.1:9000/private/media/${mid}/hls/720p/index.m3u8
`;
    const out = rewriteM3u8AbsoluteUrls(body, mid, prefixes);
    expect(out).toContain(`/api/media/${mid}/hls/720p/index.m3u8`);
    expect(out).toContain("#EXTM3U");
  });

  it("preserves comments and relative lines", () => {
    const body = `#EXTM3U
# foo
720p/index.m3u8
`;
    expect(rewriteM3u8AbsoluteUrls(body, mid, ["http://x/y/"])).toBe(body);
  });

  it("rewrites EXT-X-MAP quoted URI", () => {
    const url = `http://127.0.0.1:9000/b/media/${mid}/hls/init.mp4`;
    const body = `#EXTM3U
#EXT-X-MAP:URI="${url}"
`;
    const out = rewriteM3u8AbsoluteUrls(body, mid, ["http://127.0.0.1:9000/b/"]);
    expect(out).toContain(`URI="/api/media/${mid}/hls/init.mp4"`);
  });

  it("does not rewrite unrelated hosts", () => {
    const body = `https://evil.example/a.ts\n`;
    expect(rewriteM3u8AbsoluteUrls(body, mid, ["http://127.0.0.1:9000/b/"])).toBe(body);
  });

  it("rewrites EXT-X-KEY unquoted absolute URI", () => {
    const url = `http://127.0.0.1:9000/b/media/${mid}/hls/key.key`;
    const body = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI=${url}
`;
    const out = rewriteM3u8AbsoluteUrls(body, mid, ["http://127.0.0.1:9000/b/"]);
    expect(out).toContain(`URI="/api/media/${mid}/hls/key.key"`);
  });
});

describe("rewriteAbsoluteUriToProxy", () => {
  it("matches virtual-hosted bucket endpoint prefix", () => {
    const u = rewriteAbsoluteUriToProxy(`http://bucket.fs.test/media/${mid}/hls/x/y.ts`, mid, [
      "http://bucket.fs.test/",
    ]);
    expect(u).toBe(`/api/media/${mid}/hls/x/y.ts`);
  });
});
