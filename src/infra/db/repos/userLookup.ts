import type { DbPort } from '../../../kernel/contracts/index.js';
import { findByPhone, getUserLinkData } from './channelUsers.js';

function isSupportedResource(resource: string): boolean {
  return resource === 'telegram' || resource === 'channel';
}

export async function lookupUser(db: DbPort, resource: string, by: string, value: string) {
  if (!isSupportedResource(resource)) return null;
  if (by === 'phone') return findByPhone(db, value);
  if (by === 'channelId') return getUserLinkData(db, value);
  return null;
}

export async function findUserByPhone(db: DbPort, phoneNormalized: string) {
  return findByPhone(db, phoneNormalized);
}

export async function findUserByChannelId(db: DbPort, channelId: string) {
  return getUserLinkData(db, channelId);
}
