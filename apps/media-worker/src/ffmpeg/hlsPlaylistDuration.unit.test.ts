import { describe, expect, it } from 'vitest';
import { sumHlsExtinfDurationSeconds } from './hlsPlaylistDuration.js';

/**
 * ORACLE: duration is recorded from the produced HLS variant playlist, not the source file —
 * `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` item 6: the source is deleted after a
 * successful transcode, so a source-based probe silently no-ops on almost every already-ready row
 * (measured: 3 of 192). The variant playlist always exists once HLS is `ready`.
 */
describe('sumHlsExtinfDurationSeconds', () => {
  it('sums #EXTINF segment durations from a real variant playlist', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:6',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXTINF:6.006000,',
      'seg_000.ts',
      '#EXTINF:6.006000,',
      'seg_001.ts',
      '#EXTINF:3.500000,',
      'seg_002.ts',
      '#EXT-X-ENDLIST',
      '',
    ].join('\n');

    expect(sumHlsExtinfDurationSeconds(body)).toBeCloseTo(15.512, 3);
  });

  it('returns null when there is no #EXTINF entry to sum (not a valid clip duration)', () => {
    expect(sumHlsExtinfDurationSeconds('#EXTM3U\n#EXT-X-ENDLIST\n')).toBeNull();
  });

  it('ignores a zero/negative #EXTINF entry instead of reporting a false duration', () => {
    const body = '#EXTM3U\n#EXTINF:0,\nseg_000.ts\n#EXT-X-ENDLIST\n';
    expect(sumHlsExtinfDurationSeconds(body)).toBeNull();
  });
});
