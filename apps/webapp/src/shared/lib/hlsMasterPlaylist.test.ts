/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildVodMasterPlaylistBody, parseMasterPlaylistVariantRelativeUris } from "./hlsMasterPlaylist";

describe("hlsMasterPlaylist", () => {
  it("build + parse smoke — two variants", () => {
    const body = buildVodMasterPlaylistBody([
      { uri: "720p/index.m3u8", bandwidth: 2_800_000, width: 1280, height: 720 },
      { uri: "480p/index.m3u8", bandwidth: 900_000, width: 854, height: 480 },
    ]);
    expect(body).toContain("#EXTM3U");
    expect(body).toContain("720p/index.m3u8");
    expect(body).toContain("480p/index.m3u8");
    expect(parseMasterPlaylistVariantRelativeUris(body)).toEqual([
      "720p/index.m3u8",
      "480p/index.m3u8",
    ]);
  });
});
