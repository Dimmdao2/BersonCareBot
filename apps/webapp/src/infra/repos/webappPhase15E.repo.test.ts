/** Wave 3 phase 15E — route tail repos + route thinness checks. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import {
  findPlatformUserIdWithEmailConflict,
  findPlatformUserIdWithPhoneConflict,
} from './pgAdminClientProfileConflicts';
import { mediaFolderExists } from './pgMediaFolderLookup';

describe('webappPhase15E repo SQL parity', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it('findPlatformUserIdWithEmailConflict queries platform_users email', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: 'other' }] });
    const id = await findPlatformUserIdWithEmailConflict(
      '550e8400-e29b-41d4-a716-446655440000',
      'user@example.com',
    );
    expect(id).toBe('other');
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain('lower(trim(email))');
  });

  it('findPlatformUserIdWithPhoneConflict queries platform_users phone_normalized', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const id = await findPlatformUserIdWithPhoneConflict(
      '550e8400-e29b-41d4-a716-446655440000',
      '+79001234567',
    );
    expect(id).toBeNull();
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain('phone_normalized');
  });

  it('mediaFolderExists checks media_folders by id', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: 'f1' }] });
    await expect(mediaFolderExists('550e8400-e29b-41d4-a716-446655440099')).resolves.toBe(true);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain('FROM media_folders');
  });
});
