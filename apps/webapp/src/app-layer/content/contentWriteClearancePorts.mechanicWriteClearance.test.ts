import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { inMemoryContentPagesPort } from '@/infra/repos/pgContentPages';
import { inMemoryContentSectionsPort } from '@/infra/repos/pgContentSections';
import { wrapContentPagesPortWithWriteClearance } from './contentWriteClearancePorts';

describe('content pages port — 3.2 physical door (cms_pages)', () => {
  it('refuses upsert when no cms_pages mutation decision ran first', async () => {
    const sectionsPort = {
      ...inMemoryContentSectionsPort,
      getBySlug: vi.fn(async () => ({
        id: 'section-1',
        organizationId: null,
        slug: 'articles',
        title: 'Статьи',
        description: '',
        sortOrder: 0,
        isVisible: true,
        requiresAuth: false,
        coverImageUrl: null,
        iconImageUrl: null,
        kind: 'article' as const,
        systemParentCode: null,
      })),
    };
    const port = wrapContentPagesPortWithWriteClearance(
      inMemoryContentPagesPort,
      sectionsPort,
      assertMechanicWriteClearance,
    );
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        port.upsert({
          section: 'articles',
          slug: 'test-page',
          title: 'Тест',
          summary: '',
          bodyMd: 'body',
          bodyHtml: '',
          sortOrder: 0,
          isPublished: true,
          requiresAuth: false,
          videoUrl: null,
          videoType: null,
          imageUrl: null,
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
  });

  it('proceeds once the mutation guard cleared cms_pages for this continuation', async () => {
    const sectionsPort = {
      ...inMemoryContentSectionsPort,
      getBySlug: vi.fn(async () => ({
        id: 'section-1',
        organizationId: null,
        slug: 'articles',
        title: 'Статьи',
        description: '',
        sortOrder: 0,
        isVisible: true,
        requiresAuth: false,
        coverImageUrl: null,
        iconImageUrl: null,
        kind: 'article' as const,
        systemParentCode: null,
      })),
    };
    const upsert = vi.fn(async () => 'page-id-1');
    const port = wrapContentPagesPortWithWriteClearance(
      { ...inMemoryContentPagesPort, upsert },
      sectionsPort,
      assertMechanicWriteClearance,
    );
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('cms_pages');
      const id = await port.upsert({
        section: 'articles',
        slug: 'test-page',
        title: 'Тест',
        summary: '',
        bodyMd: 'body',
        bodyHtml: '',
        sortOrder: 0,
        isPublished: true,
        requiresAuth: false,
        videoUrl: null,
        videoType: null,
        imageUrl: null,
      });
      expect(id).toBe('page-id-1');
    });
    expect(upsert).toHaveBeenCalledOnce();
  });
});
