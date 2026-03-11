import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import * as channelUsers from './channelUsers.js';
import { lookupUser } from './userLookup.js';

describe('userLookup', () => {
  it('returns null when no identity exists for resource (e.g. smsc)', async () => {
    const db: DbPort = {
      query: vi.fn(),
      tx: vi.fn(),
    };

    const result = await lookupUser(db, 'smsc', 'phone', '+79990001122');
    expect(result).toBeNull();
  });

  it('delegates phone lookups to findByIdentityByPhone and channelId to getLinkDataByIdentity', async () => {
    const db: DbPort = {
      query: vi.fn(),
      tx: vi.fn(),
    };

    const findByIdentityByPhoneSpy = vi.spyOn(channelUsers, 'findByIdentityByPhone').mockResolvedValue({
      chatId: 123,
      channelId: '123',
      username: 'alice',
    });
    const getLinkDataByIdentitySpy = vi.spyOn(channelUsers, 'getLinkDataByIdentity').mockResolvedValue({
      userId: 'user-uuid-1',
      chatId: 123,
      channelId: '123',
      username: 'alice',
      phoneNormalized: '+79990001122',
      userState: 'idle',
    });

    const byPhone = await lookupUser(db, 'channel', 'phone', '+79990001122');
    const byChannel = await lookupUser(db, 'telegram', 'channelId', '123');

    expect(byPhone).toEqual({ chatId: 123, channelId: '123', username: 'alice' });
    expect(byChannel).toEqual({
      userId: 'user-uuid-1',
      chatId: 123,
      channelId: '123',
      username: 'alice',
      phoneNormalized: '+79990001122',
      userState: 'idle',
    });
    expect(findByIdentityByPhoneSpy).toHaveBeenCalledWith(db, '+79990001122', 'channel');
    expect(getLinkDataByIdentitySpy).toHaveBeenCalledWith(db, 'telegram', '123');
  });
});
