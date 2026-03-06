import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import * as channelUsers from './channelUsers.js';
import { lookupUser } from './userLookup.js';

describe('userLookup', () => {
  it('returns null for unsupported resource', async () => {
    const db: DbPort = {
      query: vi.fn(),
      tx: vi.fn(),
    };

    const result = await lookupUser(db, 'smsc', 'phone', '+79990001122');
    expect(result).toBeNull();
  });

  it('delegates phone/channel lookups for telegram/channel resources', async () => {
    const db: DbPort = {
      query: vi.fn(),
      tx: vi.fn(),
    };

    const findByPhoneSpy = vi.spyOn(channelUsers, 'findByPhone').mockResolvedValue({
      chatId: 123,
      channelId: '123',
      username: 'alice',
    });
    const getUserLinkDataSpy = vi.spyOn(channelUsers, 'getUserLinkData').mockResolvedValue({
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
      chatId: 123,
      channelId: '123',
      username: 'alice',
      phoneNormalized: '+79990001122',
      userState: 'idle',
    });
    expect(findByPhoneSpy).toHaveBeenCalledWith(db, '+79990001122');
    expect(getUserLinkDataSpy).toHaveBeenCalledWith(db, '123');
  });
});
