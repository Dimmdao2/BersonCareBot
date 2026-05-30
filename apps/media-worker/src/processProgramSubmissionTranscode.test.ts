/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { posix } from "node:path";
import {
  isCanonicalMediaRootForId,
  mediaRootFromSourceS3Key,
} from "./hlsStorageLayout.js";

describe("processProgramSubmissionTranscode layout", () => {
  const mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("derives canonical 480p output key under media root", () => {
    const sourceKey = `media/${mediaId}/source.mp4`;
    const root = mediaRootFromSourceS3Key(sourceKey);
    expect(isCanonicalMediaRootForId(root, mediaId)).toBe(true);
    const outputKey = posix.join(root.replace(/\/+$/, ""), "480p.mp4");
    expect(outputKey).toBe(`media/${mediaId}/480p.mp4`);
  });

  it("rejects non-canonical source layout", () => {
    expect(isCanonicalMediaRootForId("media/other-id", mediaId)).toBe(false);
  });
});
