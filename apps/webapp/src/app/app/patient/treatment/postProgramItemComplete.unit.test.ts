import { afterEach, describe, expect, it, vi } from 'vitest';
import { postProgramItemComplete } from './postProgramItemComplete';

describe('postProgramItemComplete', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records completion metrics in the same append-only completion request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, item: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      perceivedDifficulty: 'medium' as const,
      reps: 10,
      sets: 3,
      weightKg: 7.5,
    };
    const result = await postProgramItemComplete({
      base: '/api/patient/treatment-program-instances/instance/items',
      itemId: 'item-id',
      payload,
    });

    expect(result).toEqual({ ok: true, item: null });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patient/treatment-program-instances/instance/items/item-id/progress/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
  });
});
