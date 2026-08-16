import { describe, expect, it, vi } from 'vitest';
import type { ContentPageRow, ContentPagesPort } from './ports';
import { createContentCatalogResolver } from './service';

const MEDIA_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_PAGE: ContentPageRow = {
  id: 'page-1',
  organizationId: '22222222-2222-4222-8222-222222222222',
  section: 'articles',
  slug: 'recovery',
  title: 'Восстановление',
  summary: 'CMS summary',
  bodyMd: 'CMS body',
  bodyHtml: '',
  sortOrder: 0,
  isPublished: true,
  requiresAuth: false,
  videoUrl: null,
  videoType: null,
  imageUrl: `/api/media/${MEDIA_ID}`,
  archivedAt: null,
  deletedAt: null,
  linkedCourseId: null,
};

function contentPagesWith(row: ContentPageRow): ContentPagesPort {
  return {
    listBySection: vi.fn().mockResolvedValue([]),
    getBySlug: vi.fn().mockResolvedValue(row),
    getById: vi.fn().mockResolvedValue(null),
    listAll: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue(row.id),
    updateFull: vi.fn().mockResolvedValue(undefined),
    updateLifecycle: vi.fn().mockResolvedValue(undefined),
    reorderInSection: vi.fn().mockResolvedValue(undefined),
    countPagesWithSectionSlug: vi.fn().mockResolvedValue(0),
    listMetaByIds: vi.fn().mockResolvedValue([]),
  };
}

describe('content catalog patient media enrichment', () => {
  it('keeps the persisted CMS page and raw media URL when optional enrichment is denied', async () => {
    const loadMediaById = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('permission denied'), { code: '42501' }));
    const resolver = createContentCatalogResolver({
      contentPages: contentPagesWith(CONTENT_PAGE),
      loadMediaById,
    });

    const content = await resolver.getBySlug('recovery');

    expect(content).toMatchObject({
      slug: 'recovery',
      title: 'Восстановление',
      bodyText: 'CMS body',
      imageUrl: `/api/media/${MEDIA_ID}`,
    });
    expect(content).not.toHaveProperty('imageLibraryMedia');
    expect(loadMediaById).toHaveBeenCalledWith(MEDIA_ID);
  });

  it('attaches ready preview metadata for a patient CMS image', async () => {
    const loadMediaById = vi.fn().mockResolvedValue({
      id: MEDIA_ID,
      kind: 'image',
      mimeType: 'image/png',
      filename: 'recovery.png',
      size: 1024,
      createdAt: '2026-08-16T00:00:00.000Z',
      url: `/api/media/${MEDIA_ID}`,
      previewStatus: 'ready',
      previewSmUrl: `/api/media/${MEDIA_ID}/preview?size=sm`,
      previewMdUrl: `/api/media/${MEDIA_ID}/preview?size=md`,
    });
    const resolver = createContentCatalogResolver({
      contentPages: contentPagesWith(CONTENT_PAGE),
      loadMediaById,
    });

    await expect(resolver.getBySlug('recovery')).resolves.toMatchObject({
      slug: 'recovery',
      imageUrl: `/api/media/${MEDIA_ID}`,
      imageLibraryMedia: {
        id: MEDIA_ID,
        previewStatus: 'ready',
        previewSmUrl: `/api/media/${MEDIA_ID}/preview?size=sm`,
      },
    });
    expect(loadMediaById).toHaveBeenCalledWith(MEDIA_ID);
  });
});
