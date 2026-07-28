import { describe, expect, it, vi } from 'vitest';
import { readPipelineEnabled } from './pipelineEnabled.js';

describe('readPipelineEnabled', () => {
  it('false when missing row', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as import('pg').Pool;
    await expect(readPipelineEnabled(pool)).resolves.toBe(false);
  });

  it('true when value_json.value is true', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ value_json: { value: true } }] }),
    } as unknown as import('pg').Pool;
    await expect(readPipelineEnabled(pool)).resolves.toBe(true);
  });

  it('reads through the closed media-worker runtime accessor', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as import('pg').Pool;
    await readPipelineEnabled(pool);
    const text = String(query.mock.calls[0]?.[0] ?? '');
    expect(text).toBe('SELECT app.read_media_worker_runtime_setting($1) AS value_json');
    expect(text).not.toContain('public.app_runtime_settings');
    expect(text).not.toContain('public.system_settings');
    expect(query.mock.calls[0]?.[1]).toEqual(['video_hls_pipeline_enabled']);
  });
});
