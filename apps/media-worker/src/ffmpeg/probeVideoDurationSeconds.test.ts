import { describe, expect, it } from "vitest";
import { ffprobePathFromFfmpeg } from "./probeVideoDurationSeconds.js";

describe("ffprobePathFromFfmpeg", () => {
  it("replaces ffmpeg suffix with ffprobe", () => {
    expect(ffprobePathFromFfmpeg("/usr/bin/ffmpeg")).toBe("/usr/bin/ffprobe");
    expect(ffprobePathFromFfmpeg("/opt/ffmpeg")).toBe("/opt/ffprobe");
  });
});
