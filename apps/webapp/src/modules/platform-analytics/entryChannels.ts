/**
 * Разрез входа. `STAGE_01_ANALYTICS.md` §2 дословно: «Сайт vs приложение: `entry_channel`
 * browser vs pwa (мессенджеры — отдельно в том же разрезе, не прятать)». Поэтому telegram и max
 * НЕ складываются в «приложение» — у каждого своя величина. Значения совпадают с тем, что реально
 * лежит в `product_analytics_hourly.entry_channel` (pwa / browser / telegram / max).
 */
export const PLATFORM_ENTRY_CHANNELS = ['pwa', 'browser', 'telegram', 'max', 'other'] as const;

export type PlatformEntryChannel = (typeof PLATFORM_ENTRY_CHANNELS)[number];

export function platformEntryChannel(raw: string): PlatformEntryChannel {
  const value = raw.trim().toLowerCase();
  if (value === 'pwa' || value === 'browser' || value === 'telegram' || value === 'max') {
    return value;
  }
  return 'other';
}

export function emptyEntryChannelCounts(): Record<PlatformEntryChannel, number> {
  return { pwa: 0, browser: 0, telegram: 0, max: 0, other: 0 };
}
