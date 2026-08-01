/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@/shared/types/session';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getSession: vi.fn(),
  getS3Key: vi.fn(),
  getPreviewKey: vi.fn(),
  presign: vi.fn(),
  ttl: vi.fn(),
  getPreviewBody: vi.fn(),
  getPreviewHead: vi.fn(),
  resolvePlayback: vi.fn(),
  hls: vi.fn(),
  playbackEnabled: vi.fn(),
  recordEvent: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: { DATABASE_URL: 'postgres://test/bersoncarebot_test' },
  isS3MediaEnabled: () => true,
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: mocks.getSession }));
vi.mock('@/modules/roles/service', () => ({ canAccessDoctor: () => false }));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (_context: unknown, operation: () => unknown) => operation(),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: async () => ({ ok: true, session: await mocks.getSession() }),
  requireDoctorWorkspaceApiContext: vi.fn(),
}));
vi.mock('@/app-layer/media/authorizeMediaDelivery', () => ({
  authorizeMediaDelivery: mocks.authorize,
}));
vi.mock('@/app-layer/media/s3MediaStorage', () => ({
  getMediaS3KeyForRedirect: mocks.getS3Key,
  getMediaPreviewS3KeyForRedirect: mocks.getPreviewKey,
}));
vi.mock('@/app-layer/media/s3Client', () => ({
  presignGetUrl: mocks.presign,
  s3GetObjectBody: mocks.getPreviewBody,
  s3HeadObjectDetails: mocks.getPreviewHead,
}));
vi.mock('@/app-layer/media/videoPresignTtl', () => ({ getVideoPresignTtlSeconds: mocks.ttl }));
vi.mock('@/app-layer/media/localSaasTestFixtureMedia', () => ({ readSaasTestLocalMedia: vi.fn() }));
vi.mock('@/app-layer/media/mockMediaStorage', () => ({ getStoredMediaBody: vi.fn() }));
vi.mock('@/app-layer/media/resolveMediaPlaybackPayload', () => ({
  resolveMediaPlaybackPayload: mocks.resolvePlayback,
}));
vi.mock('@/app-layer/media/hlsDeliveryProxy', () => ({ handleHlsDeliveryProxyRequest: mocks.hls }));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPatientRuntimeBool: mocks.playbackEnabled,
}));
vi.mock('@/app-layer/media/playbackClientEvents', () => ({
  recordPlaybackClientEvent: mocks.recordEvent,
}));

import { GET as getMedia } from './route';
import { GET as getPlayback } from './playback/route';
import { GET as getPreview } from './preview/[size]/route';
import { GET as getHls } from './hls/[[...path]]/route';
import { POST as postPlaybackEvent } from './playback/events/route';

const mediaId = '00000000-0000-4000-8000-000000000099';
const appSession: AppSession = {
  user: { userId: 'patient-1', role: 'client', displayName: 'Patient', bindings: {} },
  issuedAt: 1,
  expiresAt: 2,
};
const allowed = {
  ok: true as const,
  allowPlatformBase: false,
  row: {
    usage_purpose: null,
    uploaded_by: 'patient-1',
    mime_type: 'video/mp4',
    stored_path: 'media/file.mp4',
    s3_key: 'media/file.mp4',
  },
};

describe('media delivery routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(appSession);
    mocks.authorize.mockResolvedValue(allowed);
    mocks.ttl.mockResolvedValue(900);
    mocks.getS3Key.mockResolvedValue('media/file.mp4');
    mocks.presign.mockResolvedValue('https://storage.example/signed');
    mocks.getPreviewKey.mockResolvedValue('media/preview.jpg');
    mocks.getPreviewHead.mockResolvedValue({
      eTag: '"etag"',
      lastModified: new Date('2026-01-01'),
    });
    mocks.getPreviewBody.mockResolvedValue(Buffer.from([1, 2, 3]));
    mocks.resolvePlayback.mockResolvedValue({ ok: true, data: { delivery: 'mp4' } });
    mocks.playbackEnabled.mockResolvedValue(true);
    mocks.hls.mockResolvedValue(new Response('segment'));
    mocks.recordEvent.mockResolvedValue(undefined);
  });

  it('does not reach S3 when the shared door reports a foreign or missing media row', async () => {
    mocks.authorize.mockResolvedValue({ ok: false, reason: 'not_found' });

    const response = await getMedia(new Request(`https://app.test/api/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });

    expect(response.status).toBe(404);
    expect(mocks.getS3Key).not.toHaveBeenCalled();
  });

  it('keeps progressive MP4 as a private 307 and applies the dynamic presign TTL', async () => {
    const response = await getMedia(new Request(`https://app.test/api/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example/signed');
    expect(response.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate');
    expect(mocks.presign).toHaveBeenCalledWith('media/file.mp4', 900);
  });

  it('stops playback and preview before their delivery consumers when the shared door refuses', async () => {
    mocks.authorize.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const [playback, preview] = await Promise.all([
      getPlayback(new Request(`https://app.test/api/media/${mediaId}/playback`), {
        params: Promise.resolve({ id: mediaId }),
      }),
      getPreview(new Request(`https://app.test/api/media/${mediaId}/preview/sm`), {
        params: Promise.resolve({ id: mediaId, size: 'sm' }),
      }),
    ]);

    expect(playback.status).toBe(401);
    expect(preview.status).toBe(401);
    expect(mocks.resolvePlayback).not.toHaveBeenCalled();
    expect(mocks.getPreviewKey).not.toHaveBeenCalled();
  });

  it('keeps HLS-disabled 503 and forwards Range only after the common door', async () => {
    mocks.playbackEnabled.mockResolvedValueOnce(false);
    const disabled = await getHls(
      new Request(`https://app.test/api/media/${mediaId}/hls/master.m3u8`),
      {
        params: Promise.resolve({ id: mediaId, path: ['master.m3u8'] }),
      },
    );
    expect(disabled.status).toBe(503);
    expect(mocks.hls).not.toHaveBeenCalled();

    const request = new Request(`https://app.test/api/media/${mediaId}/hls/720p/segment.ts`, {
      headers: { Range: 'bytes=0-1' },
    });
    await getHls(request, {
      params: Promise.resolve({ id: mediaId, path: ['720p', 'segment.ts'] }),
    });
    expect(mocks.hls).toHaveBeenCalledWith(
      expect.objectContaining({ rangeHeader: 'bytes=0-1', allowPlatformBase: false }),
    );
  });

  it('does not write playback events until the common door allows the media', async () => {
    mocks.authorize.mockResolvedValue({ ok: false, reason: 'not_found' });
    const response = await postPlaybackEvent(
      new Request(`https://app.test/api/media/${mediaId}/playback/events`, {
        method: 'POST',
        body: JSON.stringify({ eventClass: 'hls_fatal' }),
      }),
      { params: Promise.resolve({ id: mediaId }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });
});
