import type { DbPort } from '../../../kernel/contracts/index.js';
import { findByIdentityByPhone } from './channelUsers.js';
import { getChannelBindingLinkData } from './platformUserByChannel.js';

export async function lookupUser(db: DbPort, resource: string, by: string, value: string) {
  if (by === 'phone') return findByIdentityByPhone(db, value, resource);
  if (by === 'channelId' || by === 'externalId') {
    return getChannelBindingLinkData(db, { channelCode: resource, externalId: value });
  }
  return null;
}

export async function findUserByPhone(db: DbPort, phoneNormalized: string) {
  return findByIdentityByPhone(db, phoneNormalized, 'telegram');
}

export async function findUserByChannelId(db: DbPort, channelId: string) {
  return getChannelBindingLinkData(db, { channelCode: 'telegram', externalId: channelId });
}
