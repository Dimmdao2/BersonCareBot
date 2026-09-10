/** @vitest-environment node */

/**
 * Скачивание исходника (М6). Тесты проверяют ровно то, что владелец назвал условиями выдачи:
 * файл нельзя проиграть в браузере, чужой специалист его не получает, и до хранилища запрос
 * при отказе не доходит. Снять любую из стен — и тест краснеет.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@/shared/types/session';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getObject: vi.fn(),
  getStream: vi.fn(),
  doctorGate: vi.fn(),
}));

vi.mock('@/app-layer/logging/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/app-layer/media/authorizeMediaDelivery', () => ({
  authorizeMediaDelivery: mocks.authorize,
}));
vi.mock('@/app-layer/media/s3MediaStorage', () => ({
  getMediaOriginalObjectForDownload: mocks.getObject,
}));
vi.mock('@/app-layer/media/s3Client', () => ({ s3GetObjectStream: mocks.getStream }));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (_context: unknown, operation: () => unknown) => operation(),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: mocks.doctorGate,
}));

import { GET as getOriginal } from './route';

const mediaId = '00000000-0000-4000-8000-000000000099';
const session: AppSession = {
  user: { userId: 'doctor-1', role: 'doctor', displayName: 'Doctor', bindings: {} },
  issuedAt: 1,
  expiresAt: 2,
};

function request() {
  return new Request(`https://app.test/api/media/${mediaId}/original`);
}

function params() {
  return { params: Promise.resolve({ id: mediaId }) };
}

describe('GET /api/media/[id]/original', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.doctorGate.mockResolvedValue({
      ok: true,
      ctx: { session, organizationId: '00000000-0000-4000-8000-000000000001' },
    });
    mocks.authorize.mockResolvedValue({
      ok: true,
      allowPlatformBase: false,
      row: {
        usage_purpose: null,
        uploaded_by: 'doctor-1',
        mime_type: 'video/mp4',
        stored_path: 'media/clip.mp4',
        s3_key: 'media/clip.mp4',
      },
    });
    mocks.getObject.mockResolvedValue({
      key: 'media/clip.mp4',
      target: 'library',
      originalName: 'gait "clip",1.mp4',
      standardRenditionAt: null,
    });
    mocks.getStream.mockResolvedValue({
      ok: true,
      httpStatus: 200,
      stream: new Response('bytes').body,
      contentType: 'video/mp4',
      contentLength: 5,
    });
  });

  it('asks the shared door for the raw original, not for ordinary playback', async () => {
    await getOriginal(request(), params());

    expect(mocks.authorize).toHaveBeenCalledWith(mediaId, session, { intent: 'raw_original' });
  });

  it('hands a video over as a non-executable attachment', async () => {
    const response = await getOriginal(request(), params());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    // Кавычка в имени не должна уметь дописать в заголовок собственный параметр.
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="gait _clip_,1.mp4"; filename*=UTF-8''${encodeURIComponent('gait "clip",1.mp4')}`,
    );
    await expect(response.text()).resolves.toBe('bytes');
  });

  it('never answers with a redirect to storage', async () => {
    const response = await getOriginal(request(), params());

    expect(response.status).toBeLessThan(300);
    expect(response.headers.get('location')).toBeNull();
  });

  it('refuses a requester the door rejected before touching storage', async () => {
    mocks.authorize.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const response = await getOriginal(request(), params());

    expect(response.status).toBe(403);
    expect(mocks.getObject).not.toHaveBeenCalled();
    expect(mocks.getStream).not.toHaveBeenCalled();
  });

  it('keeps a foreign or missing row a 404 with no storage read', async () => {
    mocks.authorize.mockResolvedValue({ ok: false, reason: 'not_found' });

    const response = await getOriginal(request(), params());

    expect(response.status).toBe(404);
    expect(mocks.getObject).not.toHaveBeenCalled();
    expect(mocks.getStream).not.toHaveBeenCalled();
  });

  it('does not authorize anything for a session without the doctor workspace', async () => {
    mocks.doctorGate.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 }),
    });

    const response = await getOriginal(request(), params());

    expect(response.status).toBe(401);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});
