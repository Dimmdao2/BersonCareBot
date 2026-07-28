import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  env: {
    PLATFORM_OWNER_IDENTITY: 'dimmdao@gmail.com',
  },
}));

import {
  isVerifiedEmailGlobalAdminAsync,
  reconcileDbRoleWithEnvRole,
  resolveRoleAsync,
  resolveRoleFromEnv,
} from './envRole';

describe('resolveRoleFromEnv (C-4: no allowlist ever grants role anymore)', () => {
  it('always returns client, regardless of phone/telegram/max', () => {
    expect(resolveRoleFromEnv({ phone: '+79643805480' })).toBe('client');
    expect(resolveRoleFromEnv({ telegramId: '9001001001' })).toBe('client');
    expect(resolveRoleFromEnv({ maxId: 'max-admin-1' })).toBe('client');
    expect(resolveRoleFromEnv({})).toBe('client');
  });
});

describe('resolveRoleAsync (C-4: no allowlist ever grants role anymore)', () => {
  it('always resolves client without reading any DB list', async () => {
    await expect(resolveRoleAsync({ phone: '+79643805480' })).resolves.toBe('client');
    await expect(resolveRoleAsync({ telegramId: '9001001001' })).resolves.toBe('client');
    await expect(resolveRoleAsync({ maxId: 'max-admin-1' })).resolves.toBe('client');
  });
});

describe('reconcileDbRoleWithEnvRole', () => {
  it('preserves DB staff roles when the (now always-client) env source resolves client', () => {
    expect(reconcileDbRoleWithEnvRole('doctor', 'client')).toBe('doctor');
    expect(reconcileDbRoleWithEnvRole('admin', 'client')).toBe('admin');
    expect(reconcileDbRoleWithEnvRole('client', 'client')).toBe('client');
  });

  it('keeps admin as the strongest staff role if a promoting env source ever existed again', () => {
    expect(reconcileDbRoleWithEnvRole('doctor', 'admin')).toBe('admin');
    expect(reconcileDbRoleWithEnvRole('admin', 'doctor')).toBe('admin');
    expect(reconcileDbRoleWithEnvRole('client', 'doctor')).toBe('doctor');
    expect(reconcileDbRoleWithEnvRole('client', 'admin')).toBe('admin');
  });
});

describe('isVerifiedEmailGlobalAdminAsync (C-4: env-pinned identity only, admin_emails never read)', () => {
  it('is true only for the exact normalized env-pinned identity', async () => {
    await expect(isVerifiedEmailGlobalAdminAsync(' DimmDao@Gmail.com ')).resolves.toBe(true);
    await expect(isVerifiedEmailGlobalAdminAsync('dimmdao@gmail.com')).resolves.toBe(true);
  });

  it('THE NEGATIVE PROOF (C-4 regression test): an account whose address sits in a stale admin_emails DB value does not become admin — that value is never read', async () => {
    // Even a value that used to be the DB admin_emails allowlist grants nothing now.
    await expect(
      isVerifiedEmailGlobalAdminAsync('someone-in-stale-admin-emails@example.com'),
    ).resolves.toBe(false);
    await expect(isVerifiedEmailGlobalAdminAsync('other@example.com')).resolves.toBe(false);
  });

  it('fails closed on empty/missing input', async () => {
    await expect(isVerifiedEmailGlobalAdminAsync(undefined)).resolves.toBe(false);
    await expect(isVerifiedEmailGlobalAdminAsync('')).resolves.toBe(false);
    await expect(isVerifiedEmailGlobalAdminAsync('   ')).resolves.toBe(false);
  });
});

describe('isVerifiedEmailGlobalAdminAsync with no pin configured', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('fails closed when PLATFORM_OWNER_IDENTITY is unset', async () => {
    vi.doMock('@/config/env', () => ({ env: { PLATFORM_OWNER_IDENTITY: '' } }));
    const { isVerifiedEmailGlobalAdminAsync: isAdminWithNoPin } = await import('./envRole');
    await expect(isAdminWithNoPin('dimmdao@gmail.com')).resolves.toBe(false);
  });
});
