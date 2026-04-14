import { describe, expect, it, vi } from 'vitest';
import type { DbReadPort, DeliveryTargetsPort } from '../../kernel/contracts/index.js';
import { createContextQueryPort } from './contextQueryPort.js';

function createReadPortMock() {
  const readDb = vi.fn();
  return {
    readPort: { readDb } as unknown as DbReadPort,
    readDb,
  };
}

describe('contextQueryPort', () => {
  it('uses deliveryTargetsPort for channel.lookupByPhone and does not call readPort user.lookup', async () => {
    const { readPort, readDb } = createReadPortMock();
    const getTargetsByPhone = vi.fn().mockResolvedValue({ telegramId: '12345', maxId: 'max-1' });
    const deliveryTargetsPort: DeliveryTargetsPort = { getTargetsByPhone, getTargetsByChannelBinding: vi.fn() };

    const port = createContextQueryPort({
      readPort,
      getWebappBaseUrl: async () => null,
      deliveryTargetsPort,
    });

    const result = await port.request({
      type: 'channel.lookupByPhone',
      phoneNormalized: '+79991234567',
      resource: 'telegram',
    }) as { type: string; item: { chatId?: number; channelId?: string } | null };

    expect(result.type).toBe('channel.lookupByPhone');
    expect(result.item).toEqual({ chatId: 12345, channelId: '12345', username: null });
    expect(getTargetsByPhone).toHaveBeenCalledWith('+79991234567');
    expect(readDb).not.toHaveBeenCalled();
  });

  it('uses deliveryTargetsPort for subscriptions.forUser and does not call readPort user.lookup', async () => {
    const { readPort, readDb } = createReadPortMock();
    const getTargetsByPhone = vi.fn().mockResolvedValue({ telegramId: '999', maxId: 'max-2' });
    const deliveryTargetsPort: DeliveryTargetsPort = { getTargetsByPhone, getTargetsByChannelBinding: vi.fn() };

    const port = createContextQueryPort({
      readPort,
      getWebappBaseUrl: async () => null,
      deliveryTargetsPort,
    });

    const result = await port.request({
      type: 'subscriptions.forUser',
      userId: '+79990001122',
    }) as { type: string; items: unknown[] };

    expect(result.type).toBe('subscriptions.forUser');
    expect(result.items).toHaveLength(2);
    expect((result.items as Array<{ channelId: string }>).map((i) => i.channelId)).toContain('999');
    expect(getTargetsByPhone).toHaveBeenCalledWith('+79990001122');
    expect(readDb).not.toHaveBeenCalled();
  });

  it('returns item null for channel.lookupByPhone when deliveryTargetsPort is missing (no legacy read)', async () => {
    const { readPort, readDb } = createReadPortMock();
    const port = createContextQueryPort({
      readPort,
      getWebappBaseUrl: async () => null,
      deliveryTargetsPort: null,
    });

    const result = await port.request({
      type: 'channel.lookupByPhone',
      phoneNormalized: '+79991234567',
      resource: 'telegram',
    }) as { type: string; item: unknown };

    expect(result.type).toBe('channel.lookupByPhone');
    expect(result.item).toBeNull();
    expect(readDb).not.toHaveBeenCalled();
  });

  it('returns empty items for subscriptions.forUser when deliveryTargetsPort is missing (no legacy read)', async () => {
    const { readPort, readDb } = createReadPortMock();
    const port = createContextQueryPort({
      readPort,
      getWebappBaseUrl: async () => null,
      deliveryTargetsPort: null,
    });

    const result = await port.request({
      type: 'subscriptions.forUser',
      userId: '+79990001122',
    }) as { type: string; items: unknown[] };

    expect(result.type).toBe('subscriptions.forUser');
    expect(result.items).toEqual([]);
    expect(readDb).not.toHaveBeenCalled();
  });
});
