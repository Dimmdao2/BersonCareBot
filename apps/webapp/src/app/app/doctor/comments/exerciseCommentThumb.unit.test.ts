import { describe, expect, it } from 'vitest';
import { firstSnapshotMedia } from './exerciseCommentThumb';

describe('firstSnapshotMedia', () => {
  it('reads the current catalog media snapshot shape', () => {
    expect(
      firstSnapshotMedia({
        media: [
          {
            mediaUrl: '/api/media/current',
            mediaType: 'video',
            previewSmUrl: '/api/media/current/preview',
            previewStatus: 'ready',
            sortOrder: 2,
          },
        ],
      }),
    ).toMatchObject({
      url: '/api/media/current',
      mediaType: 'video',
      previewSmUrl: '/api/media/current/preview',
      previewStatus: 'ready',
    });
  });

  it('keeps reading the legacy exercise snapshot shape', () => {
    expect(
      firstSnapshotMedia({
        media: [{ url: '/api/media/legacy', type: 'image', sortOrder: 0 }],
      }),
    ).toMatchObject({
      url: '/api/media/legacy',
      mediaType: 'image',
    });
  });
});
