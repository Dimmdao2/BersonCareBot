import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@/shared/types/session';

const mocks = vi.hoisted(() => ({
  getMediaAccessRow: vi.fn(),
  resolvePlatformLfkMediaAccess: vi.fn(),
}));

vi.mock('@/app-layer/media/s3MediaStorage', () => ({
  getMediaAccessRow: mocks.getMediaAccessRow,
}));
vi.mock('@/app-layer/media/resolvePlatformLfkMediaAccess', () => ({
  resolvePlatformLfkMediaAccess: mocks.resolvePlatformLfkMediaAccess,
}));

import { authorizeMediaDelivery } from './authorizeMediaDelivery';

const mediaId = '00000000-0000-4000-8000-000000000099';

function session(role: AppSession['user']['role'], userId: string): AppSession {
  return {
    user: { userId, role, displayName: 'Test', bindings: {} },
    issuedAt: 1,
    expiresAt: 2,
  };
}

const organizationRow = {
  usage_purpose: null,
  uploaded_by: 'patient-1',
  mime_type: 'video/mp4',
  stored_path: 'media/file.mp4',
  s3_key: 'media/file.mp4',
};

describe('authorizeMediaDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePlatformLfkMediaAccess.mockResolvedValue(false);
    mocks.getMediaAccessRow.mockResolvedValue(organizationRow);
  });

  it('accepts the organization-scoped row without attempting platform access', async () => {
    await expect(
      authorizeMediaDelivery(mediaId, session('client', 'patient-2')),
    ).resolves.toMatchObject({
      ok: true,
      row: organizationRow,
      allowPlatformBase: false,
    });
    expect(mocks.getMediaAccessRow).toHaveBeenCalledWith(mediaId);
    expect(mocks.resolvePlatformLfkMediaAccess).not.toHaveBeenCalled();
  });

  it('returns not_found for a foreign or absent organization row before a delivery consumer can run', async () => {
    mocks.getMediaAccessRow.mockResolvedValue(null);
    await expect(authorizeMediaDelivery(mediaId, session('client', 'patient-2'))).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(mocks.resolvePlatformLfkMediaAccess).toHaveBeenCalledOnce();
    expect(mocks.resolvePlatformLfkMediaAccess).toHaveBeenCalledWith(mediaId);
    expect(mocks.getMediaAccessRow).toHaveBeenCalledOnce();
    expect(mocks.getMediaAccessRow).toHaveBeenCalledWith(mediaId);
  });

  it('allows only the submission uploader or doctor/admin after the scoped row exists', async () => {
    mocks.getMediaAccessRow.mockResolvedValue({
      ...organizationRow,
      usage_purpose: 'program_item_submission',
    });

    await expect(
      authorizeMediaDelivery(mediaId, session('client', 'patient-1')),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      authorizeMediaDelivery(mediaId, session('doctor', 'doctor-1')),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      authorizeMediaDelivery(mediaId, session('admin', 'admin-1')),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(authorizeMediaDelivery(mediaId, session('client', 'patient-2'))).resolves.toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('gives the raw original only to the account that uploaded it', async () => {
    mocks.getMediaAccessRow.mockResolvedValue({ ...organizationRow, uploaded_by: 'doctor-1' });

    await expect(
      authorizeMediaDelivery(mediaId, session('doctor', 'doctor-1'), { intent: 'raw_original' }),
    ).resolves.toMatchObject({ ok: true });

    // Тот же кабинет, та же организация, playback этому врачу разрешён — а исходник нет.
    await expect(
      authorizeMediaDelivery(mediaId, session('doctor', 'doctor-2')),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      authorizeMediaDelivery(mediaId, session('doctor', 'doctor-2'), { intent: 'raw_original' }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
    await expect(
      authorizeMediaDelivery(mediaId, session('admin', 'admin-1'), { intent: 'raw_original' }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
  });

  it('refuses the raw original when the row names no uploader', async () => {
    mocks.getMediaAccessRow.mockResolvedValue({
      ...organizationRow,
      uploaded_by: null as unknown as string,
    });

    await expect(
      authorizeMediaDelivery(mediaId, session('doctor', 'doctor-1'), { intent: 'raw_original' }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
  });

  it('never hands the raw original out of the platform library', async () => {
    mocks.getMediaAccessRow
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...organizationRow, uploaded_by: 'doctor-1' });
    mocks.resolvePlatformLfkMediaAccess.mockResolvedValue(true);

    await expect(
      authorizeMediaDelivery(mediaId, session('doctor', 'doctor-1'), { intent: 'raw_original' }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
  });

  it('uses platform media only after its explicit resolver grants the retry', async () => {
    mocks.getMediaAccessRow.mockResolvedValueOnce(null).mockResolvedValueOnce(organizationRow);
    mocks.resolvePlatformLfkMediaAccess.mockResolvedValue(true);

    await expect(
      authorizeMediaDelivery(mediaId, session('client', 'patient-2')),
    ).resolves.toMatchObject({
      ok: true,
      allowPlatformBase: true,
    });
    expect(mocks.getMediaAccessRow).toHaveBeenNthCalledWith(1, mediaId);
    expect(mocks.getMediaAccessRow).toHaveBeenNthCalledWith(2, mediaId, {
      allowPlatformBase: true,
    });
  });
});
