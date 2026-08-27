import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dbFakes = vi.hoisted(() => ({
  getDrizzle: vi.fn(),
  rows: [] as Record<string, unknown>[],
  where: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: dbFakes.getDrizzle,
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => '44444444-4444-4444-8444-444444444444',
}));

import { catalogMediaLadderLookup } from './catalogMediaLadderLookup';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const COVER_ID = '33333333-3333-4333-8333-333333333333';
const URL_A = `/api/media/${ID_A}`;
const URL_B = `/api/media/${ID_B}`;
const YOUTUBE_CANONICAL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function fileRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    hostedVideoSourceUrl: null,
    previewSmKey: null,
    previewMdKey: null,
    previewStatus: 'pending',
    standardRenditionAt: null,
    ...over,
  };
}

function queryParams(): unknown[] {
  const condition = dbFakes.where.mock.calls[0]?.[0];
  if (!condition) return [];
  return new PgDialect().sqlToQuery(condition).params;
}

describe('catalogMediaLadderLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbFakes.rows = [];
    const query = {
      from: vi.fn(),
      where: dbFakes.where,
    };
    query.from.mockReturnValue(query);
    dbFakes.where.mockImplementation(async () => dbFakes.rows);
    dbFakes.getDrizzle.mockReturnValue({ select: vi.fn(() => query) });
  });

  it('returns an empty ladder without querying when nothing resolvable was asked for', async () => {
    const out = await catalogMediaLadderLookup([]);
    expect(out.size).toBe(0);
    expect(dbFakes.getDrizzle).not.toHaveBeenCalled();
  });

  it('reports the rendition ladder facts for each stored file it finds', async () => {
    dbFakes.rows = [
      fileRow(ID_A, {
        previewSmKey: 'k-sm',
        previewMdKey: 'k-md',
        previewStatus: 'ready',
        standardRenditionAt: '2026-08-27T00:00:00.000Z',
      }),
      fileRow(ID_B),
    ];

    const out = await catalogMediaLadderLookup([URL_A, URL_B]);

    expect(out.get(URL_A)).toEqual({
      previewSmUrl: `/api/media/${ID_A}/preview/sm`,
      previewMdUrl: `/api/media/${ID_A}/preview/md`,
      previewStatus: 'ready',
      standardRendition: true,
    });
    expect(out.get(URL_B)).toEqual({
      previewSmUrl: null,
      previewMdUrl: null,
      previewStatus: 'pending',
      standardRendition: false,
    });
  });

  it('does not invent an entry for a file the query did not return (row deleted mid-flight)', async () => {
    const out = await catalogMediaLadderLookup([URL_A]);
    expect(out.get(URL_A)).toBeUndefined();
  });

  it('asks for each stored file once, however many times the page mentions it', async () => {
    dbFakes.rows = [fileRow(ID_A, { previewStatus: 'failed' })];

    const out = await catalogMediaLadderLookup([URL_A, URL_A.toUpperCase(), URL_A]);

    expect(out.size).toBe(1);
    expect(out.get(URL_A)?.previewStatus).toBe('failed');
    expect(queryParams().filter((value) => value === ID_A)).toHaveLength(1);
  });

  /**
   * Владелец: «картинку скачиваем один раз и кладём в НАШЕ хранилище». Наружу из этой двери
   * уходит только наш `/api/media/{id}/preview/{size}` — адрес картинки на чужом хосте не
   * появляется здесь ни в каком виде.
   */
  describe('ссылка на видеохостинг', () => {
    it('отдаёт НАШ адрес обложки, скачанной для этой ссылки', async () => {
      dbFakes.rows = [
        {
          id: COVER_ID,
          hostedVideoSourceUrl: YOUTUBE_CANONICAL,
          previewSmKey: 'previews/sm/x.jpg',
          previewMdKey: 'previews/md/x.jpg',
          previewStatus: 'ready',
          standardRenditionAt: '2026-08-27T00:00:00.000Z',
        },
      ];

      const out = await catalogMediaLadderLookup([YOUTUBE_CANONICAL]);
      const row = out.get(YOUTUBE_CANONICAL);

      expect(row?.previewStatus).toBe('ready');
      expect(row?.previewSmUrl).toBe(`/api/media/${COVER_ID}/preview/sm`);
      expect(row?.previewMdUrl).toBe(`/api/media/${COVER_ID}/preview/md`);
      expect(JSON.stringify(row)).not.toContain('youtube');
      expect(JSON.stringify(row)).not.toContain('ytimg');
    });

    it('ищет обложку по каноническому виду ссылки, а не по тому, что вставил врач', async () => {
      await catalogMediaLadderLookup([
        'https://youtu.be/dQw4w9WgXcQ?t=90&utm_source=tg',
        YOUTUBE_CANONICAL,
      ]);

      expect(queryParams().filter((value) => value === YOUTUBE_CANONICAL)).toHaveLength(1);
    });

    it('без строки обложки говорит «превью не создаётся», а не «готовится»', async () => {
      const out = await catalogMediaLadderLookup([YOUTUBE_CANONICAL]);

      expect(out.get(YOUTUBE_CANONICAL)).toEqual({
        previewSmUrl: null,
        previewMdUrl: null,
        previewStatus: 'skipped',
        standardRendition: false,
      });
    });

    it('обложка, которая ещё качается, остаётся «готовится»', async () => {
      dbFakes.rows = [
        {
          id: COVER_ID,
          hostedVideoSourceUrl: YOUTUBE_CANONICAL,
          previewSmKey: null,
          previewMdKey: null,
          previewStatus: 'pending',
          standardRenditionAt: null,
        },
      ];

      const out = await catalogMediaLadderLookup([YOUTUBE_CANONICAL]);
      expect(out.get(YOUTUBE_CANONICAL)?.previewStatus).toBe('pending');
      expect(out.get(YOUTUBE_CANONICAL)?.previewSmUrl).toBeNull();
    });

    it('обложки соседней клиники не подставляются: запрос ограничен организацией принципала', async () => {
      await catalogMediaLadderLookup([YOUTUBE_CANONICAL]);
      expect(queryParams()).toContain('44444444-4444-4444-8444-444444444444');
    });

    it('ссылка на неизвестный хост не превращается в запрос', async () => {
      const out = await catalogMediaLadderLookup(['https://evil.example/watch?v=1']);
      expect(out.get('https://evil.example/watch?v=1')).toBeUndefined();
      expect(dbFakes.getDrizzle).not.toHaveBeenCalled();
    });

    it('файлы и ссылки на одной странице разбираются одним запросом', async () => {
      await catalogMediaLadderLookup([URL_A, YOUTUBE_CANONICAL]);
      expect(dbFakes.getDrizzle).toHaveBeenCalledTimes(1);
      expect(dbFakes.where).toHaveBeenCalledTimes(1);
    });
  });
});
