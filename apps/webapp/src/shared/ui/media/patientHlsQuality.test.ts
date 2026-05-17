import { describe, expect, it } from "vitest";
import type { MediaAvailableQuality } from "@/modules/media/types";
import {
  PATIENT_HLS_QUALITY_AUTO_VALUE,
  displayLabelForSwitchedLevel,
  findQualityBySelectValue,
  matchQualityToLevelIndex,
  sortedQualitiesDesc,
  stableQualitySelectValue,
  type HlsVariantProbe,
} from "./patientHlsQuality";

describe("patientHlsQuality", () => {
  it("stableQualitySelectValue prefers height then path then bandwidth", () => {
    expect(stableQualitySelectValue({ height: 720 })).toBe("h:720");
    expect(stableQualitySelectValue({ path: "480p/index.m3u8", bandwidth: 900_000 })).toBe("p:480p/index.m3u8");
    expect(stableQualitySelectValue({ bandwidth: 1e6 })).toBe("b:1000000");
  });

  it("sortedQualitiesDesc sorts by height desc then bandwidth desc", () => {
    const q: MediaAvailableQuality[] = [
      { label: "480p", height: 480, bandwidth: 900_000 },
      { label: "720p", height: 720, bandwidth: 2_800_000 },
    ];
    const s = sortedQualitiesDesc(q);
    expect(s.map((x) => x.height)).toEqual([720, 480]);
  });

  it("findQualityBySelectValue resolves stable keys", () => {
    const q: MediaAvailableQuality[] = [{ label: "720p", height: 720 }];
    const v = stableQualitySelectValue(q[0]);
    expect(findQualityBySelectValue(q, v)).toEqual(q[0]);
    expect(findQualityBySelectValue(q, PATIENT_HLS_QUALITY_AUTO_VALUE)).toBeNull();
  });

  it("matchQualityToLevelIndex matches height first", () => {
    const levels: HlsVariantProbe[] = [
      { height: 480, bitrate: 900_000, url: "/api/media/x/hls/480p/index.m3u8" },
      { height: 720, bitrate: 2_800_000, url: "/api/media/x/hls/720p/index.m3u8" },
    ];
    expect(matchQualityToLevelIndex(levels, { height: 720 })).toBe(1);
    expect(matchQualityToLevelIndex(levels, { height: 480 })).toBe(0);
  });

  it("matchQualityToLevelIndex falls back to path substring", () => {
    const levels: HlsVariantProbe[] = [
      { height: 480, bitrate: 900_000, url: "https://example.com/media/hls/480p/index.m3u8" },
      { height: 720, bitrate: 2_800_000, url: "https://example.com/media/hls/720p/index.m3u8" },
    ];
    expect(matchQualityToLevelIndex(levels, { path: "480p/index.m3u8" })).toBe(0);
  });

  it("displayLabelForSwitchedLevel uses quality label when heights align", () => {
    const qualities: MediaAvailableQuality[] = [
      { label: "720p", height: 720 },
      { label: "480p", height: 480 },
    ];
    const levels: HlsVariantProbe[] = [{ height: 720, bitrate: 2_800_000 }];
    expect(displayLabelForSwitchedLevel(levels, 0, qualities)).toBe("720p");
  });
});
