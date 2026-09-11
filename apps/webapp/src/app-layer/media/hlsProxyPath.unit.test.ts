import { describe, expect, it } from 'vitest';
import { HLS_MASTER_PLAYLIST_QUALITY_SENTINEL, hlsArtifactQualityFromPath } from './hlsProxyPath';

/**
 * WHAT BREAKS: VIDEO_DELIVERY_COST_AND_METERING (11.09.2026) requires the daily byte rollup keyed
 * by (day, org, user, media, QUALITY) — «разрез… по качеству — обязательный ключ, а не опция».
 * CONSEQUENCE: a wrong quality read from the segment path silently merges distinct renditions into
 * one bucket (or splits the master playlist into a fake "rendition"), and the owner's per-quality
 * cost/traffic breakdown lies from day one.
 * ORACLE: the worker's own storage layout (`processTranscodeJob.ts`) — every rendition lives under
 * `hls/<rung.label>/…`, the master playlist directly under `hls/master.m3u8` with no rung directory.
 */
describe('hlsArtifactQualityFromPath', () => {
  it('reads the rung label from a segment path', () => {
    expect(hlsArtifactQualityFromPath(['576p', 'seg_003.m4s'])).toBe('576p');
    expect(hlsArtifactQualityFromPath(['720p', 'seg_000.ts'])).toBe('720p');
  });

  it('reads the rung label from a variant playlist path, not the playlist file name', () => {
    expect(hlsArtifactQualityFromPath(['1080p', 'index.m3u8'])).toBe('1080p');
  });

  it('gives the master playlist the sentinel, not a fake rung label', () => {
    expect(hlsArtifactQualityFromPath(['master.m3u8'])).toBe(HLS_MASTER_PLAYLIST_QUALITY_SENTINEL);
  });

  it('falls back to the sentinel for an empty path rather than reading past the array', () => {
    expect(hlsArtifactQualityFromPath([])).toBe(HLS_MASTER_PLAYLIST_QUALITY_SENTINEL);
  });
});
