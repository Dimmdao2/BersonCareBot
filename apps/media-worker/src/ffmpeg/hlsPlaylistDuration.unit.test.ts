import { describe, expect, it } from 'vitest';
import {
  firstHlsSegmentName,
  hlsMapUriFromVariantPlaylist,
  sumHlsExtinfDurationSeconds,
} from './hlsPlaylistDuration.js';

/**
 * ORACLE: duration is recorded from the produced HLS variant playlist, not the source file —
 * rows transcoded before the source-retention decision (`VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md`
 * item 6) had their source deleted, so a source-based probe silently no-ops on those rows
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

const FMP4_VARIANT_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:7',
  '#EXT-X-TARGETDURATION:6',
  '#EXT-X-PLAYLIST-TYPE:VOD',
  '#EXT-X-MAP:URI="init.mp4"',
  '#EXTINF:6.000000,',
  'seg_000.m4s',
  '#EXTINF:6.000000,',
  'seg_001.m4s',
  '#EXT-X-ENDLIST',
  '',
].join('\n');

/**
 * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` требование 2 (owner, 11.09.2026):
 * «`firstHlsSegmentName` не должна принимать за сегмент строку `#EXT-X-MAP:URI="…"`».
 */
describe('firstHlsSegmentName', () => {
  it('skips #EXT-X-MAP and returns the first actual fMP4 fragment', () => {
    expect(firstHlsSegmentName(FMP4_VARIANT_PLAYLIST)).toBe('seg_000.m4s');
  });

  it('returns the first .ts segment on a legacy (pre-fMP4) variant playlist', () => {
    const body = ['#EXTM3U', '#EXTINF:6.0,', 'seg_000.ts', '#EXT-X-ENDLIST', ''].join('\n');
    expect(firstHlsSegmentName(body)).toBe('seg_000.ts');
  });

  it('returns null when there is no media segment line', () => {
    expect(firstHlsSegmentName('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-ENDLIST\n')).toBeNull();
  });
});

describe('hlsMapUriFromVariantPlaylist', () => {
  it('parses the init segment URI out of #EXT-X-MAP', () => {
    expect(hlsMapUriFromVariantPlaylist(FMP4_VARIANT_PLAYLIST)).toBe('init.mp4');
  });

  it('returns null for a variant playlist without an #EXT-X-MAP tag (legacy TS)', () => {
    const body = ['#EXTM3U', '#EXTINF:6.0,', 'seg_000.ts', '#EXT-X-ENDLIST', ''].join('\n');
    expect(hlsMapUriFromVariantPlaylist(body)).toBeNull();
  });
});
