import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerRuntimeInteger = vi.hoisted(() => vi.fn());

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getServerRuntimeInteger,
}));

import { getVideoPresignTtlSeconds } from './videoPresignTtl';

describe('getVideoPresignTtlSeconds', () => {
  beforeEach(() => {
    getServerRuntimeInteger.mockReset();
  });

  it('uses the server-only runtime projection', async () => {
    getServerRuntimeInteger.mockResolvedValue(7200);

    await expect(getVideoPresignTtlSeconds()).resolves.toBe(7200);
    expect(getServerRuntimeInteger).toHaveBeenCalledWith('video_presign_ttl_seconds');
  });
});
