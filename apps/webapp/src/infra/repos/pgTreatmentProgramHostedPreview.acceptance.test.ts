import { beforeEach, expect, it, vi } from 'vitest';

const getDrizzleMock = vi.hoisted(() => vi.fn());
const runWebappSqlMock = vi.hoisted(() => vi.fn());
const catalogMediaLadderLookupMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: getDrizzleMock }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => ({}),
  runWebappSql: runWebappSqlMock,
}));
vi.mock('@/infra/repos/catalogMediaLadderLookup', () => ({
  catalogMediaLadderLookup: catalogMediaLadderLookupMock,
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => '11111111-1111-4111-8111-111111111111',
}));
vi.mock('@/infra/repos/pgOrgEntitlements', () => ({
  createPgOrgEntitlementsPort: () => ({}),
}));
vi.mock('@/infra/db/drizzleMutationTx', () => ({ runDrizzleMutationTransaction: vi.fn() }));

import { createPgTreatmentProgramPort } from './pgTreatmentProgram';
import { withCurrentHostedVideoPreviewsInProgramSnapshot } from './pgTreatmentProgramItemSnapshot';

const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222';
const HOSTED_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const OUR_PREVIEW = '/api/media/33333333-3333-4333-8333-333333333333/preview/sm';

function selectQuery(terminal: 'orderBy' | 'groupBy', rows: readonly unknown[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    groupBy: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockImplementation(() =>
    terminal === 'orderBy' ? Promise.resolve(rows) : Promise.reject(new Error('unexpected orderBy')),
  );
  query.groupBy.mockImplementation(() =>
    terminal === 'groupBy' ? Promise.resolve(rows) : Promise.reject(new Error('unexpected groupBy')),
  );
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  const select = vi
    .fn()
    .mockReturnValueOnce(
      selectQuery('orderBy', [
        {
          id: TEMPLATE_ID,
          title: 'Шаблон с видео',
          description: null,
          status: 'published',
          createdBy: 'doctor-1',
          createdAt: '2026-08-27T00:00:00.000Z',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      ]),
    )
    .mockReturnValueOnce(selectQuery('groupBy', []))
    .mockReturnValueOnce(selectQuery('groupBy', []));
  getDrizzleMock.mockReturnValue({ select });
  runWebappSqlMock.mockResolvedValue({
    rows: [{ template_id: TEMPLATE_ID, preview_url: HOSTED_URL, preview_type: 'hosted_video' }],
  });
  catalogMediaLadderLookupMock.mockResolvedValue({
    get: (url: string) =>
      url === HOSTED_URL
        ? {
            previewSmUrl: OUR_PREVIEW,
            previewMdUrl: null,
            previewStatus: 'ready',
            standardRendition: true,
          }
        : undefined,
    size: 1,
  });
});

it('delivers the hosted cover through the common ladder in the doctor template list', async () => {
  const [template] = await createPgTreatmentProgramPort().listTemplates({
    includeArchived: false,
  });

  expect(catalogMediaLadderLookupMock).toHaveBeenCalledWith([HOSTED_URL]);
  expect(template?.listPreviewMedia).toEqual({
    mediaUrl: HOSTED_URL,
    mediaType: 'hosted_video',
    previewSmUrl: OUR_PREVIEW,
    previewStatus: 'ready',
    standardRendition: true,
  });
});

it('refreshes a pending hosted cover in an assigned patient program after the worker finishes', () => {
  const snapshot = {
    itemType: 'exercise',
    media: [
      {
        url: HOSTED_URL,
        type: 'hosted_video',
        previewSmUrl: null,
        previewStatus: 'pending',
      },
    ],
  };
  const refreshed = withCurrentHostedVideoPreviewsInProgramSnapshot(snapshot, {
    get: (url: string) =>
      url === HOSTED_URL
        ? {
            previewSmUrl: OUR_PREVIEW,
            previewMdUrl: null,
            previewStatus: 'ready',
            standardRendition: true,
          }
        : undefined,
    size: 1,
  });

  expect(refreshed.media).toEqual([
    {
      url: HOSTED_URL,
      type: 'hosted_video',
      previewSmUrl: OUR_PREVIEW,
      previewMdUrl: null,
      previewStatus: 'ready',
      standardRendition: true,
    },
  ]);
});
