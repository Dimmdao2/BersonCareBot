import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';

const fetchPublicSystemSettingValueJson = vi.hoisted(() => vi.fn());

vi.mock('./publicSystemSettings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./publicSystemSettings.js')>();
  return { ...actual, fetchPublicSystemSettingValueJson };
});

import { isAuthChannelEnabled } from './authChannelPolicy.js';

const db = {} as DbPort;

describe('isAuthChannelEnabled', () => {
  beforeEach(() => {
    fetchPublicSystemSettingValueJson.mockReset();
  });

  it('reads a strict boolean envelope from canonical public settings', async () => {
    fetchPublicSystemSettingValueJson.mockResolvedValue({ value: false });

    await expect(isAuthChannelEnabled(db, 'telegram')).resolves.toBe(false);
    expect(fetchPublicSystemSettingValueJson).toHaveBeenCalledWith(
      db,
      'auth_telegram_enabled',
      'admin',
    );
  });

  it('uses the same defaults as webapp for missing or invalid values', async () => {
    fetchPublicSystemSettingValueJson.mockResolvedValue({ value: 'false' });

    await expect(isAuthChannelEnabled(db, 'email')).resolves.toBe(true);
    await expect(isAuthChannelEnabled(db, 'sms')).resolves.toBe(false);
  });

  it('falls back to the channel default when the settings read fails', async () => {
    fetchPublicSystemSettingValueJson.mockRejectedValue(new Error('db unavailable'));

    await expect(isAuthChannelEnabled(db, 'max')).resolves.toBe(true);
  });
});
