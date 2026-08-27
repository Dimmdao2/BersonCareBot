import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
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
    hosted_video_source_url: null,
    preview_sm_key: null,
    preview_md_key: null,
    preview_status: 'pending',
    standard_rendition: false,
    ...over,
  };
}

describe('catalogMediaLadderLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty ladder without querying when nothing resolvable was asked for', async () => {
    const out = await catalogMediaLadderLookup([]);
    expect(out.size).toBe(0);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it('reports the rendition ladder facts for each stored file it finds', async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [
        fileRow(ID_A, {
          preview_sm_key: 'k-sm',
          preview_md_key: 'k-md',
          preview_status: 'ready',
          standard_rendition: true,
        }),
        fileRow(ID_B),
      ],
    });

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
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    const out = await catalogMediaLadderLookup([URL_A]);
    expect(out.get(URL_A)).toBeUndefined();
  });

  it('asks for each stored file once, however many times the page mentions it', async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [fileRow(ID_A, { preview_status: 'failed' })],
    });

    const out = await catalogMediaLadderLookup([URL_A, URL_A.toUpperCase(), URL_A]);

    expect(out.size).toBe(1);
    expect(out.get(URL_A)?.previewStatus).toBe('failed');
    const [, values] = runWebappPgTextMock.mock.calls[0] as [string, unknown[]];
    expect(values[0]).toEqual([ID_A]);
  });

  /**
   * Владелец: «картинку скачиваем один раз и кладём в НАШЕ хранилище». Наружу из этой двери
   * уходит только наш `/api/media/{id}/preview/{size}` — адрес картинки на чужом хосте не
   * появляется здесь ни в каком виде.
   */
  describe('ссылка на видеохостинг', () => {
    it('отдаёт НАШ адрес обложки, скачанной для этой ссылки', async () => {
      runWebappPgTextMock.mockResolvedValue({
        rows: [
          {
            id: COVER_ID,
            hosted_video_source_url: YOUTUBE_CANONICAL,
            preview_sm_key: 'previews/sm/x.jpg',
            preview_md_key: 'previews/md/x.jpg',
            preview_status: 'ready',
            standard_rendition: true,
          },
        ],
      });

      const out = await catalogMediaLadderLookup([YOUTUBE_CANONICAL]);
      const row = out.get(YOUTUBE_CANONICAL);

      expect(row?.previewStatus).toBe('ready');
      expect(row?.previewSmUrl).toBe(`/api/media/${COVER_ID}/preview/sm`);
      expect(row?.previewMdUrl).toBe(`/api/media/${COVER_ID}/preview/md`);
      expect(JSON.stringify(row)).not.toContain('youtube');
      expect(JSON.stringify(row)).not.toContain('ytimg');
    });

    it('ищет обложку по каноническому виду ссылки, а не по тому, что вставил врач', async () => {
      runWebappPgTextMock.mockResolvedValue({ rows: [] });

      await catalogMediaLadderLookup([
        'https://youtu.be/dQw4w9WgXcQ?t=90&utm_source=tg',
        YOUTUBE_CANONICAL,
      ]);

      const [, values] = runWebappPgTextMock.mock.calls[0] as [string, unknown[]];
      expect(values[1]).toEqual([YOUTUBE_CANONICAL]);
    });

    it('без строки обложки говорит «превью не создаётся», а не «готовится»', async () => {
      runWebappPgTextMock.mockResolvedValue({ rows: [] });

      const out = await catalogMediaLadderLookup([YOUTUBE_CANONICAL]);

      expect(out.get(YOUTUBE_CANONICAL)).toEqual({
        previewSmUrl: null,
        previewMdUrl: null,
        previewStatus: 'skipped',
        standardRendition: false,
      });
    });

    it('обложка, которая ещё качается, остаётся «готовится»', async () => {
      runWebappPgTextMock.mockResolvedValue({
        rows: [
          {
            id: COVER_ID,
            hosted_video_source_url: YOUTUBE_CANONICAL,
            preview_sm_key: null,
            preview_md_key: null,
            preview_status: 'pending',
            standard_rendition: false,
          },
        ],
      });

      const out = await catalogMediaLadderLookup([YOUTUBE_CANONICAL]);
      expect(out.get(YOUTUBE_CANONICAL)?.previewStatus).toBe('pending');
      expect(out.get(YOUTUBE_CANONICAL)?.previewSmUrl).toBeNull();
    });

    it('обложки соседней клиники не подставляются: запрос ограничен организацией принципала', async () => {
      runWebappPgTextMock.mockResolvedValue({ rows: [] });
      await catalogMediaLadderLookup([YOUTUBE_CANONICAL]);
      const [text] = runWebappPgTextMock.mock.calls[0] as [string, unknown[]];
      expect(text).toContain('organization_id');
    });

    it('ссылка на неизвестный хост не превращается в запрос', async () => {
      const out = await catalogMediaLadderLookup(['https://evil.example/watch?v=1']);
      expect(out.get('https://evil.example/watch?v=1')).toBeUndefined();
      expect(runWebappPgTextMock).not.toHaveBeenCalled();
    });

    it('файлы и ссылки на одной странице разбираются одним запросом', async () => {
      runWebappPgTextMock.mockResolvedValue({ rows: [] });
      await catalogMediaLadderLookup([URL_A, YOUTUBE_CANONICAL]);
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    });
  });
});
