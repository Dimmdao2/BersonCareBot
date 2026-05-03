/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  hlsTreePrefixFromMediaRoot,
  isCanonicalMediaRootForId,
  isTrustedHlsArtifactS3Key,
  isTrustedPosterS3Key,
  masterPlaylistKeyFromMediaRoot,
  mediaRootFromSourceS3Key,
  posterObjectKeyFromMediaRoot,
  resolveHlsPurgeListPrefix,
} from "./hlsStorageLayout";

describe("hlsStorageLayout", () => {
  const mid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const source = `media/${mid}/file.mp4`;

  it("mediaRootFromSourceS3Key", () => {
    expect(mediaRootFromSourceS3Key(source)).toBe(`media/${mid}`);
  });

  it("canonical paths", () => {
    const root = `media/${mid}`;
    expect(isCanonicalMediaRootForId(root, mid)).toBe(true);
    expect(hlsTreePrefixFromMediaRoot(root)).toBe(`media/${mid}/hls`);
    expect(masterPlaylistKeyFromMediaRoot(root)).toBe(`media/${mid}/hls/master.m3u8`);
    expect(posterObjectKeyFromMediaRoot(root)).toBe(`media/${mid}/poster/poster.jpg`);
  });

  it("resolveHlsPurgeListPrefix uses canonical when DB null", () => {
    expect(
      resolveHlsPurgeListPrefix({ mediaId: mid, sourceS3Key: source, hlsArtifactPrefix: null }),
    ).toBe(`media/${mid}/hls`);
  });

  it("resolveHlsPurgeListPrefix accepts trusted DB prefix under canonical", () => {
    expect(
      resolveHlsPurgeListPrefix({
        mediaId: mid,
        sourceS3Key: source,
        hlsArtifactPrefix: `media/${mid}/hls`,
      }),
    ).toBe(`media/${mid}/hls`);
  });

  it("isTrustedHlsArtifactS3Key / isTrustedPosterS3Key", () => {
    expect(isTrustedHlsArtifactS3Key(mid, `media/${mid}/hls/master.m3u8`)).toBe(true);
    expect(isTrustedHlsArtifactS3Key(mid, `media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/hls/master.m3u8`)).toBe(
      false,
    );
    expect(isTrustedPosterS3Key(mid, `media/${mid}/poster/poster.jpg`)).toBe(true);
    expect(isTrustedPosterS3Key(mid, `media/${mid}/video.mp4`)).toBe(false);
  });
});
