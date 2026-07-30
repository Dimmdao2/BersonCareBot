import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentPageRow } from '@/infra/repos/pgContentPages';
import type { ContentStubItem } from '@/modules/content-catalog/types';
import type { AppSession } from '@/shared/types/session';
import { PatientContentSlugArticle } from './PatientContentSlugArticle';

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string, scope: string) => Promise<null>>(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    systemSettings: {
      getSetting: mocks.getSetting,
    },
  }),
}));

const organizationId = '11111111-1111-4111-8111-111111111111';
const platformUserId = '22222222-2222-4222-8222-222222222222';

const session: AppSession = {
  user: {
    userId: platformUserId,
    role: 'client',
    displayName: 'Пациент',
    bindings: {},
  },
  issuedAt: 1,
  expiresAt: 2,
};

const dbRow: ContentPageRow = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId,
  section: 'warmups',
  slug: 'morning-warmup',
  title: 'Разминка',
  summary: '',
  bodyMd: '',
  bodyHtml: '',
  sortOrder: 0,
  isPublished: true,
  requiresAuth: true,
  videoUrl: null,
  videoType: null,
  imageUrl: null,
  archivedAt: null,
  deletedAt: null,
  linkedCourseId: null,
};

const item: ContentStubItem = {
  slug: dbRow.slug,
  title: dbRow.title,
  summary: '',
  bodyText: '',
};

describe('PatientContentSlugArticle', () => {
  beforeEach(() => {
    mocks.getSetting.mockReset();
  });

  it('reads authenticated patient settings under the selected organization principal', async () => {
    mocks.getSetting.mockImplementation(async () => {
      expect(getCurrentDbPrincipal()).toMatchObject({
        kind: 'patient',
        organizationId,
        platformUserId,
      });
      return null;
    });

    await expect(
      PatientContentSlugArticle({
        slug: dbRow.slug,
        session,
        organizationId,
        dbRow,
        item,
        personalTierOk: true,
        isDailyWarmup: true,
        practiceSource: 'daily_warmup',
        videoPlayableUrl: undefined,
        hostedVideoIframeSrc: null,
        apiMediaId: null,
        warmupNav: null,
        orderedDailyWarmupPages: [],
      }),
    ).resolves.toBeTruthy();
  });
});
