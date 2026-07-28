import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runWebappTransactionMock } = vi.hoisted(() => ({ runWebappTransactionMock: vi.fn() }));

vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));
vi.mock('@/infra/db/runWebappSql', () => ({ runWebappTransaction: runWebappTransactionMock }));
vi.mock('@/infra/repos/pgSystemSettings', () => ({ readAdminSystemSettingString: vi.fn() }));

import { createPgBookingEnginePort } from './pgBookingEngine';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('pgBookingEngine physical location palette assignment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serializes concurrent creates, counts inactive physical rows, and excludes Online', async () => {
    const rows = [
      { title: 'Архив', cityCode: 'archive', isActive: false, color: '#111111' },
      { title: 'Онлайн', cityCode: 'online', isActive: true, color: '#EEEEEE' },
    ];
    let lockTail = Promise.resolve();

    runWebappTransactionMock.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const lock = { release: undefined as (() => void) | undefined };
        let lockAcquired = false;
        const previous = lockTail;
        lockTail = new Promise<void>((resolve) => {
          lock.release = resolve;
        });
        const tx = {
          execute: vi.fn(async () => {
            await previous;
            lockAcquired = true;
          }),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(async () => {
                if (!lockAcquired) throw new Error('palette_count_read_without_lock');
                return [
                  {
                    value: rows.filter(
                      (row) =>
                        row.cityCode.toLowerCase() !== 'online' &&
                        row.title.toLocaleLowerCase('ru') !== 'онлайн',
                    ).length,
                  },
                ];
              }),
            })),
          })),
          insert: vi.fn(() => ({
            values: vi.fn((value: Record<string, unknown>) => ({
              returning: vi.fn(async () => {
                rows.push({
                  title: String(value.title),
                  cityCode: String(value.cityCode),
                  isActive: Boolean(value.isActive),
                  color: String(value.color),
                });
                return [{ id: `branch-${rows.length}`, ...value }];
              }),
            })),
          })),
        };
        try {
          return await callback(tx);
        } finally {
          lock.release?.();
        }
      },
    );

    const port = createPgBookingEnginePort();
    const create = (title: string) =>
      port.createPhysicalBranchWithDefaultColor({
        organizationId: ORGANIZATION_ID,
        title,
        cityCode: title.toLowerCase(),
        isActive: true,
        sortOrder: 10,
        physicalPalette: ['#111111', '#222222', '#333333', '#444444', '#555555'],
      });

    const [first, second] = await Promise.all([create('Москва'), create('Казань')]);

    expect([first.color, second.color]).toEqual(['#222222', '#333333']);
    expect(rows.find((row) => row.cityCode === 'online')?.color).toBe('#EEEEEE');
  });
});
