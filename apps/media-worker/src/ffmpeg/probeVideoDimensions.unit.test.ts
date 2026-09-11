import { describe, expect, it } from 'vitest';
import { parseFfmpegStderrDimensions, parseFfprobeDimensionsCsv } from './probeVideoDimensions.js';

describe('parseFfprobeDimensionsCsv', () => {
  it('parses the ffprobe `csv=s=x:p=0` stream output', () => {
    expect(parseFfprobeDimensionsCsv('1920x1080\n')).toEqual({ width: 1920, height: 1080 });
  });

  it('returns null for empty/malformed output instead of a fake size', () => {
    expect(parseFfprobeDimensionsCsv('')).toBeNull();
    expect(parseFfprobeDimensionsCsv('not-a-size')).toBeNull();
  });
});

describe('parseFfmpegStderrDimensions', () => {
  it('parses the resolution out of the `ffmpeg -i` stream banner', () => {
    const stderr =
      "Stream #0:0(und): Video: h264 (High), yuv420p(tv, bt709), 1280x720 [SAR 1:1 DAR 16:9], 30 fps";
    expect(parseFfmpegStderrDimensions(stderr)).toEqual({ width: 1280, height: 720 });
  });

  it('returns null when there is no video stream line', () => {
    expect(parseFfmpegStderrDimensions('Stream #0:1: Audio: aac')).toBeNull();
  });
});
