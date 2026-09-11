import { describe, expect, it } from 'vitest';
import { contentTypeForKey } from './s3.js';

/**
 * ORACLE: `apps/webapp/src/app-layer/media/hlsDeliveryProxy.ts`'s `contentTypeForArtifact` trusts
 * the S3-stored `Content-Type` over guessing it from the extension (`if (fromS3 && fromS3.trim())
 * return fromS3`). An unmapped fMP4 extension here would upload as `application/octet-stream` and
 * ship that all the way to the player, extension-guessing on the delivery side notwithstanding.
 */
describe('contentTypeForKey', () => {
  it('maps fMP4 HLS artifacts (Требование 2, VIDEO_DELIVERY_COST_AND_METERING) to real content types', () => {
    expect(contentTypeForKey('media/x/hls/720p/seg_000.m4s')).toBe('video/iso.segment');
    expect(contentTypeForKey('media/x/hls/720p/init.mp4')).toBe('video/mp4');
  });

  it('keeps the existing mappings for playlists, legacy TS segments, and posters', () => {
    expect(contentTypeForKey('media/x/hls/master.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(contentTypeForKey('media/x/hls/720p/seg_000.ts')).toBe('video/mp2t');
    expect(contentTypeForKey('media/x/poster/poster.jpg')).toBe('image/jpeg');
  });

  it('falls back to a generic binary type for anything unrecognized', () => {
    expect(contentTypeForKey('media/x/source.bin')).toBe('application/octet-stream');
  });
});
