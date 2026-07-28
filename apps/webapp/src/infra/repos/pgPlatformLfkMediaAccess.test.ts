import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const getOrganizationIdMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({ runWebappPgText: runWebappPgTextMock }));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: getOrganizationIdMock,
}));

import { pgCanReadPlatformLfkMedia } from './pgPlatformLfkMediaAccess';

describe('pgCanReadPlatformLfkMedia', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    getOrganizationIdMock.mockReset();
    getOrganizationIdMock.mockReturnValue('a0000000-0000-4000-8000-000000000001');
  });

  it('fails closed without an organization principal', async () => {
    getOrganizationIdMock.mockReturnValue(null);
    await expect(
      pgCanReadPlatformLfkMedia('550e8400-e29b-41d4-a716-446655440000', true),
    ).resolves.toBe(false);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it('allows entitlement ON or an already assigned instance after downgrade', async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ allowed: true }] });
    const mediaId = '550e8400-e29b-41d4-a716-446655440000';
    await expect(pgCanReadPlatformLfkMedia(mediaId, false)).resolves.toBe(true);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('$2::boolean');
    expect(sql).toContain('treatment_program_instances');
    expect(sql).toContain('instance.organization_id = $3::uuid');
    expect(sql).toContain('app.read_platform_lfk_media_entitlement_refs($1::uuid)');
    expect(sql).not.toMatch(/\b(?:FROM|JOIN)\s+(?:public\.)?lfk_exercise_media\b/);
    expect(sql).not.toMatch(/\b(?:FROM|JOIN)\s+(?:public\.)?lfk_exercises\b/);
    expect(sql).not.toMatch(/\b(?:FROM|JOIN)\s+(?:public\.)?lfk_complex_templates\b/);
    expect(sql).not.toMatch(/\b(?:FROM|JOIN)\s+(?:public\.)?lfk_complex_template_exercises\b/);
    expect(sql).toContain('item.item_type = entitlement_ref.item_type');
    expect(sql).toContain('item.item_ref_id = entitlement_ref.item_ref_id');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      mediaId,
      false,
      'a0000000-0000-4000-8000-000000000001',
    ]);
  });
});
