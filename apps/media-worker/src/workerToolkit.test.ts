import { describe, expect, it } from "vitest";
import { backoffMsAfterFailure } from "./jobs/backoff.js";
import { buildHlsSingleVariantArgs, buildPosterFfmpegArgs } from "./ffmpeg/hlsArgs.js";

describe("backoffMsAfterFailure", () => {
  it("grows with attempts and caps", () => {
    expect(backoffMsAfterFailure(1)).toBe(10_000);
    expect(backoffMsAfterFailure(2)).toBe(20_000);
    expect(backoffMsAfterFailure(10)).toBe(3_600_000);
    expect(backoffMsAfterFailure(20)).toBe(3_600_000);
  });
});

describe("buildHlsSingleVariantArgs", () => {
  it("uses vod hls with segment filename", () => {
    const a = buildHlsSingleVariantArgs({
      inputFile: "/tmp/in.mp4",
      outputM3u8: "index.m3u8",
      segmentFilename: "seg_%03d.ts",
      videoFilter: "scale=1280:-2,format=yuv420p",
      videoBitrate: "2500k",
      audioBitrate: "128k",
    });
    expect(a).toContain("-f");
    expect(a).toContain("hls");
    expect(a).toContain("vod");
    expect(a).toContain("seg_%03d.ts");
    expect(a[a.length - 1]).toBe("index.m3u8");
  });

  it("passes full -vf including drawtext (watermark) unchanged", () => {
    // eslint-disable-next-line no-secrets/no-secrets -- snapshot of ffmpeg -vf chain
    const vf = "scale=1280:-2,format=yuv420p,drawtext=fontfile=/f.ttf:textfile=/w.txt:fontsize=16:fontcolor=white@0.5:box=1:boxcolor=black@0.45:boxborderw=4:x=w-tw-12:y=h-th-12";
    const a = buildHlsSingleVariantArgs({
      inputFile: "/tmp/in.mp4",
      outputM3u8: "index.m3u8",
      segmentFilename: "seg_%03d.ts",
      videoFilter: vf,
      videoBitrate: "2500k",
      audioBitrate: "128k",
    });
    const i = a.indexOf("-vf");
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toBe(vf);
  });
});

describe("poster frame ffmpeg args", () => {
  it("extracts single frame", () => {
    const a = buildPosterFfmpegArgs("/tmp/in.mp4", "/tmp/out.jpg");
    expect(a).toContain("-vframes");
    expect(a).toContain("1");
    expect(a[a.length - 1]).toBe("/tmp/out.jpg");
    expect(a).not.toContain("-vf");
  });

  it("optional video filter for watermark poster", () => {
    const a = buildPosterFfmpegArgs("/tmp/in.mp4", "/tmp/out.jpg", "scale=1280:-2,format=yuv420p");
    const i = a.indexOf("-vf");
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toContain("scale=1280");
  });
});
