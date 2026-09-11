import { describe, expect, it } from 'vitest';
import { parseFfmpegStderrSourceProbe, parseFfprobeSourceProbeJson } from './probeVideoDimensions.js';

describe('parseFfprobeSourceProbeJson', () => {
  it('parses dimensions and the container bitrate off one combined ffprobe JSON call', () => {
    const raw = '{"streams":[{"width":1920,"height":1080}],"format":{"bit_rate":"10739200"}}';
    expect(parseFfprobeSourceProbeJson(raw)).toEqual({
      width: 1920,
      height: 1080,
      bitrateBps: 10_739_200,
    });
  });

  it('returns bitrateBps null when the container reports no bit_rate, without failing the whole probe', () => {
    const raw = '{"streams":[{"width":1280,"height":720}],"format":{}}';
    expect(parseFfprobeSourceProbeJson(raw)).toEqual({ width: 1280, height: 720, bitrateBps: null });
  });

  it('returns null for empty/malformed output instead of a fake size', () => {
    expect(parseFfprobeSourceProbeJson('')).toBeNull();
    expect(parseFfprobeSourceProbeJson('not-json')).toBeNull();
    expect(parseFfprobeSourceProbeJson('{"streams":[]}')).toBeNull();
  });
});

describe('parseFfmpegStderrSourceProbe', () => {
  it('parses resolution and overall bitrate out of the same `ffmpeg -i` stream/duration banner', () => {
    const stderr = [
      'Duration: 00:00:05.03, start: 0.000000, bitrate: 752 kb/s',
      "Stream #0:0(und): Video: h264 (High), yuv420p(tv, bt709), 1280x720 [SAR 1:1 DAR 16:9], 30 fps",
    ].join('\n');
    expect(parseFfmpegStderrSourceProbe(stderr)).toEqual({
      width: 1280,
      height: 720,
      bitrateBps: 752_000,
    });
  });

  it('returns bitrateBps null when the banner has no Duration/bitrate line', () => {
    const stderr = "Stream #0:0(und): Video: h264, yuv420p, 1280x720, 30 fps";
    expect(parseFfmpegStderrSourceProbe(stderr)).toEqual({
      width: 1280,
      height: 720,
      bitrateBps: null,
    });
  });

  it('returns null when there is no video stream line', () => {
    expect(parseFfmpegStderrSourceProbe('Stream #0:1: Audio: aac')).toBeNull();
  });
});
