import { findByPhone, getTelegramUserLinkData } from './telegramUsers.js';

type LookupResource = 'telegram';

type LookupBy = 'phone' | 'telegramId';

export async function lookupUser(resource: string, by: string, value: string) {
  if (resource !== 'telegram') return null;
  if (by === 'phone') return findByPhone(value);
  if (by === 'telegramId') return getTelegramUserLinkData(value);
  return null;
}

export async function findUserByPhone(phoneNormalized: string) {
  return findByPhone(phoneNormalized);
}

export async function findUserByChannelId(resource: string, channelId: string) {
  if (resource !== 'telegram') return null;
  return getTelegramUserLinkData(channelId);
}
