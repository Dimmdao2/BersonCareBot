import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPublicRuntimeValue = vi.fn<() => Promise<string>>();

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeValue: () => getPublicRuntimeValue(),
}));

/**
 * Что ловит: отказ от подстановки таймзоны. Значение стало памятью на запрос, и легко было бы
 * заодно «смягчить» его до значения по умолчанию — тогда клиника с пустой или испорченной
 * настройкой молча показывала бы записи в чужом времени вместо явного отказа.
 */
describe('getAppDisplayTimeZone', () => {
  beforeEach(() => {
    getPublicRuntimeValue.mockReset();
  });

  it('returns the stored IANA zone', async () => {
    const { getAppDisplayTimeZone } = await import('@/modules/system-settings/appDisplayTimezone');
    getPublicRuntimeValue.mockResolvedValue('  Asia/Yekaterinburg  ');
    await expect(getAppDisplayTimeZone()).resolves.toBe('Asia/Yekaterinburg');
  });

  it('refuses an unusable value instead of substituting a compiled default', async () => {
    const { getAppDisplayTimeZone } = await import('@/modules/system-settings/appDisplayTimezone');
    const { RuntimeSettingUnavailableError } = await import(
      '@/modules/system-settings/runtimeSettingUnavailable'
    );
    getPublicRuntimeValue.mockResolvedValue('   ');
    await expect(getAppDisplayTimeZone()).rejects.toBeInstanceOf(RuntimeSettingUnavailableError);
  });

  it('asks the runtime settings port again on the next request', async () => {
    const { getAppDisplayTimeZone } = await import('@/modules/system-settings/appDisplayTimezone');
    getPublicRuntimeValue.mockResolvedValue('Europe/Moscow');
    await getAppDisplayTimeZone();
    await getAppDisplayTimeZone();
    expect(getPublicRuntimeValue.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
