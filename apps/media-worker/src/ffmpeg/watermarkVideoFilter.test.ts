import { describe, expect, it } from "vitest";
import {
  buildDrawtextWatermarkSuffix,
  composeHlsVideoFilter,
  watermarkTextLine,
} from "./watermarkVideoFilter.js";

describe("watermarkVideoFilter", () => {
  it("watermarkTextLine is non-PII (id + uuid only)", () => {
    expect(watermarkTextLine("00000000-0000-4000-8000-000000000001")).toBe(
      "id 00000000-0000-4000-8000-000000000001\n",
    );
  });

  it("composeHlsVideoFilter without watermark leaves scale chain unchanged", () => {
    expect(composeHlsVideoFilter("scale=1280:-2,format=yuv420p", null)).toBe("scale=1280:-2,format=yuv420p");
  });

  it("composeHlsVideoFilter with watermark appends drawtext snapshot", () => {
    const vf = composeHlsVideoFilter("scale=1280:-2,format=yuv420p", {
      textFilePosix: "/tmp/mw/watermark.txt",
      fontfilePosix: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    });
    expect(vf).toMatch(/^scale=1280:-2,format=yuv420p,drawtext=/);
    expect(vf).toContain("textfile=/tmp/mw/watermark.txt");
    expect(vf).toContain("fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
    expect(vf).toContain("fontsize=16");
  });

  it("buildDrawtextWatermarkSuffix snapshot (ffmpeg filter fragment)", () => {
    expect(
      buildDrawtextWatermarkSuffix({
        textFilePosix: "/var/tmp/a.txt",
        fontfilePosix: "/f.ttf",
      }),
    ).toBe(
      ",drawtext=fontfile=/f.ttf:textfile=/var/tmp/a.txt:fontsize=16:fontcolor=white@0.5:box=1:boxcolor=black@0.45:boxborderw=4:x=w-tw-12:y=h-th-12",
    );
  });
});
