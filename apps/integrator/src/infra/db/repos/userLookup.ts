import type { DbPort } from '../../../kernel/contracts/index.js';
import { findChannelBindingByPhone, getChannelBindingLinkData } from './platformUserByChannel.js';

export async function lookupUser(db: DbPort, resource: string, by: string, value: string) {
  if (by === 'phone') {
    return findChannelBindingByPhone(db, { channelCode: resource, phoneNormalized: value });
  }
  if (by === 'channelId' || by === 'externalId') {
    return getChannelBindingLinkData(db, { channelCode: resource, externalId: value });
  }
  return null;
}

export async function findUserByPhone(db: DbPort, phoneNormalized: string) {
  return findChannelBindingByPhone(db, {
    channelCode: 'telegram',
    phoneNormalized,
  });
}

export async function findUserByChannelId(db: DbPort, channelId: string) {
  return getChannelBindingLinkData(db, { channelCode: 'telegram', externalId: channelId });
}
