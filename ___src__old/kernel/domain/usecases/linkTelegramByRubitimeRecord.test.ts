import { describe, expect, it, vi } from 'vitest';
import { linkTelegramByRubitimeRecord } from './linkTelegramByRubitimeRecord.js';

function buildDeps(overrides?: Partial<Parameters<typeof linkTelegramByRubitimeRecord>[1]>) {
  return {
    adminTelegramId: '99999',
    getRecordByRubitimeId: vi.fn(async () => ({
      rubitimeRecordId: 'rec-1',
      phoneNormalized: '+79991234567',
      payloadJson: { name: 'Иван', service: 'Стрижка', record: '2025-02-24 14:00' },
      recordAt: new Date('2025-02-24T14:00:00Z'),
      status: 'created' as const,
    })),
    findTelegramUserByPhone: vi.fn(async () => null),
    getTelegramUserLinkData: vi.fn(async () => ({
      chatId: 12345,
      telegramId: '12345',
      username: 'user',
      phoneNormalized: null,
    })),
    setTelegramUserPhone: vi.fn(async () => undefined),
    setTelegramUserState: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('rubitime linking usecase', () => {
  it('links user when contact phone matches record phone', async () => {
    const deps = buildDeps();
    const actions = await linkTelegramByRubitimeRecord(
      {
        telegramId: '12345',
        chatId: 12345,
        username: 'user',
        rubitimeRecordId: 'rec-1',
        contactPhone: '+7 (999) 123-45-67',
      },
      deps,
    );

    expect(deps.setTelegramUserPhone).toHaveBeenCalledWith('12345', '+79991234567');
    expect(deps.setTelegramUserState).toHaveBeenCalledWith('12345', 'idle');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'sendMessage', chatId: 12345 });
  });

  it('rejects when record not found and notifies admin', async () => {
    const deps = buildDeps({
      getRecordByRubitimeId: vi.fn(async () => null),
    });
    const actions = await linkTelegramByRubitimeRecord(
      {
        telegramId: '12345',
        chatId: 12345,
        username: 'user',
        rubitimeRecordId: 'missing',
        contactPhone: '+79991234567',
      },
      deps,
    );

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'sendMessage', chatId: 12345 });
    expect(actions[1]).toMatchObject({ type: 'sendMessage', chatId: 99999 });
    expect(String((actions[1] as { text?: string }).text ?? '')).toContain('record not found');
  });

  it('rejects when phones mismatch and notifies admin', async () => {
    const deps = buildDeps({
      getRecordByRubitimeId: vi.fn(async () => ({
        rubitimeRecordId: 'rec-1',
        phoneNormalized: '+79990000000',
        payloadJson: {},
        recordAt: null,
        status: 'created' as const,
      })),
    });
    const actions = await linkTelegramByRubitimeRecord(
      {
        telegramId: '12345',
        chatId: 12345,
        username: 'user',
        rubitimeRecordId: 'rec-1',
        contactPhone: '+79991234567',
      },
      deps,
    );

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'sendMessage', chatId: 12345 });
    expect(actions[1]).toMatchObject({ type: 'sendMessage', chatId: 99999 });
    expect(String((actions[1] as { text?: string }).text ?? '')).toContain('phone mismatch');
  });

  it('rejects when phone already linked to another telegram user', async () => {
    const deps = buildDeps({
      findTelegramUserByPhone: vi.fn(async () => ({
        chatId: 77777,
        telegramId: '77777',
        username: 'another',
      })),
    });
    const actions = await linkTelegramByRubitimeRecord(
      {
        telegramId: '12345',
        chatId: 12345,
        username: 'user',
        rubitimeRecordId: 'rec-1',
        contactPhone: '+79991234567',
      },
      deps,
    );

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'sendMessage', chatId: 12345 });
    expect(actions[1]).toMatchObject({ type: 'sendMessage', chatId: 99999 });
    expect(String((actions[1] as { text?: string }).text ?? '')).toContain('phone already linked');
  });

  it('rejects when telegram user already has another phone', async () => {
    const deps = buildDeps({
      getTelegramUserLinkData: vi.fn(async () => ({
        chatId: 12345,
        telegramId: '12345',
        username: 'user',
        phoneNormalized: '+79990000000',
      })),
    });
    const actions = await linkTelegramByRubitimeRecord(
      {
        telegramId: '12345',
        chatId: 12345,
        username: 'user',
        rubitimeRecordId: 'rec-1',
        contactPhone: '+79991234567',
      },
      deps,
    );

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'sendMessage', chatId: 12345 });
    expect(actions[1]).toMatchObject({ type: 'sendMessage', chatId: 99999 });
    expect(String((actions[1] as { text?: string }).text ?? '')).toContain('already has different phone');
  });
});
