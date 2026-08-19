import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { catalogMediaLadderLookup } from './catalogMediaLadderLookup';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

describe('catalogMediaLadderLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty map without querying when given no ids', async () => {
    const out = await catalogMediaLadderLookup([]);
    expect(out.size).toBe(0);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it('reports the rendition ladder facts for each row it finds', async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [
        {
          id: ID_A,
          preview_sm_key: 'k-sm',
          preview_md_key: 'k-md',
          preview_status: 'ready',
          standard_rendition: true,
        },
        {
          id: ID_B,
          preview_sm_key: null,
          preview_md_key: null,
          preview_status: 'pending',
          standard_rendition: false,
        },
      ],
    });

    const out = await catalogMediaLadderLookup([ID_A, ID_B]);

    expect(out.get(ID_A)).toEqual({
      previewSmUrl: `/api/media/${ID_A}/preview/sm`,
      previewMdUrl: `/api/media/${ID_A}/preview/md`,
      previewStatus: 'ready',
      standardRendition: true,
    });
    expect(out.get(ID_B)).toEqual({
      previewSmUrl: null,
      previewMdUrl: null,
      previewStatus: 'pending',
      standardRendition: false,
    });
  });

  it('does not invent an entry for an id the query did not return (row deleted mid-flight)', async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    const out = await catalogMediaLadderLookup([ID_A]);
    expect(out.has(ID_A)).toBe(false);
  });

  it('deduplicates repeated ids into a single lookup entry', async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [
        {
          id: ID_A,
          preview_sm_key: null,
          preview_md_key: null,
          preview_status: 'failed',
          standard_rendition: false,
        },
      ],
    });
    const out = await catalogMediaLadderLookup([ID_A, ID_A.toUpperCase(), ID_A]);
    expect(out.size).toBe(1);
    expect(out.get(ID_A)?.previewStatus).toBe('failed');
  });
});
