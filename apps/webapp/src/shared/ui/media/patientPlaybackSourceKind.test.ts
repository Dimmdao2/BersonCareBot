import { describe, expect, it } from "vitest";
import { initialPlaybackSourceKind } from "@/shared/ui/media/patientPlaybackSourceKind";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";

const base = (): MediaPlaybackPayload => ({
  mediaId: "00000000-0000-4000-8000-000000000001",
  delivery: "mp4",
  mimeType: "video/mp4",
  durationSeconds: 10,
  posterUrl: null,
  hls: null,
  mp4: { url: "/api/media/00000000-0000-4000-8000-000000000001" },
  fallbackUsed: false,
  expiresInSeconds: 3600,
});

describe("initialPlaybackSourceKind", () => {
  it("mp4 when delivery is mp4", () => {
    expect(initialPlaybackSourceKind(base())).toBe("mp4");
  });

  it("mp4 when delivery hls but master missing", () => {
    const p = base();
    p.delivery = "hls";
    p.hls = null;
    expect(initialPlaybackSourceKind(p)).toBe("mp4");
  });

  it("hls when delivery hls and masterUrl present", () => {
    const p = base();
    p.delivery = "hls";
    p.hls = { masterUrl: "https://example.invalid/master.m3u8" };
    expect(initialPlaybackSourceKind(p)).toBe("hls");
  });

  it("mp4 for delivery file", () => {
    const p = base();
    p.delivery = "file";
    expect(initialPlaybackSourceKind(p)).toBe("mp4");
  });
});
