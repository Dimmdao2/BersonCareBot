import { describe, expect, it } from 'vitest';
import { createChannelPreferencesService } from './service';
import type { ChannelPreferencesPort } from './ports';
import type { ChannelCode, ChannelPreference } from './types';

function fakePort(overrides: Partial<ChannelPreferencesPort> = {}): ChannelPreferencesPort {
  return {
    async getPreferences(): Promise<ChannelPreference[]> {
      return [];
    },
    async upsertPreference(params) {
      return {
        channelCode: params.channelCode,
        isEnabledForMessages: params.isEnabledForMessages,
        isEnabledForNotifications: params.isEnabledForNotifications,
        isPreferredForAuth: false,
      };
    },
    async getBroadcastNotificationFlagsBatch() {
      return new Map();
    },
    async getPreferredAuthChannelCode() {
      return null;
    },
    async setPreferredAuthChannel() {},
    async getDefaultAuthOtpChannel() {
      return null;
    },
    ...overrides,
  };
}

describe('resolveAuthOtpChannel', () => {
  it('prefers the explicit saved preference over the computed default', async () => {
    const service = createChannelPreferencesService(
      fakePort({
        async getPreferredAuthChannelCode(): Promise<ChannelCode | null> {
          return 'max';
        },
        async getDefaultAuthOtpChannel() {
          return 'telegram';
        },
      }),
    );

    await expect(service.resolveAuthOtpChannel('user-1')).resolves.toBe('max');
  });

  it('falls back to the computed default (first-verified channel) when no explicit preference exists', async () => {
    const service = createChannelPreferencesService(
      fakePort({
        async getPreferredAuthChannelCode() {
          return null;
        },
        async getDefaultAuthOtpChannel() {
          return 'telegram';
        },
      }),
    );

    await expect(service.resolveAuthOtpChannel('user-1')).resolves.toBe('telegram');
  });

  it('returns null when neither an explicit preference nor a computed default exist', async () => {
    const service = createChannelPreferencesService(fakePort());

    await expect(service.resolveAuthOtpChannel('user-1')).resolves.toBeNull();
  });

  it('ignores an explicit preference on a channel not allowed for auth (e.g. vk) and falls back to default', async () => {
    const service = createChannelPreferencesService(
      fakePort({
        async getPreferredAuthChannelCode(): Promise<ChannelCode | null> {
          return 'vk';
        },
        async getDefaultAuthOtpChannel() {
          return 'email';
        },
      }),
    );

    await expect(service.resolveAuthOtpChannel('user-1')).resolves.toBe('email');
  });
});
