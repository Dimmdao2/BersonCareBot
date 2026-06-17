/**
 * Q-C9 / OBZ-02: «Обзор» exercise thumbnails regression test.
 *
 * Validates that parseCatalogMediaRows (now used in PatientTabOverview for the
 * «Программа и комментарии» section) correctly surfaces previewSmUrl for video
 * items, which the old getItemThumbnailUrl() helper missed (it only read mediaUrl,
 * which for HLS/MP4 videos is not renderable as <img>).
 */

import { describe, expect, it } from "vitest";
import {
  parseCatalogMediaRows,
} from "@/app/app/patient/treatment/stageItemSnapshot";

describe("Q-C9 obzor exercise thumbnails: parseCatalogMediaRows", () => {
  it("returns empty array for null/undefined input", () => {
    expect(parseCatalogMediaRows(null)).toEqual([]);
    expect(parseCatalogMediaRows(undefined)).toEqual([]);
    expect(parseCatalogMediaRows([])).toEqual([]);
  });

  it("extracts mediaUrl for a plain image item", () => {
    const rows = parseCatalogMediaRows([
      { mediaUrl: "https://cdn.example.com/ex.jpg", mediaType: "image", sortOrder: 0 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mediaUrl).toBe("https://cdn.example.com/ex.jpg");
    expect(rows[0]!.mediaType).toBe("image");
  });

  it("extracts previewSmUrl for a video item (key for thumbnail rendering)", () => {
    const rows = parseCatalogMediaRows([
      {
        mediaUrl: "https://cdn.example.com/ex.m3u8",
        mediaType: "video",
        sortOrder: 0,
        previewSmUrl: "https://cdn.example.com/ex-preview-sm.jpg",
        previewMdUrl: "https://cdn.example.com/ex-preview-md.jpg",
        previewStatus: "ready",
      },
    ]);
    expect(rows).toHaveLength(1);
    const item = rows[0]!;
    expect(item.mediaType).toBe("video");
    expect(item.previewSmUrl).toBe("https://cdn.example.com/ex-preview-sm.jpg");
    expect(item.previewMdUrl).toBe("https://cdn.example.com/ex-preview-md.jpg");
    expect(item.previewStatus).toBe("ready");
    // mediaUrl is preserved too (needed for playback)
    expect(item.mediaUrl).toBe("https://cdn.example.com/ex.m3u8");
  });

  it("primary media selection: video is preferred over image (mirrors PatientTabOverview logic)", () => {
    const media = parseCatalogMediaRows([
      { mediaUrl: "https://cdn.example.com/img.jpg", mediaType: "image", sortOrder: 0 },
      {
        mediaUrl: "https://cdn.example.com/vid.m3u8",
        mediaType: "video",
        sortOrder: 1,
        previewSmUrl: "https://cdn.example.com/vid-sm.jpg",
      },
    ]);
    // Mirrors: allMedia.find((m) => m.mediaType === "video") ?? allMedia[0] ?? null
    const primaryMedia = media.find((m) => m.mediaType === "video") ?? media[0] ?? null;
    expect(primaryMedia).not.toBeNull();
    expect(primaryMedia!.mediaType).toBe("video");
    expect(primaryMedia!.previewSmUrl).toBe("https://cdn.example.com/vid-sm.jpg");
  });

  it("items without previewSmUrl still parse correctly (graceful degradation)", () => {
    const rows = parseCatalogMediaRows([
      { mediaUrl: "https://cdn.example.com/vid-no-preview.mp4", mediaType: "video", sortOrder: 0 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.previewSmUrl).toBeUndefined();
  });

  it("skips entries without a valid mediaUrl", () => {
    const rows = parseCatalogMediaRows([
      { mediaUrl: "", mediaType: "image", sortOrder: 0 },
      { mediaUrl: "https://cdn.example.com/ok.jpg", mediaType: "image", sortOrder: 1 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mediaUrl).toBe("https://cdn.example.com/ok.jpg");
  });
});
