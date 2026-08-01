import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getConfigValue: vi.fn(),
  getPublicRuntimeValue: vi.fn(),
  getPatientRuntimeBool: vi.fn(),
  getPatientRuntimeValue: vi.fn(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => fakes);

import { getAppDisplayTimeZone } from './appDisplayTimezone';
import { shouldExposeInteractiveLogin } from '@/modules/auth/messengerAuthStrategy';
import { getPatientMaintenanceConfig } from './patientMaintenance';
import { getSupportContactUrl } from './supportContactUrl';
import { getTelegramBotToken } from './integrationRuntime';
import {
  DEFAULT_DOCTOR_TODAY_PREFERENCES,
  parseDoctorTodayPreferences,
} from './doctorTodayPreferences';
import { parsePlatformIntegrationAvailabilityEnvelope } from './platformIntegrationAvailability';
import { isOptionalRuntimeSettingKey } from './runtimeConfig';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DB-backed product values', () => {
  it('reads the Telegram bot token from the database adapter', async () => {
    fakes.getConfigValue.mockResolvedValue('db-telegram-token');

    await expect(getTelegramBotToken()).resolves.toBe('db-telegram-token');
    expect(fakes.getConfigValue).toHaveBeenCalledWith('telegram_bot_token');
  });

  it('does not replace an empty support URL read from the database', async () => {
    fakes.getPublicRuntimeValue.mockResolvedValue('');

    await expect(getSupportContactUrl()).resolves.toBe('');
  });

  it('does not replace an empty maintenance message read from the database', async () => {
    fakes.getPatientRuntimeBool.mockResolvedValue(true);
    fakes.getPatientRuntimeValue.mockResolvedValue('');

    await expect(getPatientMaintenanceConfig()).resolves.toEqual({
      enabled: true,
      message: '',
      bookingUrl: null,
    });
  });

  it('refuses an invalid database timezone instead of substituting a compiled timezone', async () => {
    fakes.getPublicRuntimeValue.mockResolvedValue('not/a timezone');

    await expect(getAppDisplayTimeZone()).rejects.toThrow(
      'runtime_setting_unavailable:app_display_timezone',
    );
  });

  it('refuses missing or malformed platform integration availability', () => {
    expect(() => parsePlatformIntegrationAvailabilityEnvelope(undefined)).toThrow(
      'runtime_setting_unavailable:platform_integration_availability',
    );
    expect(() =>
      parsePlatformIntegrationAvailabilityEnvelope({ value: { version: 1, integrations: {} } }),
    ).toThrow('runtime_setting_unavailable:platform_integration_availability');
  });

  it('accepts absence only for the explicitly optional doctor preferences', () => {
    expect(isOptionalRuntimeSettingKey('doctor_today_preferences')).toBe(true);
    expect(parseDoctorTodayPreferences(undefined)).toBe(DEFAULT_DOCTOR_TODAY_PREFERENCES);
    expect(() => parseDoctorTodayPreferences({ value: { peopleListMode: 'unknown' } })).toThrow(
      'runtime_setting_unavailable:doctor_today_preferences',
    );
  });

  it('keeps the deployed auth bootstrap behavior without an environment switch', () => {
    expect(
      shouldExposeInteractiveLogin({
        isMessengerMiniAppEntry: false,
        initDataStatus: 'unknown',
        state: 'idle',
      }),
    ).toBe(false);
    expect(
      shouldExposeInteractiveLogin({
        isMessengerMiniAppEntry: false,
        initDataStatus: 'no',
        state: 'idle',
      }),
    ).toBe(true);
  });
});
