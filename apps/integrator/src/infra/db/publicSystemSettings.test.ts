import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import {
  fetchPublicSystemSettingValueJson,
  readPublicSystemSettingString,
} from './publicSystemSettings.js';

function makeDb(queryFn: DbPort['query']): DbPort {
  return { query: queryFn, tx: vi.fn() as unknown as DbPort['tx'] };
}

describe('publicSystemSettings', () => {
  it('reads global-only settings by default', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'https://example.test' } }],
      rowCount: 1,
    } as DbQueryResult<{ value_json: unknown }>);

    await expect(readPublicSystemSettingString(makeDb(query), 'app_base_url')).resolves.toBe('https://example.test');

    const sqlText = query.mock.calls[0]?.[0] as string | undefined;
    const params = query.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(sqlText).toContain('organization_id IS NULL');
    expect(sqlText).not.toContain('ORDER BY organization_id IS NULL ASC');
    expect(params).toEqual(['app_base_url', 'admin']);
  });

  it('reads org row before global fallback when organizationId is provided', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'org-value' } }],
      rowCount: 1,
    } as DbQueryResult<{ value_json: unknown }>);

    await expect(
      fetchPublicSystemSettingValueJson(makeDb(query), 'app_base_url', 'admin', {
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ).resolves.toEqual({ value: 'org-value' });

    const sqlText = query.mock.calls[0]?.[0] as string | undefined;
    const params = query.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(sqlText).toContain('organization_id = $3::uuid OR organization_id IS NULL');
    expect(sqlText).toContain('ORDER BY organization_id IS NULL ASC');
    expect(params).toEqual(['app_base_url', 'admin', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  });
});
