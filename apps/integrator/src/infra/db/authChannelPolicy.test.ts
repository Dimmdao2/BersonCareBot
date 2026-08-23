import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { getCurrentDatabasePrincipal } from '../principal/organizationPrincipal.js';
import { isAuthChannelEnabled } from './authChannelPolicy.js';

function channelDb(valueJson: unknown | null): DbPort {
  return {
    query: vi
      .fn()
      .mockResolvedValue(valueJson === null ? { rows: [] } : { rows: [{ value_json: valueJson }] }),
    tx: vi.fn(),
  } as unknown as DbPort;
}

function failingDb(error: Error): DbPort {
  return {
    query: vi.fn().mockRejectedValue(error),
    tx: vi.fn(),
  } as unknown as DbPort;
}

describe('isAuthChannelEnabled', () => {
  it('дано: signed M2M вызов без principal → fixed-key read получает exact service principal', async () => {
    const observed: unknown[] = [];
    const db = {
      query: vi.fn().mockImplementation(async () => {
        observed.push(getCurrentDatabasePrincipal());
        return { rows: [{ value_json: { value: true } }] };
      }),
      tx: vi.fn(),
    } as unknown as DbPort;

    await expect(isAuthChannelEnabled(db, 'email')).resolves.toBe(true);
    expect(observed).toEqual([
      expect.objectContaining({
        kind: 'infra',
        source: 'integrator-server-runtime-config',
      }),
    ]);
    expect(getCurrentDatabasePrincipal()).toBeUndefined();
  });

  it('дано: явный true (boolean или строка) → тогда канал включён', async () => {
    await expect(isAuthChannelEnabled(channelDb({ value: true }), 'email')).resolves.toBe(true);
    await expect(isAuthChannelEnabled(channelDb({ value: 'true' }), 'telegram')).resolves.toBe(
      true,
    );
  });

  it('дано: настройка отсутствует → тогда канал считается выключенным (безопасный дефолт)', async () => {
    await expect(isAuthChannelEnabled(channelDb(null), 'email')).resolves.toBe(false);
    await expect(isAuthChannelEnabled(channelDb(null), 'telegram')).resolves.toBe(false);
    await expect(isAuthChannelEnabled(channelDb(null), 'max')).resolves.toBe(false);
  });

  it('дано: явный false → тогда канал выключен', async () => {
    await expect(isAuthChannelEnabled(channelDb({ value: false }), 'email')).resolves.toBe(false);
  });

  it('дано: нечитаемое/чужеродное значение → тогда канал выключен, а не включён по умолчанию для канала', async () => {
    await expect(isAuthChannelEnabled(channelDb({ value: 'yes' }), 'email')).resolves.toBe(false);
    await expect(isAuthChannelEnabled(channelDb({ value: {} }), 'max')).resolves.toBe(false);
    await expect(isAuthChannelEnabled(channelDb({}), 'telegram')).resolves.toBe(false);
  });

  it('дано: чтение падает (denied/unreachable) → тогда канал выключен, а не включён по умолчанию', async () => {
    await expect(
      isAuthChannelEnabled(failingDb(new Error('permission denied for function')), 'email'),
    ).resolves.toBe(false);
  });
});
