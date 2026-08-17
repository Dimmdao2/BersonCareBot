import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  patchProgramItemCompletionMetrics,
  postProgramItemComplete,
} from './postProgramItemComplete';

describe('postProgramItemComplete', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records completion immediately without waiting for optional metrics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          item: null,
          completion: { id: 'completion-id', createdAt: '2026-08-17T10:00:00.000Z' },
        }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await postProgramItemComplete({
      base: '/api/patient/treatment-program-instances/instance/items',
      itemId: 'item-id',
    });

    expect(result).toEqual({
      ok: true,
      item: null,
      completion: { id: 'completion-id', createdAt: '2026-08-17T10:00:00.000Z' },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patient/treatment-program-instances/instance/items/item-id/progress/complete',
      {
        method: 'POST',
      },
    );
  });

  it('enriches the exact returned completion with PATCH and never posts another done event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const payload = { perceivedDifficulty: 'medium' as const, reps: 10, sets: 3, weightKg: 7.5 };
    expect(
      await patchProgramItemCompletionMetrics({
        base: '/api/patient/treatment-program-instances/instance/items',
        itemId: 'item-id',
        completionId: 'completion-id',
        payload,
      }),
    ).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patient/treatment-program-instances/instance/items/item-id/progress/complete/completion-id/metrics',
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
  });
});
