import { describe, expect, it } from 'vitest';
import {
  VIDEO_DURATION_LIMIT_SECONDS,
  validateVideoAttachmentDuration,
} from './videoDurationLimit';
import type { MediaRecord } from './types';

function video(durationSeconds: number | null): MediaRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'video',
    mimeType: 'video/mp4',
    filename: 'clip.mp4',
    size: 1,
    createdAt: '2026-08-20T00:00:00.000Z',
    videoDurationSeconds: durationSeconds,
  };
}

describe('video attachment duration limits', () => {
  it('keeps the owner thresholds independent', () => {
    expect(VIDEO_DURATION_LIMIT_SECONDS).toEqual({ exercise: 600, cms: 1200 });
  });

  it('rejects files just over each limit', () => {
    expect(validateVideoAttachmentDuration('exercise', video(601))).toMatchObject({
      ok: false,
      code: 'video_duration_limit_exceeded',
      error: expect.stringContaining('10 минут'),
    });
    expect(validateVideoAttachmentDuration('cms', video(1201))).toMatchObject({
      ok: false,
      code: 'video_duration_limit_exceeded',
      error: expect.stringContaining('20 минут'),
    });
    expect(validateVideoAttachmentDuration('cms', video(601))).toEqual({ ok: true });
  });

  it('accepts the exact 600 and 1200 second boundaries', () => {
    expect(validateVideoAttachmentDuration('exercise', video(600))).toEqual({ ok: true });
    expect(validateVideoAttachmentDuration('cms', video(1200))).toEqual({ ok: true });
  });

  it('waits for a trusted duration probe', () => {
    expect(validateVideoAttachmentDuration('exercise', video(null))).toMatchObject({
      ok: false,
      code: 'video_duration_pending',
    });
  });

  it('leaves non-video media outside the duration gate', () => {
    expect(
      validateVideoAttachmentDuration('exercise', { ...video(3600), kind: 'image' }),
    ).toEqual({ ok: true });
  });
});
