import { describe, expect, it } from 'vitest';
import { buildHlsSingleVariantArgs, HLS_ENCODE_CRF } from './hlsArgs.js';

/**
 * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` "Решение по режиму кодирования" (owner,
 * 11.09.2026) — CRF with a ceiling instead of plain `-b:v` ABR: "`-crf 23 -maxrate <битрейт ступени>
 * -bufsize 2×<битрейт>` вместо `-b:v`. Простой ролик укладывается ниже потолка сам, сложный упирается
 * в потолок."
 */
describe('buildHlsSingleVariantArgs', () => {
  it('encodes with -crf + -maxrate + -bufsize, never with plain -b:v', () => {
    const args = buildHlsSingleVariantArgs({
      inputFile: 'in.mp4',
      outputM3u8: 'index.m3u8',
      segmentFilename: 'seg_%03d.m4s',
      initSegmentFilename: 'init.mp4',
      videoFilter: 'scale=640:-2',
      videoBitrateCeilingBps: 730_000,
      audioBitrateBps: 64_000,
    });

    expect(args).not.toContain('-b:v');
    expect(args).toEqual(
      expect.arrayContaining(['-crf', String(HLS_ENCODE_CRF), '-maxrate', '730000', '-bufsize', '1460000']),
    );
  });

  it('-bufsize is always exactly 2x the -maxrate ceiling', () => {
    const args = buildHlsSingleVariantArgs({
      inputFile: 'in.mp4',
      outputM3u8: 'index.m3u8',
      segmentFilename: 'seg_%03d.m4s',
      initSegmentFilename: 'init.mp4',
      videoFilter: 'scale=1280:-2',
      videoBitrateCeilingBps: 2_500_000,
      audioBitrateBps: 128_000,
    });

    const maxrateIdx = args.indexOf('-maxrate');
    const bufsizeIdx = args.indexOf('-bufsize');
    expect(Number(args[bufsizeIdx + 1])).toBe(2 * Number(args[maxrateIdx + 1]));
  });

  it('still keeps audio bitrate and HLS muxer flags untouched', () => {
    const args = buildHlsSingleVariantArgs({
      inputFile: 'in.mp4',
      outputM3u8: 'index.m3u8',
      segmentFilename: 'seg_%03d.m4s',
      initSegmentFilename: 'init.mp4',
      videoFilter: 'scale=640:-2',
      videoBitrateCeilingBps: 400_000,
      audioBitrateBps: 96_000,
    });

    expect(args).toEqual(expect.arrayContaining(['-c:a', 'aac', '-b:a', '96000']));
    expect(args).toEqual(expect.arrayContaining(['-hls_playlist_type', 'vod']));
  });

  /**
   * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` требование 2 «сегменты fMP4 вместо
   * MPEG-TS»: живая библиотека владельца измерила накладные TS 5.7% (720p), 8.5% (480p), до 19.8% на
   * самом слабом ролике, против ~1% у fMP4. `hls.js` 1.7.2 и нативный HLS (iOS 10+) оба играют fMP4.
   */
  it('mux is fMP4, never MPEG-TS: -hls_segment_type fmp4 with an init filename', () => {
    const args = buildHlsSingleVariantArgs({
      inputFile: 'in.mp4',
      outputM3u8: 'index.m3u8',
      segmentFilename: 'seg_%03d.m4s',
      initSegmentFilename: 'init.mp4',
      videoFilter: 'scale=640:-2',
      videoBitrateCeilingBps: 730_000,
      audioBitrateBps: 64_000,
    });

    expect(args).toEqual(
      expect.arrayContaining(['-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4']),
    );
    expect(args).toEqual(expect.arrayContaining(['-hls_segment_filename', 'seg_%03d.m4s']));
  });
});
