/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  isHlsAssetReady,
  parseDefaultDeliveryConfig,
  resolveVideoPlaybackDelivery,
} from "./playbackResolveDelivery";

describe("playbackResolveDelivery", () => {
  const base = {
    systemDefaultDelivery: "auto" as const,
    perFileOverride: null,
    adminPrefer: null,
    videoProcessingStatus: "ready" as const,
    hlsMasterPlaylistS3Key: "media/aaa/hls/master.m3u8",
  };

  it("auto + HLS ready → use HLS", () => {
    const r = resolveVideoPlaybackDelivery({
      ...base,
      systemDefaultDelivery: "auto",
      hlsMasterPlaylistS3Key: "media/x/hls/master.m3u8",
    });
    expect(r.useHls).toBe(true);
    expect(r.fallbackUsed).toBe(false);
    expect(r.hlsReady).toBe(true);
  });

  it("auto + HLS not ready → MP4", () => {
    const r = resolveVideoPlaybackDelivery({
      ...base,
      systemDefaultDelivery: "auto",
      videoProcessingStatus: "processing",
      hlsMasterPlaylistS3Key: null,
    });
    expect(r.useHls).toBe(false);
    expect(r.fallbackUsed).toBe(false);
  });

  it("hls strategy + not ready → fallback MP4", () => {
    const r = resolveVideoPlaybackDelivery({
      ...base,
      systemDefaultDelivery: "hls",
      videoProcessingStatus: "failed",
      hlsMasterPlaylistS3Key: null,
    });
    expect(r.useHls).toBe(false);
    expect(r.fallbackUsed).toBe(true);
  });

  it("mp4 strategy + HLS ready → still MP4", () => {
    const r = resolveVideoPlaybackDelivery({
      ...base,
      systemDefaultDelivery: "mp4",
    });
    expect(r.useHls).toBe(false);
    expect(r.fallbackUsed).toBe(false);
  });

  it("per-file override wins over system default", () => {
    const r = resolveVideoPlaybackDelivery({
      ...base,
      systemDefaultDelivery: "mp4",
      perFileOverride: "hls",
    });
    expect(r.useHls).toBe(true);
    expect(r.strategy).toBe("hls");
  });

  it("admin prefer applies when per-file override absent", () => {
    const r = resolveVideoPlaybackDelivery({
      ...base,
      systemDefaultDelivery: "mp4",
      adminPrefer: "hls",
    });
    expect(r.useHls).toBe(true);
    expect(r.strategy).toBe("hls");
  });

  it("parseDefaultDeliveryConfig", () => {
    expect(parseDefaultDeliveryConfig("auto", "mp4")).toBe("auto");
    expect(parseDefaultDeliveryConfig("  HLS ", "mp4")).toBe("hls");
    expect(parseDefaultDeliveryConfig("bogus", "mp4")).toBe("mp4");
  });

  it("isHlsAssetReady", () => {
    expect(isHlsAssetReady("ready", "media/a/hls/master.m3u8")).toBe(true);
    expect(isHlsAssetReady("ready", null)).toBe(false);
    expect(isHlsAssetReady("processing", "media/a/hls/master.m3u8")).toBe(false);
  });
});
