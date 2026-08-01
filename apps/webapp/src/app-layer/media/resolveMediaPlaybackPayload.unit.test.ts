import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@/shared/types/session';

const mocks = vi.hoisted(() => ({
  getRow: vi.fn(),
  playbackEnabled: vi.fn(),
  defaultDelivery: vi.fn(),
  ttl: vi.fn(),
  presign: vi.fn(),
  recordStat: vi.fn(),
  recordEvent: vi.fn(),
  recordFirstResolve: vi.fn(),
}));

vi.mock('@/config/env', () => ({ env: { DATABASE_URL: 'postgres://test/bersoncarebot_test' } }));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/app-layer/media/s3MediaStorage', () => ({ getMediaRowForPlayback: mocks.getRow }));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPatientRuntimeBool: mocks.playbackEnabled,
  getPatientRuntimeValue: mocks.defaultDelivery,
}));
vi.mock('@/app-layer/media/videoPresignTtl', () => ({ getVideoPresignTtlSeconds: mocks.ttl }));
vi.mock('@/app-layer/media/s3Client', () => ({ presignGetUrl: mocks.presign }));
vi.mock('@/app-layer/media/playbackStatsHourly', () => ({
  recordPlaybackResolutionStat: mocks.recordStat,
}));
vi.mock('@/app-layer/media/playbackResolutionEvents', () => ({
  recordPlaybackResolutionEvent: mocks.recordEvent,
}));
vi.mock('@/app-layer/media/playbackUserVideoFirstResolve', () => ({
  recordPlaybackUserVideoFirstResolve: mocks.recordFirstResolve,
}));

import { resolveMediaPlaybackPayload } from './resolveMediaPlaybackPayload';

const mediaId = '00000000-0000-4000-8000-000000000099';
const session: AppSession = {
  user: { userId: 'patient-1', role: 'client', displayName: 'Patient', bindings: {} },
  issuedAt: 1,
  expiresAt: 2,
};

describe('resolveMediaPlaybackPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.playbackEnabled.mockResolvedValue(true);
    mocks.defaultDelivery.mockResolvedValue('auto');
    mocks.ttl.mockResolvedValue(900);
    mocks.recordStat.mockResolvedValue(undefined);
    mocks.recordEvent.mockResolvedValue(undefined);
    mocks.recordFirstResolve.mockResolvedValue(false);
    mocks.getRow.mockResolvedValue({
      mime_type: 'video/mp4',
      s3_key: `media/${mediaId}/source.mp4`,
      stored_path: `media/${mediaId}/source.mp4`,
      video_processing_status: 'ready',
      hls_master_playlist_s3_key: `media/other-media/hls/master.m3u8`,
      poster_s3_key: null,
      video_duration_seconds: 12,
      available_qualities_json: [],
      video_delivery_override: null,
      usage_purpose: null,
      uploaded_by: 'patient-1',
    });
  });

  it('falls back to the protected MP4 route without reaching S3 for an untrusted HLS artifact key', async () => {
    const result = await resolveMediaPlaybackPayload({
      id: mediaId,
      session,
      adminPrefer: null,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { delivery: 'mp4', hls: null, mp4: { url: `/api/media/${mediaId}` } },
    });
    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it('keeps a trusted HLS master same-origin with the protected MP4 fallback', async () => {
    mocks.getRow.mockResolvedValue({
      mime_type: 'video/mp4',
      s3_key: `media/${mediaId}/source.mp4`,
      stored_path: `media/${mediaId}/source.mp4`,
      video_processing_status: 'ready',
      hls_master_playlist_s3_key: `media/${mediaId}/hls/master.m3u8`,
      poster_s3_key: null,
      video_duration_seconds: 12,
      available_qualities_json: [],
      video_delivery_override: null,
      usage_purpose: null,
      uploaded_by: 'patient-1',
    });

    await expect(
      resolveMediaPlaybackPayload({ id: mediaId, session, adminPrefer: null }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        delivery: 'hls',
        hls: { masterUrl: `/api/media/${mediaId}/hls/master.m3u8` },
        mp4: { url: `/api/media/${mediaId}` },
      },
    });
    expect(mocks.presign).not.toHaveBeenCalled();
  });
});
