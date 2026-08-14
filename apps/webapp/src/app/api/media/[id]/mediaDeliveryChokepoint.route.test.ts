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
  resolvePatientOrganization: vi.fn(),
  withPatientPrincipal: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: { DATABASE_URL: 'postgres://test/bersoncarebot_test' },
  isS3MediaEnabled: () => true,
  webappRuntimeDatabaseIsConfigured: () => true,
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
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ patientOrganization: {} }),
}));
vi.mock('@/app-layer/patient-organization/requestContext', () => ({
  resolvePatientOrganizationRequestContext: mocks.resolvePatientOrganization,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientOrganizationPrincipal: mocks.withPatientPrincipal,
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
    mocks.resolvePatientOrganization.mockResolvedValue({
      ok: true,
      organizationId: '00000000-0000-4000-8000-000000000001',
    });
    mocks.withPatientPrincipal.mockImplementation(
      (_context: unknown, operation: () => unknown) => operation(),
    );
  });

  it('does not reach S3 when the shared door reports a foreign or missing media row', async () => {
    mocks.authorize.mockResolvedValue({ ok: false, reason: 'not_found' });

    const response = await getMedia(new Request(`https://app.test/api/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });

    expect(response.status).toBe(404);
    expect(mocks.getS3Key).not.toHaveBeenCalled();
  });

  it('preserves the base route forbidden status without reaching S3', async () => {
    mocks.authorize.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const response = await getMedia(new Request(`https://app.test/api/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });

    expect(response.status).toBe(403);
    expect(mocks.getS3Key).not.toHaveBeenCalled();
    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it('keeps progressive MP4 as a private 307 and applies the dynamic presign TTL', async () => {
    const response = await getMedia(new Request(`https://app.test/api/media/${mediaId}`), {
      params: Promise.resolve({ id: mediaId }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example/signed');
    expect(response.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate');
    expect(mocks.presign).toHaveBeenCalledWith('media/file.mp4', 900);
    expect(mocks.withPatientPrincipal).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: '00000000-0000-4000-8000-000000000001',
        platformUserId: 'patient-1',
      }),
      expect.any(Function),
    );
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

  it('serves a preview body with its private validators after authorization', async () => {
    const response = await getPreview(
      new Request(`https://app.test/api/media/${mediaId}/preview/sm`),
      { params: Promise.resolve({ id: mediaId, size: 'sm' }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe(
      'private, max-age=86400, stale-while-revalidate=604800',
    );
    expect(response.headers.get('etag')).toBe('"etag"');
    await expect(response.arrayBuffer()).resolves.toEqual(Uint8Array.from([1, 2, 3]).buffer);
  });

  it('keeps both preview fallbacks private and behind authorization', async () => {
    mocks.getPreviewKey.mockResolvedValueOnce(null);
    const original = await getPreview(
      new Request(`https://app.test/api/media/${mediaId}/preview/sm`),
      { params: Promise.resolve({ id: mediaId, size: 'sm' }) },
    );
    expect(original.status).toBe(307);
    expect(original.headers.get('location')).toBe(`/api/media/${mediaId}`);
    expect(original.headers.get('cache-control')).toBe('private, max-age=60');

    mocks.getPreviewBody.mockResolvedValueOnce(null);
    const signed = await getPreview(
      new Request(`https://app.test/api/media/${mediaId}/preview/md`),
      { params: Promise.resolve({ id: mediaId, size: 'md' }) },
    );
    expect(signed.status).toBe(307);
    expect(signed.headers.get('location')).toBe('https://storage.example/signed');
    expect(signed.headers.get('cache-control')).toBe('private, max-age=900, must-revalidate');
    expect(mocks.presign).toHaveBeenCalledWith('media/preview.jpg', 900);
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

  it('stops HLS before settings and proxy work when the shared door refuses', async () => {
    mocks.authorize.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const response = await getHls(
      new Request(`https://app.test/api/media/${mediaId}/hls/master.m3u8`),
      { params: Promise.resolve({ id: mediaId, path: ['master.m3u8'] }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.playbackEnabled).not.toHaveBeenCalled();
    expect(mocks.hls).not.toHaveBeenCalled();
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

  it('skips submission telemetry but records an authorized ordinary event', async () => {
    mocks.authorize.mockResolvedValueOnce({
      ...allowed,
      row: { ...allowed.row, usage_purpose: 'program_item_submission' },
    });
    const request = () =>
      new Request(`https://app.test/api/media/${mediaId}/playback/events`, {
        method: 'POST',
        body: JSON.stringify({ eventClass: 'hls_fatal', delivery: 'hls' }),
      });

    const skipped = await postPlaybackEvent(request(), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(skipped.status).toBe(200);
    await expect(skipped.json()).resolves.toEqual({ ok: true, skipped: true });
    expect(mocks.recordEvent).not.toHaveBeenCalled();

    const recorded = await postPlaybackEvent(request(), {
      params: Promise.resolve({ id: mediaId }),
    });
    expect(recorded.status).toBe(200);
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId, userId: 'patient-1', eventClass: 'hls_fatal' }),
    );
  });
});
